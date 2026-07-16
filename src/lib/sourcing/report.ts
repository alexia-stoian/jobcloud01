/**
 * Fact-grounded candidate report — LLM narrative with deterministic fallback.
 *
 * ADMIN-ONLY / INTERNAL. Reuses the Anthropic `fetch` pattern from
 * `src/lib/cv/extract-phase1.ts`. Builds ONE prompt with the recruiter needs and
 * a compact, sanitized facts block per top candidate (only fields present in the
 * bundle), instructs the model to ground every statement strictly in those facts,
 * and parses the response defensively (with truncation salvage). When no API key
 * is present or the call/parse fails, a deterministic report is built from the
 * `ScoredCandidate` breakdown so the feature still ranks and explains from facts.
 */

import { env } from "@/lib/env";
import type { CandidateReport, RecruiterNeeds, ScoredCandidate, SourcingVerdict } from "./types";

type AnthropicTextContent = { type: "text"; text: string };
type AnthropicResponse = { content?: AnthropicTextContent[]; error?: { message?: string } };

type LlmReport = {
  userId: string;
  fitPercent: number;
  whyFit: string;
  bestSkills: string[];
  pros: string[];
  cons: string[];
  verdict: SourcingVerdict;
  recommendation: string;
};

function toVerdict(value: unknown, fitPercent: number): SourcingVerdict {
  if (value === "recommended" || value === "consider" || value === "not_recommended") {
    return value;
  }
  if (fitPercent >= 70) return "recommended";
  if (fitPercent >= 45) return "consider";
  return "not_recommended";
}

