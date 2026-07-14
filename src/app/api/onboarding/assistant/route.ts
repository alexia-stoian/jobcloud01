import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { buildDurableProfileMemory } from "@/lib/profile/memory";
import { getSystemPrompt } from "@/lib/ai/assistant/system-prompt";
import { routeGreeting } from "@/lib/ai/assistant/greetings";
import { detectTargetRoleFromMessage, getTargetRoleQuestion } from "@/lib/onboarding/detect-target-role";
import type { AssistantState } from "@/types/assistant-state";
import { createInitialAssistantState, transitionPhase, markProfileCollected } from "@/types/assistant-state";
import { handleCoverLetterRequest, isCoverLetterRequest } from "@/lib/ai/assistant/services/cover-letter-handler";
import { detectOffTopic, generateOffTopicRedirect } from "@/lib/ai/assistant/services/scope-detection";

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
        qualifications: true,
        onboardingSession: true
      }
    });

    console.log("[API Request] User:", session.user.id);
    console.log("[API Request] Profile exists:", !!existingProfile);
    console.log("[API Request] OnboardingSession exists:", !!existingProfile?.onboardingSession);
    console.log("[API Request] OnboardingSession targetRole:", existingProfile?.onboardingSession?.targetRole);
    console.log("[API Request] Full OnboardingSession:", JSON.stringify(existingProfile?.onboardingSession, null, 2));

    let profile = existingProfile;
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
        include: { qualifications: true, onboardingSession: true }
      });
      profile = newProfile as typeof existingProfile;
      state = initialState;

      // CRITICAL: Create onboarding session if it doesn't exist
      if (!profile.onboardingSession) {
        const newSession = await db.onboardingSession.create({
          data: {
            userId: session.user.id,
            locale,
            currentStep: "cv_upload"
          }
        });
        // Reload profile to include the new session
        profile = await db.candidateProfile.findUnique({
          where: { userId: session.user.id },
          include: { qualifications: true, onboardingSession: true }
        });
        console.log("[Profile Creation] Created new onboarding session for user:", session.user.id);
      }
    } else {
      // Existing user - load state from DB
      state = (profile.assistantState as unknown as AssistantState) || createInitialAssistantState();
      // Update locale if different
      if (profile.locale !== locale) {
        profile = await db.candidateProfile.update({
          where: { id: profile.id },
          data: { locale },
          include: { qualifications: true, onboardingSession: true }
        });
      }
    }

    // ===== STEP 2: Route based on current phase =====
    let answer: string;
    let newState = state;

    if (state.currentPhase === "greeting") {
      // Handle greeting
      const greeting = routeGreeting(state, profile || undefined);
      answer = greeting.message;
      // Transition out of greeting phase
      newState = transitionPhase(state, greeting.nextPhase);
    } else if (state.currentPhase === "profile-collection") {
      // Check if user is stating a target role (career goal)
      const detectedTargetRole = detectTargetRoleFromMessage(userMessage);
      
      // If target role is detected or not yet set, update it
      if (detectedTargetRole && profile?.onboardingSession) {
        profile = await db.candidateProfile.update({
          where: { id: profile.id },
          data: {
            onboardingSession: {
              update: {
                targetRole: detectedTargetRole
              }
            }
          },
          include: { qualifications: true, onboardingSession: true }
        });
        console.log("[Target Role Detection] Updated targetRole to:", detectedTargetRole);
      } else if (!profile?.onboardingSession?.targetRole && userMessage.length > 10) {
        // If target role is still not set after CV upload, ask for it
        if (profile?.onboardingSession?.cvExtractedFacts && Object.keys(profile.onboardingSession.cvExtractedFacts).length > 0) {
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
          return NextResponse.json({ answer });
        }
      }
      
      // Handle profile collection with Claude
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
          onboardingSession: profile.onboardingSession
        }) : undefined,
        onboardingSession: profile?.onboardingSession
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
    } else if (state.currentPhase === "services") {
      // ===== CHECK FOR TARGET ROLE IN EVERY MESSAGE =====
      // This ensures that even if user mentions a career goal in the services phase,
      // we capture it (e.g., "give me PM interview questions")
      const detectedTargetRole = detectTargetRoleFromMessage(userMessage);
      if (detectedTargetRole && profile?.onboardingSession) {
        console.log("[Service Phase] Detected targetRole:", detectedTargetRole);
        
        // Step 1: Update onboarding session directly
        const updatedSession = await db.onboardingSession.update({
          where: { userId: session.user.id },
          data: { targetRole: detectedTargetRole }
        });
        console.log("[Service Phase] Updated onboardingSession.targetRole to:", updatedSession.targetRole);
        
        // Step 2: Update profile's targetRoles field too
        await db.candidateProfile.update({
          where: { userId: session.user.id },
          data: { targetRoles: detectedTargetRole }
        });
        
        // Step 3: Reload the entire profile to get fresh data
        profile = await db.candidateProfile.findUnique({
          where: { userId: session.user.id },
          include: {
            qualifications: true,
            onboardingSession: true
          }
        });
        console.log("[Service Phase] Reloaded profile, session.targetRole now:", profile?.onboardingSession?.targetRole);
      }
      
      // Check for off-topic queries first (Wave 5)
      const offTopicDetection = detectOffTopic(userMessage);
      if (offTopicDetection.isOffTopic) {
        answer = generateOffTopicRedirect(offTopicDetection.category);
        newState = state; // Don't change state for off-topic
      } else if (isCoverLetterRequest(userMessage)) {
        // Wave 2: Cover Letter Service
        const result = await handleCoverLetterRequest(
          userMessage,
          profile!,
          state,
          undefined, // cvData could be loaded from profile if available
          anthropicApiKey,
          anthropicModel
        );
        answer = result.answer;
        newState = result.newState;
      } else if (
        userMessage.toLowerCase().includes("cv") ||
        userMessage.toLowerCase().includes("resume") ||
        userMessage.toLowerCase().includes("improve") ||
        userMessage.toLowerCase().includes("enhancement")
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
            onboardingSession: profile.onboardingSession
          }) : undefined,
          onboardingSession: profile?.onboardingSession
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
        userMessage.toLowerCase().includes("go ahead")
      ) {
        // Wave 4: Interview Preparation Service
        // Check if this looks like a readiness signal for an already-planned interview
        const isReadinessSignal = (
          userMessage.toLowerCase().includes("ready") ||
          userMessage.toLowerCase().includes("let's go") ||
          userMessage.toLowerCase().includes("let's start") ||
          userMessage.toLowerCase().includes("begin") ||
          userMessage.toLowerCase().includes("im ready") ||
          userMessage.toLowerCase().includes("i'm ready") ||
          userMessage.toLowerCase().includes("start the") ||
          userMessage.toLowerCase().includes("just start") ||
          userMessage.toLowerCase().includes("go ahead")
        ) && userMessage.length < 100; // Short message = likely a readiness signal
        const localeInstruction = getLocaleInstruction(locale);
        
        // Check if user provided a job posting (usually long text with role/company info)
        const isJobPosting = userMessage.length > 200 && (
          userMessage.toLowerCase().includes("responsibility") ||
          userMessage.toLowerCase().includes("requirement") ||
          userMessage.toLowerCase().includes("experience") ||
          userMessage.toLowerCase().includes("skill") ||
          userMessage.toLowerCase().includes("bachelor") ||
          userMessage.toLowerCase().includes("manager") ||
          userMessage.toLowerCase().includes("engineer")
        );

        let systemPromptForInterview: string;
        let processedMessage: string;

        if (isReadinessSignal) {
          // User is signaling they're ready - start the mock interview immediately
          systemPromptForInterview = `You are a professional interview coach conducting a realistic mock interview.

CRITICAL: The user has indicated they are READY TO START. Do NOT ask what they want to do. Do NOT recap services. START THE INTERVIEW IMMEDIATELY.

YOUR TASK RIGHT NOW:
1. Use the user's profile information (target role, location, background, skills) that you have access to
2. Start the mock interview in PROFESSIONAL HIRING MANAGER MODE 👔
3. Ask the FIRST INTERVIEW QUESTION based on their target role
4. Use a formal, realistic tone - minimal emojis
5. Wait for their answer

INTERVIEW FLOW:
- Question 1: "Tell me about yourself and why you're interested in this role"
- For each answer they give: provide feedback (strengths, improvements, examples)
- Ask 10-12 total questions covering behavioral, technical, and closing
- After all questions: provide comprehensive feedback and action plan

IMPORTANT: Skip all the setup/selection screens. Just START with the first question now.

${localeInstruction}`;

          // Process the message to indicate they're ready
          processedMessage = `The user has indicated they are ready to begin the mock interview. Start immediately with the first interview question based on their target role. Do not ask what they want to do. Interview them on their target role.`;
        } else if (isJobPosting) {
          // Job posting was provided - extract key info and generate targeted questions
          systemPromptForInterview = `You are an expert interview coach. The user has provided a job posting or role description.

YOUR TASK:
1. Extract the 3-5 most critical skills/experiences needed for this role
2. Create 3 targeted interview questions that will help them prepare for this specific role
3. For each question, explain why it's important for this role
4. Start by acknowledging what role they're interviewing for
5. Then ask the first question and wait for their answer

Format your response:
- Start with: "Great! I can see you're targeting [ROLE] at [COMPANY if mentioned]. Here's what I'll focus on:"
- List the key competencies: "Key areas to prep: 1) [competency], 2) [competency], etc."
- Then ask: "Let's start with question 1: [specific question based on job posting]"
- Wait for their answer before asking the next question

${localeInstruction}`;
          
          // The message itself is the job posting - Claude will analyze it
          processedMessage = userMessage;
        } else {
          // General interview prep (no specific job posting)
          systemPromptForInterview = `You are a professional interview coach helping job seekers prepare for interviews.

Your role:
- Ask practice interview questions relevant to the user's target role based on their profile
- Provide constructive feedback on answers using the STAR method (Situation, Task, Action, Result)
- Give tips on how to improve responses
- Help users feel confident and prepared

If the user hasn't yet started answering:
1. First acknowledge their target role (from profile)
2. List 3 competencies to focus on
3. Ask the first practice question
4. Wait for their answer

When the user answers a question, provide:
1. Positive feedback on what they did well
2. Constructive suggestions for improvement
3. An example of a stronger answer
4. Then ask the next question or offer to move to mock interview mode

${localeInstruction}`;

          // Use targetRole from onboarding session (user's stated goal)
          // Fallback to primaryRole from CV if target is not yet explicitly set
          const targetRole = profile?.onboardingSession?.targetRole ?? profile?.primaryRole ?? "the target role";
          console.log("[Interview Prep] Profile targetRole from DB:", profile?.onboardingSession?.targetRole);
          console.log("[Interview Prep] Profile primaryRole from CV:", profile?.primaryRole);
          console.log("[Interview Prep] Using targetRole:", targetRole);
          
          processedMessage = `Help me prepare for interviews for ${targetRole} positions. ${userMessage}`;
        }

        answer = await callAnthropicAssistant({
          userMessage: processedMessage,
          systemPrompt: systemPromptForInterview,
          anthropicApiKey,
          anthropicModel,
          profileMemory: profile ? buildDurableProfileMemory({
            profile,
            qualifications: profile.qualifications,
            onboardingSession: profile.onboardingSession
          }) : undefined,
          onboardingSession: profile?.onboardingSession
        });
        newState = state;
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
            onboardingSession: profile.onboardingSession
          }) : undefined,
          onboardingSession: profile?.onboardingSession
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
          onboardingSession: profile.onboardingSession
        }) : undefined,
        onboardingSession: profile?.onboardingSession
      });
    }

    // ===== STEP 3: Persist locale preference (state is transient per session) =====
    if (profile && profile.locale !== locale) {
      await db.candidateProfile.update({
        where: { id: profile.id },
        data: { locale }
      });
    }

    return NextResponse.json({ answer });
  } catch (error) {
    console.error("Assistant error:", error);
    return NextResponse.json({ error: "assistant_unavailable" }, { status: 502 });
  }
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
    const maxTokens = userMessage.length > 1000 ? 2048 : 1024;

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
