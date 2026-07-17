/**
 * Fact-grounded candidate report — LLM narrative with deterministic fallback.
 *
 * ADMIN-ONLY / INTERNAL. Reuses the Anthropic `fetch` pattern from
 * `src/lib/cv/extract-phase1.ts`. Each top candidate is assessed with its OWN
 * focused, sanitized prompt (only fields present in the bundle) run in PARALLEL,
 * so total latency stays low and no single slow candidate blocks the rest — this
 * avoids the request timeout that a single mega-prompt hit on extended-thinking
 * models. The model must ground every statement strictly in the supplied facts.
 * When no API key is present or a call/parse fails, a deterministic report is
 * built from the `ScoredCandidate` breakdown so the feature still ranks and
 * explains from facts.
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

async function callAnthropic(prompt: string, maxTokens: number): Promise<string | null> {
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
  const timeout = setTimeout(() => controller.abort(), 55000);

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
        max_tokens: maxTokens,
        // Disable extended thinking: this is a structured JSON-extraction task, so
        // "thinking" only burns the token budget (truncating the JSON before it
        // closes) and adds latency. Without it the model returns clean JSON fast.
        thinking: { type: "disabled" },
        messages: [{ role: "user", content: prompt }]
      }),
      signal: controller.signal,
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as AnthropicResponse;
    // Concatenate all text parts (defensive — normally a single text block once
    // thinking is disabled).
    const text = data.content
      ?.filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("")
      .trim();
    return text && text.length > 0 ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** A computed public-transport commute between the candidate and the job. */
type CommuteInfo = {
  from: string;
  to: string;
  publicTransportMinutes: number;
  maxCommuteMinutes: number | null;
  withinRadius: boolean | null;
};

/** Parse a commute radius like "60 min", "1h", "90 minutes" into minutes. */
function parseRadiusMinutes(radius: string | null | undefined): number | null {
  if (!radius) {
    return null;
  }
  const s = radius.toLowerCase();
  let mins = 0;
  const h = s.match(/(\d+)\s*(?:h|hour|hr)/);
  const m = s.match(/(\d+)\s*(?:m|min)/);
  if (h) mins += Number(h[1]) * 60;
  if (m) mins += Number(m[1]);
  if (mins === 0) {
    const n = s.match(/\d+/);
    if (n) mins = Number(n[0]); // bare number → assume minutes
  }
  return mins > 0 ? mins : null;
}

