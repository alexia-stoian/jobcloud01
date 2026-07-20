/**
 * LLM-based target-role intent detector.
 *
 * Replaces the brittle regex (`detectTargetRoleFromMessage`) with a paraphrase-aware
 * classifier that only fires on EXPLICIT first-person career intent — safe even inside
 * interview/practice turns. It never throws: any failure (missing key, non-ok response,
 * timeout, unparseable JSON) resolves to `null` (mirrors the signals-engine contract).
 *
 * Latency control: a cheap first-person keyword pre-filter (`INTENT_HINT`) short-circuits
 * ordinary conversational turns to `null` BEFORE any network work, so the LLM only runs on
 * turns that plausibly express role intent.
 *
 * Security: the LLM-returned role is untrusted text that is later stored and interpolated
 * into system prompts (Plan 2). It is normalized (strip control chars / backticks / newlines,
 * collapse whitespace, title-case) and length-capped (≤ 60 chars) BEFORE being returned.
 */

/**
 * First-person intent gate. Only turns that plausibly express a first-person career intent
 * pass this pre-filter; everything else skips the network entirely. This inverts the old
 * "regex decides" into "regex gates, LLM decides".
 *
 * Covers EN/DE/FR first-person intent markers so non-English users still reach the LLM
 * classifier (the locked EN/DE/FR scope). The gate is deliberately permissive — the LLM
 * makes the final decision — so a broad match here is safe.
 */
const INTENT_HINT =
  /(?:\bi\s+(?:want|aim|plan|hope|wish|would\s+like|'?d\s+like|intend)\b|\bi'?m\s+(?:targeting|aiming|looking|pursuing|switching|moving|transitioning)\b|\bmy\s+goal\b|\baiming\s+for\b|\bswitch\s+to\b|\bmove\s+into\b|\boptimize\s+for\b|\btarget(?:ing)?\s+role\b|\bich\s+(?:möchte|will|strebe|plane|wünsche|möchte\s+gern)\b|\bmein\s+ziel\b|\bwechseln\s+zu\b|\bwerden\s+möchte\b|\bje\s+(?:veux|voudrais|souhaite|vise|compte|aimerais|désire)\b|\bmon\s+objectif\b|\bpasser\s+à|\bdevenir\b)/i;

/** Maximum length of a returned role string (chars). Bounds prompt-injection surface. */
const MAX_ROLE_LENGTH = 60;

type AnthropicTextContent = {
  type: "text";
  text: string;
};

type AnthropicResponse = {
  content?: AnthropicTextContent[];
  error?: { message?: string };
};

export interface DetectTargetRoleIntentArgs {
  message: string;
  /** true when state.services.interviewPrep.currentMode === "practice". */
  inPractice: boolean;
  apiKey?: string;
  /** Already-sanitized model id resolved upstream. */
  model: string;
}

/**
 * Normalize an untrusted role string before returning it: strip control chars, backticks,
 * and CR/LF; collapse internal whitespace; title-case each word; cap length.
 * Returns `null` if nothing meaningful remains.
 */
function normalizeRole(raw: string): string | null {
  // eslint-disable-next-line no-control-regex
  const stripped = raw
    .replace(/[\u0000-\u001f\u007f`\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!stripped) {
    return null;
  }

  const titleCased = stripped
    .split(" ")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");

  const capped = titleCased.slice(0, MAX_ROLE_LENGTH).trim();
  return capped || null;
}

/**
 * Detect explicit first-person target-role intent in a single user message.
 *
 * @returns a normalized, length-capped role string on explicit first-person intent,
 *          otherwise `null`. Never throws.
 */
export async function detectTargetRoleIntent({
  message,
  inPractice,
  apiKey,
  model
}: DetectTargetRoleIntentArgs): Promise<string | null> {
  try {
    if (!message || !INTENT_HINT.test(message)) {
      return null;
    }

    if (!apiKey) {
      return null;
    }

    const practiceClause = inPractice
      ? " The user is currently answering an interview/practice question, so a role NAMED in their answer is NOT intent — return null unless they explicitly state a first-person intent to switch to or pursue that role as their own career goal."
      : "";

    const system =
      "You classify whether a user message expresses an explicit first-person career intent to pursue a specific target role. " +
      "Return STRICT JSON of the exact form {\"role\": string|null} and nothing else. " +
      "Only return a role when the user themselves expresses a first-person intent to pursue, target, switch to, or optimize for it " +
      "(e.g. \"I want to become...\", \"I'm targeting...\", \"I'd like to move into...\"). " +
      "Return null for any role that is merely described, mentioned, or discussed without such first-person career intent." +
      practiceClause;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

    let text: string | null;
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
          max_tokens: 20,
          system,
          messages: [{ role: "user", content: message }]
        }),
        signal: controller.signal,
        cache: "no-store"
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as AnthropicResponse;
      text = data.content?.find((p) => p.type === "text")?.text?.trim() ?? null;
    } finally {
      clearTimeout(timeout);
    }

    if (!text) {
      return null;
    }

    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return null;
    }

    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const role = (parsed as { role?: unknown }).role;
    if (typeof role !== "string") {
      return null;
    }

    const trimmedRole = role.trim();
    if (!trimmedRole || trimmedRole.toLowerCase() === "null") {
      return null;
    }

    return normalizeRole(trimmedRole);
  } catch {
    // Never throw — any failure (abort, network, parse) resolves to null.
    return null;
  }
}