/** Clamp a string for prompt embedding (defense-in-depth atop T1 sanitization). */
function clamp(value: string | null | undefined, max = 200): string {
  if (!value) {
    return "";
  }
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

async function callAnthropic(prompt: string): Promise<string | null> {
  // Read the key server-side only. Strip ALL whitespace/newlines (defense against
  // a multi-line .env value silently corrupting the credential). The key is never
  // logged, never returned in any API response, and only ever travels from this
  // server to Anthropic over HTTPS — it is never exposed to the browser.
  const anthropicApiKey = (process.env.ANTHROPIC_API_KEY ?? env.ANTHROPIC_API_KEY ?? "").replace(
    /\s+/g,
    ""
  );
  const anthropicModel = (process.env.ANTHROPIC_MODEL ?? env.ANTHROPIC_MODEL)
    .replace(/["'`\r\n]/g, "")
    .trim();

  if (!anthropicApiKey || !anthropicModel) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50000);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: anthropicModel,
        max_tokens: 6000,
        messages: [{ role: "user", content: prompt }]
      }),
      signal: controller.signal,
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as AnthropicResponse;
    const text = data.content?.find((part) => part.type === "text")?.text?.trim();
    return text ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Build the compact, sanitized facts block for one candidate. */
function candidateFacts(scored: ScoredCandidate): Record<string, unknown> {
  const { bundle } = scored;
  return {
    userId: bundle.userId,
    name: clamp(bundle.name, 120),
    primaryRole: clamp(bundle.primaryRole, 120),
    estimatedYearsExperience: bundle.estimatedYearsExperience,
    skills: bundle.skills.slice(0, 40).map((skill) => clamp(skill, 60)),
    languages: bundle.languages.slice(0, 20).map((lang) => clamp(lang, 40)),
    experience: bundle.experience.slice(0, 12).map((entry) => ({
      title: clamp(entry.title, 120),
      company: clamp(entry.company, 120),
      startDate: clamp(entry.startDate, 20),
      endDate: entry.isCurrentRole ? "present" : clamp(entry.endDate, 20)
    })),
    education: bundle.education.slice(0, 8).map((entry) => ({
      title: clamp(entry.title, 120),
      school: clamp(entry.school, 120),
      graduationDate: clamp(entry.graduationDate, 20)
    })),
    preferences: {
      preferredLocation: clamp(bundle.preferences.preferredLocation, 80),
      preferredWorkModel: clamp(bundle.preferences.preferredWorkModel, 60),
      contractPreference: clamp(bundle.preferences.contractPreference, 60)
    },
    // Signals are summarized as direction + confidence only — never raw evidence.
    signals: bundle.signals
      .filter((signal) => signal.inferredValue)
      .map((signal) => ({
        key: signal.key,
        inferredValue: clamp(signal.inferredValue, 80),
        confidence: signal.confidence
      })),
    deterministicScore: scored.score,
    matchedRequiredSkills: scored.matchedRequiredSkills,
    missingRequiredSkills: scored.missingRequiredSkills
  };
}

function buildPrompt(needs: RecruiterNeeds, top: ScoredCandidate[]): string {
  const facts = top.map((scored) => candidateFacts(scored));
  return `You are a recruiter-sourcing assistant. Assess how well each candidate fits the recruiter's needs.

STRICT RULES:
- Ground EVERY statement ONLY in the supplied facts. Do NOT invent skills, roles, dates, or experience.
- If a required fact is missing for a candidate, explicitly say it is missing rather than assuming it.
- Do not reveal internal signal keys verbatim; you may paraphrase behavioral traits qualitatively.
- Return STRICT JSON only — no markdown, no prose outside the JSON.

RECRUITER NEEDS (JSON):
${JSON.stringify(needs)}

CANDIDATES (JSON, facts only):
${JSON.stringify(facts)}

Return a JSON array where each element is:
{
  "userId": "<the candidate userId>",
  "fitPercent": <integer 0-100>,
  "verdict": "recommended" | "consider" | "not_recommended",
  "whyFit": "<2-4 sentence fact-grounded rationale>",
  "bestSkills": ["<most relevant skills the candidate actually has>"],
  "pros": ["<concrete strengths for this role>"],
  "cons": ["<concrete gaps or risks, incl. missing required facts>"],
  "recommendation": "<a LONG, detailed hiring assessment of 3-5 paragraphs. Cover: (1) how the candidate's experience and skills map to the required skills and responsibilities; (2) education and language fit; (3) what the behavioral signals suggest about fit for this team's culture and autonomy level, paraphrased qualitatively; (4) concrete risks, gaps, or missing facts a recruiter must verify in an interview; (5) a clear final verdict on whether to advance this candidate and why. Ground every claim in the supplied facts; where a required fact is missing, say so explicitly.>"
}
Return ONE element per candidate, preserving their userId.`;
}

function parseLlmReports(text: string): LlmReport[] | null {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const salvaged = salvageArray(cleaned);
    if (salvaged === null) {
      return null;
    }
    parsed = salvaged;
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  const reports: LlmReport[] = [];
  for (const raw of parsed) {
    if (typeof raw !== "object" || raw === null) {
      continue;
    }
    const obj = raw as Record<string, unknown>;
    const userId = typeof obj.userId === "string" ? obj.userId : null;
    if (!userId) {
      continue;
    }
    const fitPercent =
      typeof obj.fitPercent === "number" && Number.isFinite(obj.fitPercent)
        ? Math.round(Math.min(100, Math.max(0, obj.fitPercent)))
        : 0;
    reports.push({
      userId,
      fitPercent,
      whyFit: typeof obj.whyFit === "string" ? obj.whyFit : "",
      bestSkills: toStringArray(obj.bestSkills),
      pros: toStringArray(obj.pros),
      cons: toStringArray(obj.cons),
      verdict: toVerdict(obj.verdict, fitPercent),
      recommendation: typeof obj.recommendation === "string" ? obj.recommendation.trim() : ""
    });
  }
  return reports.length > 0 ? reports : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

/** Best-effort recovery of a truncated top-level JSON array of objects. */
function salvageArray(text: string): unknown[] | null {
  const arrStart = text.indexOf("[");
  if (arrStart === -1) {
    return null;
  }
  const complete: string[] = [];
  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escaped = false;

  for (let i = arrStart + 1; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      if (depth === 0) {
        objStart = i;
      }
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        complete.push(text.slice(objStart, i + 1));
        objStart = -1;
      }
    } else if (ch === "]" && depth === 0) {
      break;
    }
  }

  if (complete.length === 0) {
    return null;
  }
  try {
    return complete.map((chunk) => JSON.parse(chunk) as unknown);
  } catch {
    return null;
  }
}