/** Real public-transport travel time (minutes) via the free Swiss transport API. */
async function transitMinutes(from: string, to: string): Promise<number | null> {
  try {
    const url = `https://transport.opendata.ch/v1/connections?from=${encodeURIComponent(
      from
    )}&to=${encodeURIComponent(to)}&limit=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timeout);
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as {
      connections?: Array<{ from?: { departureTimestamp?: number }; to?: { arrivalTimestamp?: number } }>;
    };
    const conn = data.connections?.[0];
    const dep = conn?.from?.departureTimestamp;
    const arr = conn?.to?.arrivalTimestamp;
    if (typeof dep === "number" && typeof arr === "number" && arr > dep) {
      return Math.round((arr - dep) / 60);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Compute the candidate's PUBLIC-TRANSPORT commute (never by car) from their
 * preferred location to the job location and compare it to their commute radius.
 * Uses the free Swiss transport API; returns null when it can't be computed.
 */
async function computeCommute(
  jobLocation: string | undefined,
  preferredLocation: string | null,
  commuteRadius: string | null
): Promise<CommuteInfo | null> {
  const to = (jobLocation ?? "").trim();
  const from = (preferredLocation ?? "").trim();
  if (!to || !from) {
    return null;
  }
  // Use the city/town token (before any canton/country suffix) for station lookup.
  const minutes = await transitMinutes(from.split(",")[0].trim(), to.split(",")[0].trim());
  if (minutes === null) {
    return null;
  }
  const radius = parseRadiusMinutes(commuteRadius);
  return {
    from,
    to,
    publicTransportMinutes: minutes,
    maxCommuteMinutes: radius,
    withinRadius: radius !== null ? minutes <= radius : null
  };
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
      endDate: entry.isCurrentRole ? "present" : clamp(entry.endDate, 20),
      // Free-text tenure carried from the Admin profile when explicit dates are
      // absent (editor-saved profiles store only the period string).
      period: clamp(entry.period, 40)
    })),
    education: bundle.education.slice(0, 8).map((entry) => ({
      title: clamp(entry.title, 120),
      school: clamp(entry.school, 120),
      graduationDate: clamp(entry.graduationDate, 20)
    })),
    preferences: {
      preferredLocation: clamp(bundle.preferences.preferredLocation, 80),
      currentJobSituation: clamp(bundle.preferences.currentJobSituation, 80),
      employmentObjective: clamp(bundle.preferences.employmentObjective, 120),
      targetRoles: clamp(bundle.preferences.targetRoles, 80),
      targetSeniority: clamp(bundle.preferences.targetSeniority, 60),
      targetIndustries: clamp(bundle.preferences.targetIndustries, 80),
      preferredWorkModel: clamp(bundle.preferences.preferredWorkModel, 60),
      contractPreference: clamp(bundle.preferences.contractPreference, 60),
      workRate: clamp(bundle.preferences.workRate, 40),
      workPermitStatus: clamp(bundle.preferences.workPermitStatus, 60),
      salaryExpectation: clamp(bundle.preferences.salaryExpectation, 60),
      visaSponsorship: clamp(bundle.preferences.visaSponsorship, 60),
      relocationWillingness: clamp(bundle.preferences.relocationWillingness, 60),
      commuteRadius: clamp(bundle.preferences.commuteRadius, 40)
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

function buildCandidatePrompt(needs: RecruiterNeeds, scored: ScoredCandidate, commute: CommuteInfo | null): string {
  const facts = candidateFacts(scored);
  if (commute) {
    facts.commute = commute;
  }
  return `You are a recruiter-sourcing assistant. Assess how well ONE candidate fits the recruiter's needs.

STRICT RULES:
- Ground EVERY statement ONLY in the supplied facts. Do NOT invent skills, roles, dates, or experience.
- If a required fact is missing, explicitly say it is missing rather than assuming it.
- The candidate's "preferences" block (location, work model, contract, work rate, salary, work permit, visa sponsorship, relocation, commute, target role/seniority/industries, current situation, employment objective) IS the candidate's FINAL, 100%-CONFIRMED decision — this section itself is the final confirmation. Treat every non-empty value in it as authoritative fact that needs NO further checking. You MUST NOT request, recommend, imply, or note any need to "confirm", "clarify", "verify", "validate", "double-check", "discuss", "align on", or "reconfirm" any stated preference — the assistant must never require additional confirmation of it. Never list a stated preference, or its match with the recruiter's need, as a con, risk, gap, caveat, or open question. When a stated preference matches the recruiter's need, that is a PRO. (Only a genuinely EMPTY/absent preference may be noted as "not provided".)
- COMMUTE CHECK (public transport only, NEVER by car): If a "commute" fact is present, it holds the real PUBLIC-TRANSPORT travel time (publicTransportMinutes) between the candidate's preferred location and the job location, plus their commute radius (maxCommuteMinutes) and a withinRadius flag. If withinRadius is false, record the commute as a CON and let it lower fitPercent; if true, record it as a PRO. State the actual minutes and the comparison explicitly. If no "commute" fact is present but preferred location, job location and commute radius exist, estimate the public-transport commute yourself and apply the same rule; if any of those are missing, say so instead of guessing.
- Do not reveal internal signal keys verbatim; you may paraphrase behavioral traits qualitatively.
- Return STRICT, VALID JSON only — a single object, no markdown, no prose outside the JSON.
- Inside string values: write each field on ONE line (NO literal line breaks), and escape any double quotes. Separate paragraphs in "recommendation" with " " (a space) or "\\n", never a raw newline.

RECRUITER NEEDS (JSON):
${JSON.stringify(needs)}

CANDIDATE (JSON, facts only):
${JSON.stringify(facts)}

Return a SINGLE JSON object:
{
  "userId": "${scored.bundle.userId}",
  "fitPercent": <integer 0-100>,
  "verdict": "recommended" | "consider" | "not_recommended",
  "whyFit": "<2-4 sentence fact-grounded rationale>",
  "bestSkills": ["<most relevant skills the candidate actually has>"],
  "pros": ["<concrete strengths for this role>"],
  "cons": ["<concrete gaps or risks, incl. missing required facts>"],
  "recommendation": "<a thorough hiring assessment of 4-6 full paragraphs. Cover in depth: (1) how the candidate's experience and skills map to the required skills and responsibilities, calling out specific matches and gaps; (2) education and language fit; (3) what the behavioral signals suggest about fit for this team's culture and autonomy level, paraphrased qualitatively; (4) structural considerations (seniority, location, salary, contract/work-model) worth clarifying; (5) concrete risks, gaps, or missing facts a recruiter must verify in an interview; and (6) a clear, well-justified final verdict on whether to advance this candidate and why. Write complete sentences and finish every paragraph — do not cut off. Ground every claim in the supplied facts; where a required fact is missing, say so explicitly.>"
}`;
}

function parseSingleReport(text: string): LlmReport | null {
  let cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  // If wrapped in an array, unwrap to the first object.
  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");
  if (objStart > 0 || objEnd < cleaned.length - 1) {
    if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
      cleaned = cleaned.slice(objStart, objEnd + 1);
    }
  }

  let obj: Record<string, unknown>;
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    obj = parsed as Record<string, unknown>;
  } catch {
    // Common failure: the model wrote a multi-paragraph "recommendation" with
    // LITERAL newlines/tabs or UNESCAPED inner quotes inside the JSON string.
    // Repair those, then retry once.
    try {
      const parsed = JSON.parse(repairJsonStrings(cleaned));
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return null;
      }
      obj = parsed as Record<string, unknown>;
    } catch {
      // Last resort: the JSON was truncated (token cap) or otherwise malformed.
      // Field-extract what we can so a usable AI report still comes through.
      return salvageReport(cleaned);
    }
  }

  const userId = typeof obj.userId === "string" ? obj.userId : "";
  const fitPercent =
    typeof obj.fitPercent === "number" && Number.isFinite(obj.fitPercent)
      ? Math.round(Math.min(100, Math.max(0, obj.fitPercent)))
      : 0;
  return {
    userId,
    fitPercent,
    whyFit: typeof obj.whyFit === "string" ? obj.whyFit : "",
    bestSkills: toStringArray(obj.bestSkills),
    pros: toStringArray(obj.pros),
    cons: toStringArray(obj.cons),
    verdict: toVerdict(obj.verdict, fitPercent),
    recommendation: typeof obj.recommendation === "string" ? obj.recommendation.trim() : ""
  };
}

/**
 * Field-extract a report from malformed or TRUNCATED JSON (e.g. hit the token
 * cap mid-`recommendation`). Pulls each known field with a targeted regex so a
 * usable AI-grounded report survives even when `JSON.parse` cannot.
 */
function salvageReport(text: string): LlmReport | null {
  const esc = repairJsonStrings(text);

  const numField = (key: string): number => {
    const m = esc.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`));
    return m ? Math.round(Math.min(100, Math.max(0, Number(m[1])))) : 0;
  };
  const strField = (key: string): string => {
    // Complete quoted value first; fall back to a truncated tail (no closing quote).
    const full = esc.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
    const raw = full ? full[1] : (esc.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)$`))?.[1] ?? "");
    return raw.replace(/\\n/g, " ").replace(/\\t/g, " ").replace(/\\"/g, '"').replace(/\\\\/g, "\\").trim();
  };
  const arrField = (key: string): string[] => {
    const m = esc.match(new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)\\]`));
    if (!m) return [];
    return Array.from(m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g))
      .map((x) => x[1].replace(/\\"/g, '"').trim())
      .filter(Boolean);
  };

  const whyFit = strField("whyFit");
  if (whyFit.length === 0) {
    return null;
  }
  const fitPercent = numField("fitPercent");
  const verdictMatch = esc.match(/"verdict"\s*:\s*"(recommended|consider|not_recommended)"/);

  // recommendation is the LAST field — grab everything from its opening quote to
  // the final closing quote (greedy), so inner quotes and even a truncated tail
  // are preserved rather than cut at the first inner quote.
  let recommendation = "";
  const recGreedy = esc.match(/"recommendation"\s*:\s*"([\s\S]*?)"\s*}?\s*$/);
  if (recGreedy) {
    recommendation = recGreedy[1]
      .replace(/\\n/g, " ")
      .replace(/\\t/g, " ")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .trim();
  } else {
    recommendation = strField("recommendation");
  }

  return {
    userId: strField("userId"),
    fitPercent,
    whyFit,
    bestSkills: arrField("bestSkills"),
    pros: arrField("pros"),
    cons: arrField("cons"),
    verdict: toVerdict(verdictMatch?.[1], fitPercent),
    recommendation
  };
}

