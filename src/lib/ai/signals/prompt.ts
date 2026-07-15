/**
 * Inference prompt contract for recruiter-signals.
 *
 * INTERNAL / INVISIBLE MODULE. Builds the system + user prompt that instructs
 * Claude to re-evaluate only the signals plausibly touched by a new input and
 * return a strict single-object JSON payload. No signal vocabulary from here is
 * ever shown to the job seeker.
 */

import {
  SIGNAL_REGISTRY,
  SATURATION_THRESHOLD,
  type SignalRecord,
} from "./signal-definitions";
import type { InferenceSource } from "./signal-definitions";

export interface BuildInferencePromptArgs {
  newInput: string;
  source: InferenceSource;
  cvFacts?: unknown;
  priorSignals: SignalRecord[];
  sessionId?: string | null;
  /**
   * Up to two prior low-confidence evidence snippets to explicitly cross-check
   * the new input against (consistency pass, Section 6).
   */
  priorClaimsToCheck?: string[];
}

export interface InferencePrompt {
  system: string;
  user: string;
}

/**
 * Build the system + user prompt for a single inference pass.
 */
export function buildInferencePrompt(args: BuildInferencePromptArgs): InferencePrompt {
  const { newInput, source, cvFacts, priorSignals, priorClaimsToCheck } = args;

  const signalCatalog = SIGNAL_REGISTRY.map(
    (s) => `- ${s.key} (${s.category}): ${s.description}`
  ).join("\n");

  const priorState = priorSignals
    .map((s) => {
      const value = s.inferredValue ?? "unknown";
      return `- ${s.key}: confidence=${s.confidence}, value="${value}"`;
    })
    .join("\n");

  const cvBlock = formatCvFacts(cvFacts);
  const priorClaimsBlock =
    priorClaimsToCheck && priorClaimsToCheck.length > 0
      ? priorClaimsToCheck.map((c) => `- ${c}`).join("\n")
      : "(none)";

  const system = [
    "You are an invisible recruiter-signals inference engine embedded inside a career assistant.",
    "You silently gauge 11 recruiter-relevant candidate signals from a single new user input.",
    "You NEVER speak to the user. Your only output is a strict JSON object described below.",
    "",
    "THE 11 SIGNALS (use these exact keys):",
    signalCatalog,
    "",
    "SCORING RULES (apply strictly):",
    "- Re-evaluate ONLY the signals plausibly touched by the new input (plus any CV contradiction it surfaces). Leave everything else untouched by omitting it from `updates`.",
    "- RAISE confidence when the new evidence corroborates the prior value.",
    "- LOWER confidence when the new evidence conflicts with the prior value, AND emit a `contradiction`.",
    "- HOLD (omit the signal from `updates`) when the input carries no signal for that marker.",
    "- Confidence is an integer 0-100. Never exceed 100 or drop below 0.",
    "- NEVER invent evidence. If there is no verbatim support in the input or CV, do not change the score.",
    "- Every update MUST include exactly one `evidence.quote` copied VERBATIM from the new input or CV.",
    `- SATURATION: once a signal's confidence is >= ${SATURATION_THRESHOLD}, only update it on a genuine contradiction.`,
    "- For `job_hopper_vs_circumstantial`, store the REASON (e.g. \"circumstantial: layoffs\" vs \"restless\") in `inferredValue`.",
    "- Passive cues matter: unprompted salary talk -> money_driven; \"we\" vs \"I\" -> independent_vs_supervised; effort/length trends -> sustained_vs_fading_effort.",
    "",
    "OUTPUT: return ONLY this JSON object, no prose, no markdown fences:",
    JSON.stringify(
      {
        updates: [
          {
            key: "technical_growth_driven",
            inferredValue: "Technical-growth",
            confidence: 72,
            evidence: {
              quote: "I love working with the newest frameworks",
              source: "message",
            },
            contradiction: null,
          },
        ],
      },
      null,
      2
    ),
    "",
    "`contradiction` is either null or { \"description\": \"...\", \"conflicting\": [\"CV: 4 jobs in 3 years\", \"user: 'I value stability'\"] }.",
    "If nothing should change, return { \"updates\": [] }.",
  ].join("\n");

  const user = [
    `NEW INPUT (source=${source}):`,
    newInput,
    "",
    "CV FACTS (for cross-reference / contradiction detection):",
    cvBlock,
    "",
    "PRIOR SIGNAL STATE:",
    priorState,
    "",
    "PRIOR LOW-CONFIDENCE CLAIMS TO CROSS-CHECK (align -> boost; contradict -> lower + flag):",
    priorClaimsBlock,
    "",
    "Return the JSON object now.",
  ].join("\n");

  return { system, user };
}

function formatCvFacts(cvFacts: unknown): string {
  if (cvFacts === null || cvFacts === undefined) {
    return "(none)";
  }
  try {
    const asString = typeof cvFacts === "string" ? cvFacts : JSON.stringify(cvFacts);
    const trimmed = asString.trim();
    if (!trimmed || trimmed === "{}" || trimmed === "[]") {
      return "(none)";
    }
    // Keep the prompt bounded.
    return trimmed.length > 4000 ? `${trimmed.slice(0, 4000)}…` : trimmed;
  } catch {
    return "(none)";
  }
}
