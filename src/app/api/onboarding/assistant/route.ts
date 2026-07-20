import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import * as artifactDAL from "@/lib/artifacts/dal";
import { buildDurableProfileMemory } from "@/lib/profile/memory";
import { getSystemPrompt } from "@/lib/ai/assistant/system-prompt";
import { routeGreeting } from "@/lib/ai/assistant/greetings";
import { getTargetRoleQuestion, getTargetRoleAck } from "@/lib/onboarding/detect-target-role";
import { detectTargetRoleIntent } from "@/lib/onboarding/detect-target-role-llm";
import type { AssistantState } from "@/types/assistant-state";
import { createInitialAssistantState, transitionPhase, markProfileCollected, updateServiceState } from "@/types/assistant-state";
import { handleCoverLetterRequest, isCoverLetterRequest } from "@/lib/ai/assistant/services/cover-letter-handler";
import { buildProfileSummary } from "@/lib/ai/assistant/services/profile-alignment";
import { computeCompletion } from "@/lib/profile/completion-gate";
import { detectOffTopic, generateOffTopicRedirect } from "@/lib/ai/assistant/services/scope-detection";
import { detectInterviewAnswer, storeInterviewQA } from "@/lib/ai/assistant/services/interview-qa-storage";
import { detectRetrievalIntent, findRecentByCompany, findRecentByQuestion, findMostRecentByType, formatArtifactForDisplay } from "@/lib/artifacts/retrieve";
import { detectEditIntent, handleArtifactEditWorkflow } from "@/lib/artifacts/edit";
import { runInferenceSafely } from "@/lib/ai/signals/hook";
import { loadSignalState } from "@/lib/ai/signals/signal-dal";
import { SIGNAL_REGISTRY, PROBE_THRESHOLD } from "@/lib/ai/signals/signal-definitions";

type AssistantRequestBody = {
  message?: string;
  locale?: "en" | "de" | "fr";
  mode?: "normal" | "interviewer";
};

type AnthropicTextContent = {
  type: "text";
  text: string;
};

type AnthropicResponse = {
  content?: AnthropicTextContent[];
  error?: { message?: string };
};

function buildMemoryPromptFragment(
  memory: ReturnType<typeof buildDurableProfileMemory>,
  onboardingSession?: { targetRole?: string | null } | null
): string {
  const qualList = memory.qualifications.map((q) => `${q.category}: ${q.value}`).join(", ") || "none listed";
  
  // Use targetRole from onboarding session if available (user's stated goal)
  // Fallback to primaryRole if target is not yet set (user's current role from CV)
  const targetRole = onboardingSession?.targetRole ?? memory.profile.primaryRole ?? "not yet specified";
  
  return [
    "The user has the following confirmed profile — use it to personalise every answer:",
    `Goal: ${memory.profile.employmentObjective ?? "unknown"}.`,
    `Target role (what they want to become): ${targetRole}.`,
    `Current/Primary role (from CV): ${memory.profile.primaryRole ?? "not listed on CV"}.`,
    `Location: ${memory.profile.preferredLocation ?? "unknown"}.`,
    `Current situation: ${memory.profile.currentJobSituation ?? "unknown"}.`,
    `Contract preference: ${memory.profile.contractPreference ?? "unknown"}.`,
    `Work rate: ${memory.profile.workRate ?? "unknown"}.`,
    `Permit status: ${memory.profile.workPermitStatus ?? "unknown"}.`,
    `Salary expectation: ${memory.profile.salaryExpectation ?? "unknown"}.`,
    `Qualifications: ${qualList}.`,
    "CRITICAL: When the user tells you their desired role/career goal, REMEMBER IT and use that as their target, not their CV role.",
    "Do not re-ask for information already confirmed above. Use it directly when giving advice."
  ].join(" ");
}

/**
 * Build locale-specific instruction for system prompt
 */