/**
 * Repair the two JSON mistakes LLMs make most in long narrative fields:
 *   1. LITERAL newlines/tabs inside a string value.
 *   2. UNESCAPED double quotes inside a string value (e.g. a "quality-first"
 *      culture, or The verdict is "consider").
 * Walks the text tracking string context; a `"` is treated as the string's
 * closing quote only when the next non-space char is a JSON structural token
 * (`,` `}` `]` `:`) or end-of-input — otherwise it is an inner quote and gets
 * escaped. Structural whitespace outside strings is left untouched.
 */
function repairJsonStrings(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inString) {
      out += ch;
      if (ch === '"') {
        inString = true;
      }
      continue;
    }
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === "\n") {
      out += "\\n";
      continue;
    }
    if (ch === "\r") {
      out += "\\r";
      continue;
    }
    if (ch === "\t") {
      out += "\\t";
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) {
        j++;
      }
      const next = text[j];
      if (next === undefined || next === "," || next === "}" || next === "]" || next === ":") {
        out += '"';
        inString = false;
      } else {
        // Inner quote inside the narrative — escape it so JSON stays valid.
        out += '\\"';
      }
      continue;
    }
    out += ch;
  }
  return out;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
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
 * Build one `CandidateReport` for a single candidate. Uses the LLM when
 * available and parseable; otherwise falls back to a deterministic fact-derived
 * report. Each candidate is a small, focused request so it stays well under the
 * request timeout even for extended-thinking models.
 */
