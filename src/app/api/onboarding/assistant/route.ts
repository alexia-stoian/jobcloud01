import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { buildDurableProfileMemory } from "@/lib/profile/memory";
import { getSystemPrompt } from "@/lib/ai/assistant/system-prompt";
import { routeGreeting } from "@/lib/ai/assistant/greetings";
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

function buildMemoryPromptFragment(memory: ReturnType<typeof buildDurableProfileMemory>): string {
  const qualList = memory.qualifications.map((q) => `${q.category}: ${q.value}`).join(", ") || "none listed";
  return [
    "The user has the following confirmed profile — use it to personalise every answer:",
    `Goal: ${memory.profile.employmentObjective ?? "unknown"}.`,
    `Target role: ${memory.profile.primaryRole ?? "unknown"}.`,
    `Location: ${memory.profile.preferredLocation ?? "unknown"}.`,
    `Current situation: ${memory.profile.currentJobSituation ?? "unknown"}.`,
    `Contract preference: ${memory.profile.contractPreference ?? "unknown"}.`,
    `Work rate: ${memory.profile.workRate ?? "unknown"}.`,
    `Permit status: ${memory.profile.workPermitStatus ?? "unknown"}.`,
    `Salary expectation: ${memory.profile.salaryExpectation ?? "unknown"}.`,
    `Qualifications: ${qualList}.`,
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
        }) : undefined
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
          }) : undefined
        });
        newState = state;
      } else if (
        userMessage.toLowerCase().includes("interview") ||
        userMessage.toLowerCase().includes("mock") ||
        userMessage.toLowerCase().includes("practice") ||
        userMessage.toLowerCase().includes("question")
      ) {
        // Wave 4: Interview Preparation Service
        const localeInstruction = getLocaleInstruction(locale);
        const interviewPrompt = `You are a professional interview coach helping job seekers prepare for interviews. 

Your role:
- Ask practice interview questions relevant to the user's target role
- Provide constructive feedback on answers using the STAR method (Situation, Task, Action, Result)
- Give tips on how to improve responses
- Help users feel confident and prepared

When the user answers a question, provide:
1. Positive feedback on what they did well
2. Constructive suggestions for improvement
3. An example of a stronger answer
4. Ready for the next question

If the user hasn't shared their target role or job details, ask for that first before starting interview practice.

${localeInstruction}`;
        answer = await callAnthropicAssistant({
          userMessage,
          systemPrompt: interviewPrompt,
          anthropicApiKey,
          anthropicModel,
          profileMemory: profile ? buildDurableProfileMemory({
            profile,
            qualifications: profile.qualifications,
            onboardingSession: profile.onboardingSession
          }) : undefined
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
          }) : undefined
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
        }) : undefined
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
  profileMemory
}: {
  userMessage: string;
  systemPrompt: string;
  anthropicApiKey: string;
  anthropicModel: string;
  profileMemory?: ReturnType<typeof buildDurableProfileMemory>;
}): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const fullSystemPrompt = profileMemory
      ? `${systemPrompt}\n\n${buildMemoryPromptFragment(profileMemory)}`
      : systemPrompt;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: anthropicModel,
        max_tokens: 1024,
        system: fullSystemPrompt.trim(),
        messages: [{ role: "user", content: userMessage }]
      }),
      signal: controller.signal,
      cache: "no-store"
    });

    const data = (await response.json()) as AnthropicResponse;

    if (!response.ok) {
      throw new Error(`Anthropic error ${response.status}: ${data.error?.message ?? "unknown error"}`);
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
