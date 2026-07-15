/**
 * Cover Letter ↔ Profile Alignment Guard
 *
 * Before the assistant helps with a cover letter (generating a new one, or
 * editing/proofreading a letter the user pasted), we verify the letter's stated
 * profession, field, and claimed experience broadly match the candidate's real
 * profile (extracted from their CV or filled in manually). If the letter clearly
 * misrepresents the candidate, we flag it and refuse that specific task rather
 * than help polish an inaccurate application.
 */

import type { CandidateProfile, ProfileQualification } from "@prisma/client";

export interface AlignmentResult {
  aligned: boolean;
  reason: string;
}

type ProfileWithQualifications = CandidateProfile & {
  qualifications?: ProfileQualification[];
};

/** Build a concise, human-readable summary of the candidate's profile. */
export function buildProfileSummary(
  profile: ProfileWithQualifications,
  targetRole?: string | null
): string {
  const lines: string[] = [];
  const add = (label: string, value: unknown) => {
    if (value && String(value).trim().length > 0) {
      lines.push(`- ${label}: ${String(value).trim()}`);
    }
  };

  add("Full name", profile.fullName);
  add("Current/most recent role (from CV)", profile.primaryRole);
  add("Target role / career goal", targetRole ?? profile.targetRoles);
  add("Employment objective", profile.employmentObjective);
  add("Current situation", profile.currentJobSituation);
  add("Target industries", profile.targetIndustries);
  add("Target seniority", profile.targetSeniority);

  const quals = profile.qualifications ?? [];
  if (quals.length > 0) {
    const byCategory = quals.reduce<Record<string, string[]>>((acc, q) => {
      (acc[q.category] ??= []).push(q.value);
      return acc;
    }, {});
    for (const [category, values] of Object.entries(byCategory)) {
      lines.push(`- ${category}: ${values.slice(0, 25).join(", ")}`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : "(no profile details on file yet)";
}

/** True when the profile has essentially no substantive data to compare against. */
export function profileHasSubstance(profile: ProfileWithQualifications): boolean {
  const hasRole = Boolean(profile.primaryRole || profile.targetRoles);
  const hasQuals = (profile.qualifications?.length ?? 0) > 0;
  return hasRole || hasQuals;
}

type AnthropicResponse = {
  content?: Array<{ type?: string; text?: string }>;
};

/**
 * Ask the model whether the cover letter (or cover-letter request) aligns with
 * the candidate's profile. Placeholder fields like [Your Name] are ignored.
 * On any error, defaults to `aligned: true` so the guard never blocks legitimate
 * work due to a transient API issue (fail-open).
 */
export async function checkCoverLetterAlignment(
  coverLetterContent: string,
  profileSummary: string,
  apiKey: string,
  model: string
): Promise<AlignmentResult> {
  const prompt = `You are verifying whether a cover letter accurately represents a real job candidate, based on their profile.

CANDIDATE PROFILE:
${profileSummary}

COVER LETTER (or cover-letter request):
${coverLetterContent}

Decide whether the cover letter's stated profession, field, and claimed experience broadly ALIGN with the candidate's profile.

Rules:
- IGNORE placeholder/template fields such as [Your Name], [Company], [X years], [specific skill] — these are filled in later and are NOT misalignment.
- Only answer MISALIGNED when the letter clearly represents a DIFFERENT profession or field, or claims concrete experience/skills that plainly CONTRADICT the profile (e.g., the letter is for a Registered Nurse role but the candidate is a Software Engineer with no healthcare background).
- Differences in target company, seniority wording, or emphasis are NOT misalignment.
- If the profile is sparse but nothing in the letter contradicts it, answer ALIGNED.

Respond in EXACTLY this format:
VERDICT: ALIGNED or MISALIGNED
REASON: <one short sentence explaining why>`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) {
      return { aligned: true, reason: "alignment check unavailable" };
    }

    const data = (await response.json()) as AnthropicResponse;
    const text = data.content?.find((c) => c.type === "text")?.text?.trim() ?? "";

    const verdictMatch = text.match(/VERDICT:\s*(ALIGNED|MISALIGNED)/i);
    const reasonMatch = text.match(/REASON:\s*(.+)/i);
    const verdict = verdictMatch?.[1]?.toUpperCase();
    const reason = reasonMatch?.[1]?.trim() ?? "";

    if (verdict === "MISALIGNED") {
      return { aligned: false, reason: reason || "The cover letter does not match your profile." };
    }
    return { aligned: true, reason: reason || "aligned" };
  } catch {
    // Fail open — never block legitimate work due to a transient error.
    return { aligned: true, reason: "alignment check errored" };
  }
}

/** Standard flag message shown when a cover letter does not match the profile. */
export function buildMisalignmentMessage(reason: string): string {
  return `I can't help with this cover letter because it doesn't match your profile. 🚩

**Why:** ${reason}

I only help with cover letters that honestly reflect your real background (the experience and skills from your CV or profile). Misrepresenting your experience can hurt your application and credibility.

Here's how we can move forward:
✅ Update your profile if it's missing real experience this letter reflects
✅ Ask me to **generate a cover letter from your actual profile** for the role you want
✅ Share a letter that matches your real background and I'll gladly polish it

Want me to draft one based on your real profile? 😊`;
}