/** Deterministic, fact-derived report from a scored candidate's breakdown. */
function fallbackReport(needs: RecruiterNeeds, scored: ScoredCandidate): CandidateReport {
  const { bundle } = scored;
  const bestSkills = Array.from(
    new Set([...scored.matchedRequiredSkills, ...scored.matchedNiceToHaveSkills])
  ).slice(0, 8);

  const pros: string[] = [];
  const cons: string[] = [];

  if (scored.matchedRequiredSkills.length > 0) {
    pros.push(`Matches required skills: ${scored.matchedRequiredSkills.join(", ")}.`);
  }
  if (scored.matchedNiceToHaveSkills.length > 0) {
    pros.push(`Brings nice-to-have skills: ${scored.matchedNiceToHaveSkills.join(", ")}.`);
  }
  if (typeof needs.minYearsExperience === "number") {
    if (bundle.estimatedYearsExperience >= needs.minYearsExperience) {
      pros.push(
        `~${bundle.estimatedYearsExperience} yrs experience meets the ${needs.minYearsExperience}-yr minimum.`
      );
    } else {
      cons.push(
        `~${bundle.estimatedYearsExperience} yrs experience is below the ${needs.minYearsExperience}-yr minimum (or dates missing).`
      );
    }
  }
  if ((needs.languages ?? []).length > 0) {
    if (bundle.languages.length > 0) {
      pros.push(`Languages on file: ${bundle.languages.join(", ")}.`);
    } else {
      cons.push("No languages recorded to match the requested set.");
    }
  }
  if (scored.missingRequiredSkills.length > 0) {
    cons.push(`Missing required skills: ${scored.missingRequiredSkills.join(", ")}.`);
  }
  if (bundle.skills.length === 0) {
    cons.push("No skills recorded in profile.");
  }

  const whyFitParts: string[] = [];
  whyFitParts.push(
    `${bundle.name} scores ${scored.score}% against these needs based on recorded profile facts.`
  );
  if (bestSkills.length > 0) {
    whyFitParts.push(`Relevant skills: ${bestSkills.join(", ")}.`);
  } else {
    whyFitParts.push("No directly matching skills were found on the profile.");
  }
  if (bundle.primaryRole) {
    whyFitParts.push(`Primary role on file: ${bundle.primaryRole}.`);
  }

  const verdict: SourcingVerdict =
    scored.score >= 70 ? "recommended" : scored.score >= 45 ? "consider" : "not_recommended";

  // Build a longer, structured deterministic narrative for the full-report panel.
  const recParts: string[] = [];
  recParts.push(
    `${bundle.name} reaches an overall fit of ${scored.score}% for this role, computed from the facts recorded in their profile.`
  );
  if (scored.matchedRequiredSkills.length > 0) {
    recParts.push(
      `On the required skills, they cover ${scored.matchedRequiredSkills.join(", ")}${
        scored.missingRequiredSkills.length > 0
          ? `, but no evidence was found for ${scored.missingRequiredSkills.join(", ")}`
          : " — every listed required skill is present"
      }.`
    );
  } else if ((needs.requiredSkills ?? []).length > 0) {
    recParts.push(
      `None of the required skills (${(needs.requiredSkills ?? []).join(", ")}) were found on the profile, which is a significant gap.`
    );
  }
  if (typeof needs.minYearsExperience === "number") {
    recParts.push(
      bundle.estimatedYearsExperience >= needs.minYearsExperience
        ? `Their ~${bundle.estimatedYearsExperience} years of recorded experience meets the ${needs.minYearsExperience}-year minimum.`
        : `Their ~${bundle.estimatedYearsExperience} years of recorded experience is below the ${needs.minYearsExperience}-year minimum (some roles may be missing dates).`
    );
  }
  if ((needs.languages ?? []).length > 0) {
    recParts.push(
      bundle.languages.length > 0
        ? `Languages on file: ${bundle.languages.join(", ")}.`
        : `No languages are recorded, so the requested languages (${(needs.languages ?? []).join(", ")}) cannot be confirmed.`
    );
  }
  if ((needs.education ?? []).length > 0) {
    recParts.push(
      bundle.education.length > 0
        ? `Education on file: ${bundle.education.map((e) => e.title).filter(Boolean).join("; ")}.`
        : "No education entries are recorded to match the requested minimum."
    );
  }
  const highSignals = bundle.signals
    .filter((s) => s.inferredValue && s.confidence >= 50)
    .map((s) => `${s.name.toLowerCase()} (${s.confidence}%)`);
  if (highSignals.length > 0) {
    recParts.push(`Behavioral signals inferred with reasonable confidence: ${highSignals.join(", ")}.`);
  }
  recParts.push(
    verdict === "recommended"
      ? "Overall this candidate is a strong match and worth advancing to an interview."
      : verdict === "consider"
        ? "Overall this is a partial match — worth considering if the missing facts can be clarified in a screening call."
        : "Overall the recorded facts do not support a strong fit for this role; advance only if key gaps can be explained."
  );

  return {
    fitPercent: scored.score,
    whyFit: whyFitParts.join(" "),
    bestSkills,
    pros: pros.length > 0 ? pros : ["No standout strengths derived from recorded facts."],
    cons: cons.length > 0 ? cons : ["No obvious gaps derived from recorded facts."],
    verdict,
    recommendation: recParts.join(" "),
    grounded: false
  };
}

