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
    "WHAT TO LOOK FOR (infer from IDEAS and IMPLICATIONS, not just literal keywords):",
    "- money_driven: talk of salary, bonus, compensation, raises, negotiating, 'worth', 'pay', asking about comp early, motivation framed around earning.",
    "- stability_driven: wanting security, long tenure, established/large companies, predictability, low risk, 'stable', 'settle', avoiding startups, benefits/pension.",
    "- personal_growth_driven: wanting to learn, be mentored, grow, take on new responsibilities, leadership development, 'develop myself', 'stretch', career progression.",
    "- technical_growth_driven: excitement about cutting-edge tech, new frameworks/tools, deep technical challenges, mastering a stack, 'latest', 'state of the art', AI/ML, building complex systems, 'I love building', deep-diving a technology.",
    "- job_hopper_vs_circumstantial: short tenures or frequent moves (from CV) vs. stable history; store the REASON in inferredValue (e.g. 'circumstantial: layoffs/relocation' vs 'restless: leaves when bored').",
    "- real_vs_stated_motivation: when the TRUE driver differs from what they claim (e.g. says 'growth' but everything they emphasize is pay, or vice versa). Flag as a contradiction.",
    "- stress_behavior: composure under pressure, how they handle tough/curveball interview questions, conflict, deadlines; 'I stay calm', panic, defensiveness, structured vs. flustered answers.",
    "- true_vs_claimed_proficiency: depth actually demonstrated vs. CV claims — specific, detailed, correct technical detail = high; vague/buzzwordy about a claimed skill = gap.",
    "- independent_vs_supervised: autonomy and ownership vs. needing direction; 'I decided/owned/drove' and 'I' framing => independent; 'we', 'my manager told me', 'I was assigned' => more supervised.",
    "- sustained_vs_fading_effort: follow-through and finishing long projects vs. early enthusiasm that fades; 'shipped/finished/maintained for years' => sustained; many started-but-abandoned things => fading.",
    "- overqualified_bored_risk: seniority/skill clearly exceeds the target role's demands (from CV vs. target role) => higher risk of boredom/attrition.",
    "",
    "SCORING RULES (apply thoughtfully — be attentive, not stingy):",
    "- Most substantive answers reveal AT LEAST ONE motivation, behavioral, or skill signal. Read for the underlying idea and extract it. Do not miss signals just because the exact keyword is absent.",
    "- Re-evaluate every signal plausibly touched by the new input (a single rich answer often moves 2-4 signals). Omit only the signals with genuinely no cue.",
    "- Confidence is an integer 0-100 representing how sure you are of the inferred value. Calibrate: a first clear cue => 40-65; an explicit/strong statement => 65-85; repeated corroboration across inputs => 85-95. A weak/indirect hint => 20-40.",
    "- RAISE confidence when new evidence corroborates the prior value; LOWER it (and emit a `contradiction`) when new evidence conflicts with the prior value.",
    "- HOLD (omit the signal) only when the input gave you NO opportunity at all to observe that marker.",
    "- NEUTRAL / ABSENCE IS A VALID OUTCOME: if the input clearly gave you a chance to observe a marker but it did NOT manifest, still record a LOW-confidence (20-40) assessment describing the neutral/absent finding rather than omitting it — e.g. real_vs_stated_motivation: \"stated and revealed drivers appear consistent\"; overqualified_bored_risk: \"seniority matches the target role, low boredom risk\"; money_driven: \"no compensation-first cues\". This is important during interviews so every probed trait ends with an explicit outcome instead of staying unknown.",
    "- NEVER fabricate. Every update MUST include exactly one `evidence.quote` copied VERBATIM from the new input or CV — quote the phrase that reveals the signal (paraphrase is NOT allowed in the quote). For a neutral/absence finding, quote the phrase that gave you the chance to observe it.",
    `- SATURATION: once a signal's confidence is >= ${SATURATION_THRESHOLD}, only update it on a genuine contradiction.`,
    "- Passive cues count as evidence: unprompted salary talk -> money_driven; 'we' vs 'I' -> independent_vs_supervised; long detailed answers -> engagement/sustained effort; terse answers -> lower engagement.",
    "- BE CONCISE to keep the JSON small: keep each `inferredValue` under ~12 words and each `evidence.quote` a short verbatim snippet under ~15 words. Output compact JSON.",
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
    "If the input genuinely carries no signal at all (e.g. 'start the interview', 'yes', 'ok'), return { \"updates\": [] }.",
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
