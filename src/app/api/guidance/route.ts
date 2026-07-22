import { NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { env } from "@/lib/env";
import { getBedrockModel, bedrockInvokeUrl, bedrockHeaders, BEDROCK_ANTHROPIC_VERSION } from "@/lib/ai/bedrock";
import { db } from "@/lib/db";
import { buildDurableProfileMemory } from "@/lib/profile/memory";
import { computeCompletion } from "@/lib/profile/completion-gate";

type AnthropicTextContent = {
  type: "text";
  text: string;
};

type AnthropicResponse = {
  content?: AnthropicTextContent[];
  error?: { message?: string };
};

export type GuidanceSection = {
  id: "next_steps" | "interview_prep" | "skill_gaps" | "salary" | "readiness";
  title: string;
  content: string;
};

export type GuidanceResponse = {
  sections: GuidanceSection[];
  generatedAt: string;
  profileRole: string | null;
  profileLocation: string | null;
};

function buildGuidancePrompt(memory: ReturnType<typeof buildDurableProfileMemory>): string {
  const profile = memory.profile;
  const qualList = memory.qualifications.map((q) => `${q.category}: ${q.value}`).join(", ") || "none listed";

  const profileSummary = [
    `Name: ${profile.fullName ?? "unknown"}`,
    `Goal: ${profile.employmentObjective ?? "unknown"}`,
    `Target role: ${profile.primaryRole ?? "unknown"}`,
    `Location: ${profile.preferredLocation ?? "unknown"}`,
    `Situation: ${profile.currentJobSituation ?? "unknown"}`,
    `Contract: ${profile.contractPreference ?? "unknown"}`,
    `Work rate: ${profile.workRate ?? "unknown"}`,
    `Permit: ${profile.workPermitStatus ?? "unknown"}`,
    `Salary target: ${profile.salaryExpectation ?? "unknown"}`,
    `Qualifications: ${qualList}`,
  ].join(". ");

  return `You are a senior career coach specializing in the Swiss job market.
You have the following confirmed candidate profile: ${profileSummary}.

Generate EXACTLY 5 sections of personalized, actionable coaching advice. Each section must be grounded in this specific profile. Do not give generic advice — reference the role, location, permit status, and qualifications where relevant.

Return your response as a JSON object with this exact structure:
{
  "next_steps": "2-4 concrete, prioritized actions the candidate should take this week to move their job search forward",
  "interview_prep": "3-5 likely interview questions for this specific role and profile, with brief tips for each",
  "skill_gaps": "2-3 specific skills or qualifications missing or worth strengthening for this target role in this market",
  "salary": "Realistic salary range analysis for this role, location and permit situation in Switzerland, with negotiation tips",
  "readiness": "Honest assessment of how ready this profile is for the target role, what's strong and what's missing"
}

Be direct, warm, specific, and practical. Use short paragraphs. No fluff.`;
}

async function callAnthropic(prompt: string, locale: string): Promise<string | null> {
  const anthropicApiKey = process.env.AWS_BEARER_TOKEN_BEDROCK?.trim() || env.AWS_BEARER_TOKEN_BEDROCK?.trim();
  const anthropicModel = getBedrockModel();

  if (!anthropicApiKey || !anthropicModel) {
    return null;
  }

  const localeNote = locale === "de" ? "Respond in German." : locale === "fr" ? "Respond in French." : "Respond in English.";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(bedrockInvokeUrl(anthropicModel), {
      method: "POST",
      headers: bedrockHeaders(anthropicApiKey),
      body: JSON.stringify({
        anthropic_version: BEDROCK_ANTHROPIC_VERSION,
        max_tokens: 1800,
        system: `You are a career coach. ${localeNote} Always return valid JSON only, no markdown fences.`,
        messages: [{ role: "user", content: prompt }]
      }),
      signal: controller.signal,
      cache: "no-store"
    });

    const data = (await response.json()) as AnthropicResponse;
    if (!response.ok) {
      // Log error but don't throw - return null for graceful fallback
      console.error("Anthropic API error:", data.error?.message);
      return null;
    }
    
    const responseText = data.content?.find((p) => p.type === "text")?.text?.trim() ?? null;
    
    // Validate response is valid JSON
    if (responseText) {
      try {
        JSON.parse(responseText);
        return responseText;
      } catch {
        // Response is not valid JSON, return null for graceful fallback
        console.error("Anthropic response is not valid JSON");
        return null;
      }
    }
    
    return null;
  } catch (error) {
    // Log timeout or fetch errors but don't throw
    if (error instanceof Error) {
      console.error("Anthropic fetch error:", error.message);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const SECTION_TITLES: Record<string, string> = {
  next_steps: "Your next steps 🎯",
  interview_prep: "Interview preparation 💬",
  skill_gaps: "Skills to strengthen 📈",
  salary: "Salary guidance 💰",
  readiness: "Profile readiness 🔍"
};

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let profile;
  try {
    profile = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      include: { qualifications: true, onboardingSession: true }
    });
  } catch {
    return NextResponse.json({ error: "profile_unavailable" }, { status: 503 });
  }

  if (!profile) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }

  const completion = computeCompletion(profile);
  if (!completion.isMinimallyComplete) {
    return NextResponse.json({
      error: "profile_incomplete",
      missingFields: completion.missingCriticalFields,
      message: "Please complete your profile with target role and location before requesting guidance."
    }, { status: 400 });
  }

  const memory = buildDurableProfileMemory({
    profile,
    qualifications: profile.qualifications,
    onboardingSession: profile.onboardingSession
  });

  const prompt = buildGuidancePrompt(memory);
  const raw = await callAnthropic(prompt, memory.locale);

  if (!raw) {
    return NextResponse.json({ error: "guidance_unavailable" }, { status: 502 });
  }

  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(raw) as Record<string, string>;
  } catch {
    return NextResponse.json({ error: "guidance_parse_error" }, { status: 502 });
  }

  const ids: GuidanceSection["id"][] = ["next_steps", "interview_prep", "skill_gaps", "salary", "readiness"];
  const sections: GuidanceSection[] = ids.map((id) => ({
    id,
    title: SECTION_TITLES[id],
    content: typeof parsed[id] === "string" ? parsed[id] : "No information available for this section."
  }));

  return NextResponse.json({
    sections,
    generatedAt: new Date().toISOString(),
    profileRole: profile.primaryRole,
    profileLocation: profile.preferredLocation
  } satisfies GuidanceResponse);
}