/**
 * Build one `CandidateReport` per top candidate. Uses the LLM when available and
 * parseable; otherwise falls back to a deterministic fact-derived report.
 */
export async function buildReports(
  needs: RecruiterNeeds,
  top: ScoredCandidate[]
): Promise<Map<string, CandidateReport>> {
  const reports = new Map<string, CandidateReport>();
  if (top.length === 0) {
    return reports;
  }

  const raw = await callAnthropic(buildPrompt(needs, top));
  const llmReports = raw ? parseLlmReports(raw) : null;
  const llmByUser = new Map<string, LlmReport>();
  if (llmReports) {
    for (const report of llmReports) {
      llmByUser.set(report.userId, report);
    }
  }

  for (const scored of top) {
    const llm = llmByUser.get(scored.bundle.userId);
    if (llm && llm.whyFit.trim().length > 0) {
      const fallback = fallbackReport(needs, scored);
      const fitPercent = llm.fitPercent > 0 ? llm.fitPercent : scored.score;
      reports.set(scored.bundle.userId, {
        fitPercent,
        whyFit: llm.whyFit.trim(),
        bestSkills:
          llm.bestSkills.length > 0
            ? llm.bestSkills
            : Array.from(
                new Set([...scored.matchedRequiredSkills, ...scored.matchedNiceToHaveSkills])
              ).slice(0, 8),
        pros: llm.pros.length > 0 ? llm.pros : fallback.pros,
        cons: llm.cons.length > 0 ? llm.cons : fallback.cons,
        verdict: llm.verdict,
        recommendation:
          llm.recommendation.trim().length > 0 ? llm.recommendation.trim() : fallback.recommendation,
        grounded: true
      });
    } else {
      reports.set(scored.bundle.userId, fallbackReport(needs, scored));
    }
  }

  return reports;
}
