/**
 * Recruiter-signals question selection + discipline.
 *
 * INTERNAL / INVISIBLE MODULE. Chooses a forced-choice question that targets the
 * lowest-confidence signal — but ONLY when the question also doubles as a
 * genuinely helpful career question, and never during a real service turn or when
 * signals are already confident enough. This module ships the selector, the bank,
 * and the justification; it does not force a question into every turn.
 */

import {
  PROBE_THRESHOLD,
  SATURATION_THRESHOLD,
  type SignalRecord,
} from "./signal-definitions";

export interface ForcedChoiceOption {
  label: string;
  value: string;
}

export interface ForcedChoiceQuestion {
  /** Signal keys this question moves. */
  signalKeys: string[];
  prompt: string;
  options: ForcedChoiceOption[];
  /** The genuine career purpose this question also serves (discipline gate). */
  careerPurpose: string;
}

export interface SelectSignalQuestionArgs {
  signals: SignalRecord[];
  /** True when the user has a real service need this turn — never hijack it. */
  serviceNeedActive: boolean;
  /** Confidence at/above which a signal no longer needs probing (default 60). */
  probeThreshold?: number;
}

/**
 * Forced-choice question bank. EVERY entry must serve a genuine career purpose
 * (enforced by `justifyQuestion`) in addition to moving one or more signals.
 */
export const FORCED_CHOICE_BANK: readonly ForcedChoiceQuestion[] = [
  {
    signalKeys: [
      "money_driven",
      "stability_driven",
      "personal_growth_driven",
      "technical_growth_driven",
    ],
    prompt: "Quick one 🎯 — what matters most in your next role?",
    options: [
      { label: "💰 Pay", value: "pay" },
      { label: "📚 Learning", value: "learning" },
      { label: "🛡️ Security", value: "security" },
      { label: "🔧 Cutting-edge tech", value: "tech" },
    ],
    careerPurpose:
      "clarifies the candidate's priorities so we can target the right roles and offers",
  },
  {
    signalKeys: ["independent_vs_supervised"],
    prompt: "Structure or freedom?",
    options: [
      { label: "Clear direction", value: "structure" },
      { label: "Freedom to figure it out", value: "freedom" },
    ],
    careerPurpose:
      "helps match the candidate to companies with a compatible management style",
  },
  {
    signalKeys: ["stress_behavior"],
    prompt: "Work pace?",
    options: [
      { label: "Fast & dynamic", value: "fast" },
      { label: "Steady & focused", value: "steady" },
    ],
    careerPurpose:
      "helps find an environment whose pace fits how the candidate does their best work",
  },
  {
    signalKeys: ["money_driven", "technical_growth_driven", "personal_growth_driven"],
    prompt: "Two offers: 20% more pay but boring, OR exciting but less pay?",
    options: [
      { label: "More pay", value: "pay" },
      { label: "More exciting", value: "excitement" },
    ],
    careerPurpose:
      "surfaces the real trade-off the candidate is willing to make when weighing offers",
  },
  {
    signalKeys: ["true_vs_claimed_proficiency"],
    prompt: "Deep expert in one area, or versatile across many?",
    options: [
      { label: "Deep expert", value: "deep" },
      { label: "Versatile", value: "versatile" },
    ],
    careerPurpose:
      "shapes how we position the candidate's skills to the roles they're best suited for",
  },
  {
    signalKeys: ["real_vs_stated_motivation", "stability_driven"],
    prompt: "What made you start looking?",
    options: [],
    careerPurpose:
      "understands the candidate's real motivation so the search targets what they actually want",
  },
] as const;

/**
 * Select a signal-serving forced-choice question, or null.
 *
 * Returns null when:
 * - a real service need is active (never hijack a service turn), OR
 * - every signal is at/above the probe threshold, OR
 * - the lowest-confidence signal is already saturated (>= 85).
 *
 * Otherwise picks the lowest-confidence signal and returns the highest-value bank
 * question mapped to it (which, by construction, also serves a career purpose).
 */
export function selectSignalQuestion(
  args: SelectSignalQuestionArgs
): ForcedChoiceQuestion | null {
  const { signals, serviceNeedActive } = args;
  const probeThreshold = args.probeThreshold ?? PROBE_THRESHOLD;

  if (serviceNeedActive) {
    return null;
  }
  if (signals.length === 0) {
    return null;
  }

  // If everything is already confident enough, don't invent a question.
  const allConfident = signals.every((s) => s.confidence >= probeThreshold);
  if (allConfident) {
    return null;
  }

  const ranked = [...signals].sort((a, b) => a.confidence - b.confidence);
  const lowest = ranked[0];

  // Lowest is already saturated — nothing worth probing.
  if (lowest.confidence >= SATURATION_THRESHOLD) {
    return null;
  }

  // Find a bank question that targets the lowest-confidence signal.
  const question = FORCED_CHOICE_BANK.find((q) => q.signalKeys.includes(lowest.key));

  return question ?? null;
}

/**
 * Discipline gate: returns the internal rationale for asking a question. A
 * question with no career purpose is never in the bank, so this always yields a
 * dual-purpose justification.
 */
export function justifyQuestion(q: ForcedChoiceQuestion): string {
  return `targets ${q.signalKeys.join(", ")} AND helps with ${q.careerPurpose}`;
}