async function buildOneReport(
  needs: RecruiterNeeds,
  scored: ScoredCandidate
): Promise<CandidateReport> {
  const fallback = fallbackReport(needs, scored);
  const commute = await computeCommute(
    needs.location,
    scored.bundle.preferences.preferredLocation,
    scored.bundle.preferences.commuteRadius
  );
  const prompt = buildCandidatePrompt(needs, scored, commute);

  // Try up to twice: LLM JSON output is occasionally malformed (e.g. an
  // unescaped quote inside the narrative). A fresh generation almost always
  // produces valid JSON, so one retry pushes the success rate very high while
  // staying well within the request timeout.
  let llm: LlmReport | null = null;
  for (let attempt = 0; attempt < 2 && (!llm || llm.whyFit.trim().length === 0); attempt++) {
    const raw = await callAnthropic(prompt, 8000);
    llm = raw ? parseSingleReport(raw) : null;
  }

  if (!llm || llm.whyFit.trim().length === 0) {
    return fallback;
  }

  return {
    fitPercent: llm.fitPercent > 0 ? llm.fitPercent : scored.score,
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
  };
}

/**
 * Build one `CandidateReport` per top candidate. Each candidate is generated in
 * PARALLEL via its own focused LLM call, so total latency stays low and one slow
 * candidate never blocks the others. Failed calls fall back deterministically.
 */
export async function buildReports(
  needs: RecruiterNeeds,
  top: ScoredCandidate[]
): Promise<Map<string, CandidateReport>> {
  const reports = new Map<string, CandidateReport>();
  if (top.length === 0) {
    return reports;
  }

  const built = await Promise.all(top.map((scored) => buildOneReport(needs, scored)));
  top.forEach((scored, index) => {
    reports.set(scored.bundle.userId, built[index]);
  });

  return reports;
}