function getLocaleInstruction(locale: "en" | "de" | "fr"): string {
  switch (locale) {
    case "de":
      return "Respond in German.";
    case "fr":
      return "Respond in French.";
    default:
      return "Respond in English.";
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as AssistantRequestBody;
  const userMessage = body.message?.trim() ?? "";
  const locale = body.locale ?? "en";
  const mode = body.mode ?? "normal";

  if (!userMessage) {
    return NextResponse.json({ error: "message_required" }, { status: 400 });
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim() || env.ANTHROPIC_API_KEY?.trim();
  const anthropicModel = (process.env.ANTHROPIC_MODEL ?? env.ANTHROPIC_MODEL)
    .replace(/["'`\r\n]/g, "")
    .trim();

  if (!anthropicApiKey) {
    return NextResponse.json({ error: "assistant_not_configured" }, { status: 503 });
  }

  if (!anthropicModel) {
    return NextResponse.json({ error: "assistant_model_not_configured" }, { status: 503 });
  }

  try {
    // ===== STEP 1: Load or initialize session state =====
    const existingProfile = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      include: {
        qualifications: true
      }
    });

    // Load onboarding session separately (can't rely on include if profileId is null)
    let existingOnboardingSession = null;
    if (existingProfile) {
      existingOnboardingSession = await db.onboardingSession.findUnique({
        where: { userId: session.user.id }
      }).catch(() => null);
    }

    console.log("[API Request] User:", session.user.id);
    console.log("[API Request] Profile exists:", !!existingProfile);
    console.log("[API Request] OnboardingSession exists:", !!existingOnboardingSession);
    console.log("[API Request] OnboardingSession targetRole:", existingOnboardingSession?.targetRole);

    let profile = existingProfile;
    let onboardingSession = existingOnboardingSession;
    let state: AssistantState;

    if (!profile) {
      // First time user - create profile with initial state
      const initialState = createInitialAssistantState();
      const newProfile = await db.candidateProfile.create({
        data: {
          userId: session.user.id,
          locale,
          assistantState: JSON.parse(JSON.stringify(initialState))
        },
        include: { qualifications: true }
      });
      profile = newProfile as typeof existingProfile;
      state = initialState;

      // CRITICAL: Create onboarding session linked to profile
      if (profile && !onboardingSession) {
        const newSession = await db.onboardingSession.create({
          data: {
            userId: session.user.id,
            profileId: profile.id,  // LINK TO PROFILE!
            locale,
            currentStep: "cv_upload"
          }
        });
        onboardingSession = newSession;
        console.log("[Profile Creation] Created new onboarding session for user:", session.user.id, "linked to profile:", profile.id);
      }
    } else {
      // Existing user - load state from DB.
      // NOTE: schema default is `{}`, and profiles created via the interactive
      // onboarding route have no assistantState. An empty object is truthy in JS,
      // so we must validate the state has a currentPhase before trusting it.
      const loadedState = profile.assistantState as unknown as AssistantState | null;
      const hasValidState = Boolean(loadedState && loadedState.currentPhase);
      state = hasValidState ? loadedState! : createInitialAssistantState();

      // Persist a freshly initialized state so downstream requests are consistent
      if (!hasValidState) {
        await db.candidateProfile.update({
          where: { id: profile.id },
          data: { assistantState: JSON.parse(JSON.stringify(state)) }
        });
      }
      
      // Ensure onboarding session exists
      if (!onboardingSession) {
        try {
          const newSession = await db.onboardingSession.create({
            data: {
              userId: session.user.id,
              profileId: profile.id,
              locale,
              currentStep: "cv_upload"
            }
          });
          onboardingSession = newSession;
          console.log("[Existing User] Created missing onboarding session for:", session.user.id);
        } catch (err: unknown) {
          // Session might already exist but wasn't found - try to update it and fetch
          if ((err as { code?: string }).code === 'P2002') {
            const existing = await db.onboardingSession.findUnique({
              where: { userId: session.user.id }
            });
            if (existing) {
              onboardingSession = existing;
              // Link to profile if not already linked
              if (!existing.profileId && profile) {
                onboardingSession = await db.onboardingSession.update({
                  where: { userId: session.user.id },
                  data: { profileId: profile.id }
                });
              }
              console.log("[Existing User] Found and linked existing onboarding session to profile");
            }
          }
        }
      }
      
      // Update locale if different
      if (profile && profile.locale !== locale) {
        profile = await db.candidateProfile.update({
          where: { id: profile.id },
          data: { locale },
          include: { qualifications: true }
        });
      }
    }

    // ===== STEP 2: GLOBAL - Check for target role in EVERY message across ALL phases =====
    // This ensures we capture career goals as soon as they're stated, regardless of phase.
    // Detection runs EXACTLY once per request here via the LLM intent detector, which only
    // fires on explicit first-person intent and is practice-safe (D-01, D-04).
    let roleAck: string | null = null;
    const detectedGlobalTargetRole = await detectTargetRoleIntent({
      message: userMessage,
      inPractice: state.services?.interviewPrep?.currentMode === "practice",
      apiKey: anthropicApiKey,
      model: anthropicModel
    });
    if (detectedGlobalTargetRole && onboardingSession) {
      console.log("[GLOBAL] Detected targetRole in message:", detectedGlobalTargetRole);
      try {
        const updatedSession = await db.onboardingSession.update({
          where: { userId: session.user.id },
          data: { targetRole: detectedGlobalTargetRole }
        });
        onboardingSession = updatedSession;
        console.log("[GLOBAL] Updated onboardingSession.targetRole to:", updatedSession.targetRole);
        
        if (profile) {
          await db.candidateProfile.update({
            where: { userId: session.user.id },
            data: { targetRoles: detectedGlobalTargetRole }
          });
          // CRITICAL: Reload profile after update so in-memory object is fresh
          profile = await db.candidateProfile.findUnique({
            where: { userId: session.user.id },
            include: { qualifications: true }
          }) || profile;
          console.log("[GLOBAL] Reloaded profile.targetRoles:", profile.targetRoles);
        }
        // Silent update, then acknowledge in the user's language (D-02).
        roleAck = getTargetRoleAck(locale, detectedGlobalTargetRole);
      } catch (error: unknown) {
        console.error("[GLOBAL] ERROR updating targetRole:", error);
      }
    }

    // ===== STEP 2: Route based on current phase =====
    let answer: string;
    let newState = state;

    // Summary of the candidate's real profile (from CV or manual entry), used to
    // flag cover letters that misrepresent their background.
    const profileSummary = profile
      ? buildProfileSummary(
          profile as Parameters<typeof buildProfileSummary>[0],
          onboardingSession?.targetRole
        )
      : "(no profile details on file yet)";

    // If the user has already finished the structured onboarding, their profile
    // is minimally complete. In that case the AI assistant must NOT re-greet or
    // ask for their name again (that produced a confusing "Welcome... what's your
    // name?" reply right after the "profile is now built" message), and it must
    // NOT stay stuck in profile-collection — otherwise the full service features
    // (cover-letter MEMORY/retrieval, editing/adding, etc.) that only live in the
    // services phase are unreachable. Jump straight to services so their real
    // requests are handled with the complete toolset.
    if (
      (state.currentPhase === "greeting" || state.currentPhase === "profile-collection") &&
      profile &&
      computeCompletion(profile as Parameters<typeof computeCompletion>[0]).isMinimallyComplete
    ) {
      state = transitionPhase(state, "services");
    }

    if (state.currentPhase === "greeting") {
      // Handle greeting
      const greeting = routeGreeting(state, profile || undefined);
      answer = greeting.message;
      // Transition out of greeting phase
      newState = transitionPhase(state, greeting.nextPhase);
    } else if (state.currentPhase === "profile-collection") {
      // Detection + persistence happen once in the GLOBAL block above. Here we only keep
      // the CV-upload clarifying-question flow: if no target role is set yet after a CV
      // upload, ask what role they're targeting.
      if (!onboardingSession?.targetRole && userMessage.length > 10) {
        // If target role is still not set after CV upload, ask for it
        if (onboardingSession?.cvExtractedFacts && Object.keys(onboardingSession.cvExtractedFacts).length > 0) {
          // CV was already extracted, ask what they want to become
          answer = getTargetRoleQuestion(locale);
          newState = state; // Stay in profile-collection until they specify
          
          // Save state and return
          if (profile && state) {
            await db.candidateProfile.update({
              where: { id: profile.id },
              data: { assistantState: JSON.parse(JSON.stringify(newState)) }
            });
          }
          await runInferenceSafely({
            userId: session.user.id,
            newInput: userMessage,
            source: "message",
            cvFacts: onboardingSession?.cvExtractedFacts,
            sessionId: onboardingSession?.id
          });
          return NextResponse.json({ answer });
        }
      }
      
      // ===== CHECK FOR COVER LETTER REQUEST IN PROFILE-COLLECTION PHASE =====
      // Allow users to request cover letters even while collecting profile info
      const isCoverLetterMsg = isCoverLetterRequest(userMessage);

      // Interview requests must be detected here too — otherwise a message like
      // "practice a mock interview" gets greedily caught by the cover letter check
      // below and the user can never enter interview mode from profile-collection.
      const lowerUserMsg = userMessage.toLowerCase();
      const isInterviewMsg =
        !lowerUserMsg.includes("cover letter") &&
        !lowerUserMsg.includes("cover-letter") &&
        (/\b(interview|mock)\b/.test(lowerUserMsg) ||
          (lowerUserMsg.includes("practice") &&
            (lowerUserMsg.includes("question") || lowerUserMsg.includes("interview"))));
      
      // Edit requests ("make it longer", "more formal", etc.) must be checked BEFORE
      // the cover letter check, otherwise "make the cover letter longer" would be
      // treated as a brand-new cover letter request instead of editing the saved one.
      const editIntent = detectEditIntent(userMessage);

      // Retrieval/memory requests ("show me my cover letter for X") must also work
      // here — not just in the services phase — so users still collecting their
      // profile can recall a letter they already generated.
      const retrievalIntent = detectRetrievalIntent(userMessage);

      if (retrievalIntent.isRetrievalRequest && !isInterviewMsg) {
        try {
          if (retrievalIntent.requestType === "company" && retrievalIntent.query) {
            const artifact =
              (await findRecentByCompany(session.user.id, retrievalIntent.query)) ??
              (await findMostRecentByType(session.user.id, "cover_letter"));
            answer = artifact
              ? formatArtifactForDisplay(artifact)
              : `I don't have a saved cover letter or job posting for ${retrievalIntent.query} in my memory yet. 🤔\n\nWould you like me to help you create one? Just tell me the job details and I'll draft it for you! 📝✨`;
          } else if (retrievalIntent.requestType === "question" && retrievalIntent.query) {
            const artifact = await findRecentByQuestion(session.user.id, retrievalIntent.query);
            answer = artifact
              ? formatArtifactForDisplay(artifact)
              : `I don't have that interview answer saved yet. 🤔 Want to practice that question, or see your other saved answers? 😊`;
          } else {
            // No specific company/question named — recall the most recent cover letter.
            const recent = await findMostRecentByType(session.user.id, "cover_letter");
            answer = recent
              ? formatArtifactForDisplay(recent)
              : `I'd love to pull that up! Could you tell me the company name (for a cover letter or job posting) or the question/topic (for an interview answer)? 📝✨`;
          }
        } catch (error) {
          console.error("[Profile Collection] Error retrieving artifact:", error);
          answer = `Sorry, I had trouble looking that up. 😅 Could you try again with a bit more detail? 💬`;
        }
        newState = state;
      } else if (editIntent.detected) {
        try {
          answer = await handleArtifactEditWorkflow(
            session.user.id,
            editIntent,
            anthropicApiKey,
            anthropicModel,
            profileSummary
          );
        } catch (error) {
          console.error("[Profile Collection] Error in edit workflow:", error);
          answer = `Oops! I ran into a technical issue while editing. 😅 Could you try again? Maybe rephrase what you'd like me to change?`;
        }
        newState = state;
      } else if (isInterviewMsg) {
        // Interview prep requested during profile collection: start the mock interview
        // now and transition into the services phase so follow-up turns are handled by
        // the full interview logic there.
        const localeInstruction = getLocaleInstruction(locale);
        const interviewTargetRole = onboardingSession?.targetRole ?? profile?.primaryRole ?? "the target role";
        const interviewSystemPrompt = `You are a professional interview coach conducting a realistic mock interview.

The user wants to practice interviewing for ${interviewTargetRole} positions. Start the mock interview NOW in PROFESSIONAL HIRING MANAGER MODE 👔. Do NOT recap services or ask what they want to do.
1. Briefly acknowledge the target role.
2. List 3 competencies you'll focus on for this role.
3. Ask the FIRST interview question based on their target role and profile, then wait for their answer.
For each subsequent answer, give concise feedback (strengths, improvements, a stronger example) using the STAR method, then ask the next question. Keep a realistic, professional tone with minimal emojis.

${localeInstruction}`;
        answer = await callAnthropicAssistant({
          userMessage: `Help me prepare for interviews for ${interviewTargetRole} positions. ${userMessage}`,
          systemPrompt: interviewSystemPrompt,
          anthropicApiKey,
          anthropicModel,
          profileMemory: profile ? buildDurableProfileMemory({
            profile,
            qualifications: profile.qualifications,
            onboardingSession
          }) : undefined,
          onboardingSession
        });
        // Move into the services phase in interview practice mode so subsequent messages
        // continue the interview via the full services-phase interview handler.
        newState = updateServiceState(transitionPhase(state, "services"), "interview-prep", { currentMode: "practice" });
      } else if (isCoverLetterMsg) {
        const result = await handleCoverLetterRequest(
          userMessage,
          profile!,
          state,
          undefined,
          anthropicApiKey,
          anthropicModel,
          profileSummary
        );
        answer = result.answer;
        newState = result.newState;

        // Auto-save cover letter to artifacts
        if (result.artifactData) {
          try {
            await artifactDAL.store(
              session.user.id,
              'cover_letter',
              result.artifactData.content,
              {
                company: result.artifactData.company,
                jobTitle: result.artifactData.jobTitle,
                source: 'ai_generated'
              }
            );
            console.log("[Profile Collection] Auto-saved cover letter for:", result.artifactData.company);
          } catch (error) {
            console.error("[Profile Collection] Failed to store cover letter artifact:", error);
          }
        }
      } else {
        // Handle normal profile collection with Claude
        const systemPrompt = getSystemPrompt("profile", mode);
        const localeInstruction = getLocaleInstruction(locale);
        
        answer = await callAnthropicAssistant({
          userMessage,
          systemPrompt: `${systemPrompt}\n\n${localeInstruction}`,
          anthropicApiKey,
          anthropicModel,
          profileMemory: profile ? buildDurableProfileMemory({
            profile,
            qualifications: profile.qualifications,
            onboardingSession: onboardingSession  // Use the separately-loaded session, not profile.onboardingSession
          }) : undefined,
          onboardingSession: onboardingSession  // Also pass the correct session object
        });
        
        // Check if user has provided their name - if so, mark profile as started
        if (userMessage.length > 0) {
          newState = markProfileCollected(state);
          // Update profile with name if detected
          const nameMatch = userMessage.match(/(?:I'm|My name is|I am)\s+([A-Za-z\s]+)/i);
          if (nameMatch?.[1] && profile) {
            profile = await db.candidateProfile.update({
              where: { id: profile.id },
              data: { fullName: nameMatch[1].trim() },
              include: { qualifications: true, onboardingSession: true }
            });
          }
        }
      }
    } else if (state.currentPhase === "services") {
      console.log("[DEBUG] In services phase. Message:", userMessage.substring(0, 100));
      
      // Target-role detection + persistence happen once in the GLOBAL block above.
      // Check for off-topic queries first (Wave 5)
      const offTopicDetection = detectOffTopic(userMessage);
      console.log("[DEBUG] Off-topic detection:", offTopicDetection.isOffTopic);

      // Interview intent must take priority over the cover-letter / CV branches,
      // which greedily match role words ("software engineer") and hijack messages
      // like "aws for software engineer, lets start the interview". Also true once
      // we are already in an active mock-interview (practice) so plain answers
      // continue the interview instead of being treated as cover-letter requests.
      const servicesLowerMsg = userMessage.toLowerCase();

      // A lingering interview "practice" mode must NOT permanently hijack every
      // message. It is only cleared after Q3 is ANSWERED, so a user who abandons a
      // mock (or gets Q3 asked but never answers) stays in practice mode forever —
      // and every message that doesn't literally contain "cover letter" is routed
      // to the interview handler, making the whole cover-letter toolset (resize,
      // tone, proofread, add/remove, strengthen, word-count) unreachable. When the
      // user clearly wants an artifact service (generate/retrieve/edit a cover
      // letter), treat that as leaving the interview: route to the service AND clear
      // the stale practice mode so subsequent short edit commands work too.
      const wantsArtifactService =
        isCoverLetterRequest(userMessage) ||
        detectRetrievalIntent(userMessage).isRetrievalRequest ||
        detectEditIntent(userMessage).detected;

      const explicitInterviewRequest =
        /\b(interview|mock)\b/.test(servicesLowerMsg) ||
        (servicesLowerMsg.includes("practice") &&
          (servicesLowerMsg.includes("question") || servicesLowerMsg.includes("interview")));

      const lingeringPractice = state.services?.interviewPrep?.currentMode === "practice";

      const isServicesInterviewMsg =
        !servicesLowerMsg.includes("cover letter") &&
        !servicesLowerMsg.includes("cover-letter") &&
        (explicitInterviewRequest || (lingeringPractice && !wantsArtifactService));

      // Exit a stale interview when the user switches to an artifact service, so the
      // stale practice mode no longer captures follow-up edit commands.
      if (lingeringPractice && wantsArtifactService && !explicitInterviewRequest) {
        state = updateServiceState(state, "interview-prep", { currentMode: undefined });
        newState = state;
      }

      if (!isServicesInterviewMsg && offTopicDetection.isOffTopic) {
        answer = generateOffTopicRedirect(offTopicDetection.category);
        newState = state; // Don't change state for off-topic
      } else if (!isServicesInterviewMsg && detectRetrievalIntent(userMessage).isRetrievalRequest) {
        console.log("[DEBUG] Matched retrieval intent");
        // Wave 1A: Artifact Retrieval - check before generating new content
        const retrievalIntent = detectRetrievalIntent(userMessage);
        
        try {
          if (retrievalIntent.requestType === 'company' && retrievalIntent.query) {
            // User asking for cover letter or job posting by company. Fall back to the
            // most recent cover letter when no company match is found (memory recall).
            const artifact =
              (await findRecentByCompany(session.user.id, retrievalIntent.query)) ??
              (await findMostRecentByType(session.user.id, 'cover_letter'));
            if (artifact) {
              answer = formatArtifactForDisplay(artifact);
              newState = state;
            } else {
              // No artifact found - offer to create one
              answer = `I don't have a saved cover letter or job posting for ${retrievalIntent.query} in my memory yet. 🤔 

Would you like me to help you create one? Just let me know the job details and I'll draft it for you! 📝✨`;
              newState = state;
            }
          } else if (retrievalIntent.requestType === 'question' && retrievalIntent.query) {
            // User asking for past interview answer
            const artifact = await findRecentByQuestion(session.user.id, retrievalIntent.query);
            if (artifact) {
              answer = formatArtifactForDisplay(artifact);
              newState = state;
            } else {
              answer = `I don't have that interview answer saved yet. 🤔 

Would you like to:
🎤 **Practice that question again** (I'll ask it and we can work on your answer)
📝 **See your other saved answers** (for different questions)
✨ **Start fresh** (let's tackle a new question)

What sounds good? 😊`;
              newState = state;
            }
          } else {
            // Generic retrieval request without a specific query — recall the most
            // recent cover letter from memory rather than asking for a company.
            const recent = await findMostRecentByType(session.user.id, 'cover_letter');
            if (recent) {
              answer = formatArtifactForDisplay(recent);
              newState = state;
            } else {
              answer = `I'd love to help you find something! Could you tell me:
📋 **For a cover letter or job posting:** The company name
🎤 **For an interview answer:** The question or topic

Then I can pull it right up! 📝✨`;
              newState = state;
            }
          }
        } catch (error) {
          console.error("Error retrieving artifact:", error);
          answer = `Sorry, I had trouble looking that up. 😅 Could you try asking again or provide more details? 💬`;
          newState = state;
        }
      } else if (!isServicesInterviewMsg && detectEditIntent(userMessage).detected) {
        // Wave 1B: Artifact Editing — route through the SHARED full edit workflow
        // (same as the profile-collection phase). This restores the complete command
        // set in the services phase: resize (longer/shorter with word targets), switch
        // tone, proofread a pasted/another letter, add/remove content about a subject,
        // strengthen, simplify, and translate — including editing a letter the user
        // pasted inline rather than only the last saved artifact.
        const editIntent = detectEditIntent(userMessage);
        try {
          answer = await handleArtifactEditWorkflow(
            session.user.id,
            editIntent,
            anthropicApiKey,
            anthropicModel,
            profileSummary
          );
        } catch (error) {
          console.error("Error in edit workflow:", error);
          answer = `Oops! I ran into a technical issue while editing. 😅 Could you try again? Maybe rephrase what you'd like me to change?`;
        }
        newState = state;
      } else if (isCoverLetterRequest(userMessage) && !isServicesInterviewMsg) {
        // Wave 2: Cover Letter Service
        const result = await handleCoverLetterRequest(
          userMessage,
          profile!,
          state,
          undefined, // cvData could be loaded from profile if available
          anthropicApiKey,
          anthropicModel,
          profileSummary
        );
        answer = result.answer;
        newState = result.newState;

        // Auto-save cover letter to artifacts
        if (result.artifactData) {
          try {
            await artifactDAL.store(
              session.user.id,
              'cover_letter',
              result.artifactData.content,
              {
                company: result.artifactData.company,
                jobTitle: result.artifactData.jobTitle,
                source: 'ai_generated'
              }
            );
          } catch (error) {
            console.error("Failed to store cover letter artifact:", error);
            // Don't fail the request - artifact storage is optional
          }
        }
      } else if (
        !isServicesInterviewMsg && (
          userMessage.toLowerCase().includes("cv") ||
          userMessage.toLowerCase().includes("resume") ||
          userMessage.toLowerCase().includes("improve") ||
          userMessage.toLowerCase().includes("enhancement")
        )
      ) {
        // Wave 3: CV Enhancement Service
        // For now, use Claude directly, but structure for local analysis
        const systemPrompt = getSystemPrompt("services", mode);
        const localeInstruction = getLocaleInstruction(locale);
        answer = await callAnthropicAssistant({
          userMessage,
          systemPrompt: `${systemPrompt}\n\nThe user is asking for CV improvement advice. Provide specific, actionable suggestions.\n\n${localeInstruction}`,
          anthropicApiKey,
          anthropicModel,
          profileMemory: profile ? buildDurableProfileMemory({
            profile,
            qualifications: profile.qualifications,
            onboardingSession: onboardingSession  // Use the separately-loaded session, not profile.onboardingSession
          }) : undefined,
          onboardingSession: onboardingSession  // Also use the correct session object
        });
        newState = state;
      } else if (
        userMessage.toLowerCase().includes("interview") ||
        userMessage.toLowerCase().includes("mock") ||
        userMessage.toLowerCase().includes("practice") ||
        userMessage.toLowerCase().includes("question") ||
        userMessage.toLowerCase().includes("ready") ||
        userMessage.toLowerCase().includes("let's go") ||
        userMessage.toLowerCase().includes("let's start") ||
        userMessage.toLowerCase().includes("begin") ||
        userMessage.toLowerCase().includes("im ready") ||
        userMessage.toLowerCase().includes("i'm ready") ||
        userMessage.toLowerCase().includes("start the") ||
        userMessage.toLowerCase().includes("just start") ||
        userMessage.toLowerCase().includes("go ahead") ||
        // Already mid-interview: any answer should continue the interview.
        state.services?.interviewPrep?.currentMode === "practice"
      ) {
        // Wave 4: Interview Preparation Service — STRUCTURED 3-QUESTION MOCK.
        // Exactly 3 questions per interview: Q1 technical, Q2 technical, Q3
        // behavioral, with feedback after every answer. This is the only way the
        // prototype assistant conducts interviews.
        const localeInstruction = getLocaleInstruction(locale);
        const targetRole = onboardingSession?.targetRole ?? profile?.primaryRole ?? "the target role";
        const inPractice = state.services?.interviewPrep?.currentMode === "practice";
        const prevAsked = state.services?.interviewPrep?.questionsAsked ?? 0;

        // Hidden objective: tailor each question to surface evidence for the
        // signals that are still uncertain, so the 3-question mock ends with every
        // trait assessed. Computed from the live signal state (which already
        // reflects the previous answer's inference).
        const coverageInstruction = await buildSignalCoverageInstruction(session.user.id);

        const STRUCTURE =
          "STRUCTURED MOCK INTERVIEW RULES: There are EXACTLY 3 questions total — " +
          "Question 1 = TECHNICAL, Question 2 = TECHNICAL, Question 3 = BEHAVIORAL. " +
          "Ask ONLY ONE question per turn. Never ask more than 3 questions in the whole interview. " +
          "Always label the question as \"Question N of 3 (Technical|Behavioral)\".";

        let systemPromptForInterview: string;
        let processedMessage: string;
        let nextQuestionsAsked: number;
        let nextMode: "practice" | undefined;

        if (!inPractice) {
          // START of a fresh interview — ask Question 1 (technical). No feedback
          // yet because there is no prior answer.
          systemPromptForInterview = `You are a professional hiring manager running a focused mock interview for ${targetRole}.
${STRUCTURE}

This is the START of the interview. Do NOT ask the user what they want to do. Do NOT recap services.
1. In 1-2 short lines, acknowledge the target role and that this is a focused 3-question mock (2 technical, then 1 behavioral).
2. Ask QUESTION 1 of 3 (TECHNICAL): a concrete technical question relevant to ${targetRole} and the user's background.
3. Label it exactly "Question 1 of 3 (Technical)", then STOP and wait for their answer.
Do NOT give feedback (there is no answer yet). Do NOT ask more than one question. Professional tone, minimal emojis.

${localeInstruction}`;
          processedMessage = `Start the structured 3-question mock interview now. Ask Question 1 of 3 (technical) for a ${targetRole} role, based on my profile.`;
          nextQuestionsAsked = 1;
          nextMode = "practice";
        } else if (prevAsked <= 1) {
          // User answered Q1 → feedback + Question 2 (technical).
          systemPromptForInterview = `You are a professional hiring manager running a focused mock interview for ${targetRole}.
${STRUCTURE}

The user just answered QUESTION 1 (technical); their answer is below.
RESPOND IN THIS EXACT ORDER:
1. FEEDBACK on their answer — specific strengths (reference the ACTUAL content), what to improve, and a brief stronger example using STAR (Situation, Task, Action, Result).
2. Then ask QUESTION 2 of 3 (TECHNICAL): a DIFFERENT technical question for ${targetRole}. Label it exactly "Question 2 of 3 (Technical)", then STOP and wait.
Do NOT ask more than one question. Do NOT restart the interview. Professional tone, minimal emojis.

${localeInstruction}`;
          processedMessage = `Here is my answer to Question 1 (technical): "${userMessage}". Give me feedback on it, then ask Question 2 of 3 (technical).`;
          nextQuestionsAsked = 2;
          nextMode = "practice";
        } else if (prevAsked === 2) {
          // User answered Q2 → feedback + Question 3 (behavioral, the last one).
          systemPromptForInterview = `You are a professional hiring manager running a focused mock interview for ${targetRole}.
${STRUCTURE}

The user just answered QUESTION 2 (technical); their answer is below.
RESPOND IN THIS EXACT ORDER:
1. FEEDBACK on their answer — specific strengths (reference the ACTUAL content), what to improve, and a brief stronger example using STAR.
2. Then ask QUESTION 3 of 3 (BEHAVIORAL): a behavioral question for ${targetRole}. Label it exactly "Question 3 of 3 (Behavioral)", then STOP and wait.
This is the FINAL question. Do NOT ask more than one question. Professional tone, minimal emojis.

${localeInstruction}`;
          processedMessage = `Here is my answer to Question 2 (technical): "${userMessage}". Give me feedback on it, then ask Question 3 of 3 (behavioral).`;
          nextQuestionsAsked = 3;
          nextMode = "practice";
        } else {
          // User answered Q3 (behavioral) → final feedback + wrap-up, then CLOSE.
          systemPromptForInterview = `You are a professional hiring manager wrapping up a focused 3-question mock interview for ${targetRole}.
${STRUCTURE}

The user just answered the FINAL question (Question 3, behavioral); their answer is below.
RESPOND IN THIS EXACT ORDER:
1. FEEDBACK on their answer — specific strengths (reference the ACTUAL content), what to improve, and a brief stronger example using STAR.
2. Then give a SHORT overall wrap-up of the whole 3-question mock: 2-3 key strengths, 2-3 focus areas, and 1-2 concrete next steps.
3. Clearly state the mock interview is COMPLETE. Do NOT ask another question. Invite them to start another mock or work on their CV / cover letter.
Professional tone, minimal emojis.

${localeInstruction}`;
          processedMessage = `Here is my answer to Question 3 (behavioral): "${userMessage}". Give me feedback and a final wrap-up. The 3-question mock is now complete — do not ask another question.`;
          nextQuestionsAsked = 3;
          nextMode = undefined; // exit practice mode — interview finished
        }

        answer = await callAnthropicAssistant({
          userMessage: processedMessage,
          systemPrompt: systemPromptForInterview + coverageInstruction,
          anthropicApiKey,
          anthropicModel,
          profileMemory: profile ? buildDurableProfileMemory({
            profile,
            qualifications: profile.qualifications,
            onboardingSession
          }) : undefined,
          onboardingSession
        });
        // Persist how many questions have been asked and whether we are still
        // mid-interview, so the next answer is routed to the correct stage.
        newState = updateServiceState(state, "interview-prep", {
          currentMode: nextMode,
          questionsAsked: nextQuestionsAsked,
          lastPracticeAt: new Date().toISOString()
        });
      } else {
        // Default: General career coaching
        const systemPrompt = getSystemPrompt("services", mode);
        const localeInstruction = getLocaleInstruction(locale);
        
        answer = await callAnthropicAssistant({
          userMessage,
          systemPrompt: `${systemPrompt}\n\n${localeInstruction}`,
          anthropicApiKey,
          anthropicModel,
          profileMemory: profile ? buildDurableProfileMemory({
            profile,
            qualifications: profile.qualifications,
            onboardingSession
          }) : undefined,
          onboardingSession
        });
        newState = state;
      }
    } else {
      // Default to services phase fallback
      const systemPrompt = getSystemPrompt("services", mode);
      const localeInstruction = getLocaleInstruction(locale);
      
      answer = await callAnthropicAssistant({
        userMessage,
        systemPrompt: `${systemPrompt}\n\n${localeInstruction}`,
        anthropicApiKey,
        anthropicModel,
        profileMemory: profile ? buildDurableProfileMemory({
          profile,
          qualifications: profile.qualifications,
          onboardingSession
        }) : undefined,
        onboardingSession
      });
    }

    // ===== STEP 3: Auto-save interview Q&A if detected =====
    if (state.currentPhase === "services" && state.services?.interviewPrep?.currentMode === "practice") {
      // Try to detect if user answered an interview question
      // Note: We need previous message to detect this properly
      // For now, detect based on interview keywords and store opportunistically
      const isLikelyInterviewAnswer = (
        (userMessage.length > 50) && 
        !userMessage.toLowerCase().startsWith("show me") &&
        !userMessage.toLowerCase().startsWith("remind") &&
        (state.services?.interviewPrep?.practiceHistory?.length ?? 0) > 0
      );

      if (isLikelyInterviewAnswer && (state.services?.interviewPrep?.practiceHistory?.length ?? 0) > 0) {
        try {
          // Get the last question from practice history
          const lastEntry = state.services.interviewPrep!.practiceHistory![
            state.services.interviewPrep!.practiceHistory!.length - 1
          ];
          
          if (lastEntry && !lastEntry.userAnswer) {
            // Store this answer to artifacts
            await storeInterviewQA(session.user.id, {
              question: lastEntry.question,
              answer: userMessage,
              sessionId: state.services.interviewPrep.mockInterviewState?.startedAt
            });
            // Signal inference for this answer runs via the awaited main hook below.
          }
        } catch (error) {
          console.error("Failed to auto-save interview Q&A:", error);
          // Don't fail the request - artifact storage is optional
        }
      }
    }

    // ===== STEP 4: Persist state changes and locale preference =====
    if (profile) {
      // Save updated assistant state if it changed
      if (newState && newState !== state) {
        console.log("[State Persistence] Saving newState:", newState.currentPhase);
        await db.candidateProfile.update({
          where: { id: profile.id },
          data: { assistantState: JSON.parse(JSON.stringify(newState)) }
        });
      }
      
      // Update locale if needed
      if (profile.locale !== locale) {
        await db.candidateProfile.update({
          where: { id: profile.id },
          data: { locale }
        });
      }
    }

    // Await inference so the signal state reliably persists before we respond.
    // runInferenceSafely never throws, so this cannot break the user request.
    await runInferenceSafely({
      userId: session.user.id,
      newInput: userMessage,
      source: "message",
      cvFacts: onboardingSession?.cvExtractedFacts,
      sessionId: onboardingSession?.id
    });

    // Prepend the localized acknowledgement once, at the final return site, so it survives
    // any branch that assigned `answer` wholesale (D-02).
    if (roleAck) {
      answer = `${roleAck}\n\n${answer}`;
    }

    return NextResponse.json({ answer });
  } catch (error) {
    console.error("Assistant error:", error);
    return NextResponse.json({ error: "assistant_unavailable" }, { status: 502 });
  }
}

/**
 * Build a hidden "signal coverage" instruction for the interviewer.
 *
 * Loads the candidate's current signal state and lists the traits that are still
 * below the probe threshold, so the generated question is deliberately tailored
 * to surface evidence for them — without ever revealing the analysis to the
 * candidate. The goal is that by the end of the 3-question mock every trait has
 * been assessed. Returns "" on any failure (never blocks the interview).
 */
async function buildSignalCoverageInstruction(userId: string): Promise<string> {
  let priorSignals;
  try {
    priorSignals = await loadSignalState(userId);
  } catch {
    return "";
  }

  const byKey = new Map(priorSignals.map((s) => [s.key, s]));
  const gaps = SIGNAL_REGISTRY.filter((def) => {
    const s = byKey.get(def.key);
    return !s || s.confidence < PROBE_THRESHOLD;
  });

  if (gaps.length === 0) {
    return "";
  }

  const gapList = gaps.map((d) => `- ${d.name}: ${d.description}`).join("\n");

  return [
    "",
    "HIDDEN ANALYTICAL OBJECTIVE (do NOT reveal this; never mention 'signals', 'traits', 'profiling', or that you are analyzing them):",
    "Beyond coaching, you are silently reading the candidate's underlying professional personality. The traits below are still UNCERTAIN. Deliberately craft THIS question so that an honest, natural answer would reveal evidence about as many of them as possible — while still sounding like a normal, role-relevant interview question a real hiring manager would ask.",
    gapList,
    "Weave the probe in naturally: ask about concrete choices, motivations, trade-offs, follow-through over time, or how they handled pressure/conflict. Prefer a question that elicits WHY they did something and HOW they felt, not just WHAT they built. Keep it to a SINGLE natural question — never list these topics or interrogate.",
  ].join("\n");
}

/**
 * Call Anthropic API with system prompt and user message
 */
async function callAnthropicAssistant({
  userMessage,
  systemPrompt,
  anthropicApiKey,
  anthropicModel,
  profileMemory,
  onboardingSession
}: {
  userMessage: string;
  systemPrompt: string;
  anthropicApiKey: string;
  anthropicModel: string;
  profileMemory?: ReturnType<typeof buildDurableProfileMemory>;
  onboardingSession?: { targetRole?: string | null } | null;
}): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // Increased timeout for large inputs

  try {
    const fullSystemPrompt = profileMemory
      ? `${systemPrompt}\n\n${buildMemoryPromptFragment(profileMemory, onboardingSession)}`
      : systemPrompt;

    // Determine max tokens based on content size
    // Large job postings need more tokens for comprehensive responses
    // Use a high token limit to avoid truncating cover letters, mock interviews, and detailed responses
    const maxTokens = 4096;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: anthropicModel,
        max_tokens: maxTokens,
        system: fullSystemPrompt.trim(),
        messages: [{ role: "user", content: userMessage }]
      }),
      signal: controller.signal,
      cache: "no-store"
    });

    const data = (await response.json()) as AnthropicResponse;

    if (!response.ok) {
      const errorMessage = data.error?.message ?? `HTTP ${response.status}`;
      console.error(`Anthropic API error: ${errorMessage}`, {
        status: response.status,
        messageLength: userMessage.length,
        systemPromptLength: fullSystemPrompt.length
      });
      throw new Error(`Anthropic error ${response.status}: ${errorMessage}`);
    }

    const answer = data.content?.find((part) => part.type === "text")?.text?.trim();

    if (!answer) {
      throw new Error("Empty response from Anthropic");
    }

    return answer;
  } finally {
    clearTimeout(timeout);
  }
}
