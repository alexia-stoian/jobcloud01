/**
 * Grounded gap-question generator for Phase 11 sourcing.
 *
 * SERVER-ONLY. Turns ONLY the unmet/partial recruiter-requirement gaps into a
 * small set (<=5) of grounded multiple-choice questions, each with exactly one
 * correct option, three distractors, and an appended open "write your own answer"
 * option. The `isCorrect`/`isOpen` flags and `gapLabel` are SERVER-ONLY;
 * `stripPublicOptions` is the single choke point that removes them before any
 * question reaches a candidate. When there are no gaps or the LLM is unavailable,
 * generation degrades to an empty list (no questions).
 */

import type { RecruiterNeeds, SourcingResult, CandidateBundle } from "./types";
import { callAnthropic, parseLlmJson } from "./anthropic";

/** A stored option. `isCorrect`/`isOpen` are SERVER-ONLY and must be stripped. */
export interface SourcingOption {
  value: string;
  label: string;
  /** SERVER-ONLY: whether this is the recruiter-satisfying answer. */
  isCorrect: boolean;
  /** SERVER-ONLY: whether this is the free-text "write your own answer" path. */
  isOpen: boolean;
}

/** A generated gap question with its server-only context and options. */
export interface GeneratedQuestion {
  /** SERVER-ONLY: the checklist gap this question targets. */
  gapLabel: string;
  prompt: string;
  orderIndex: number;
  options: SourcingOption[];
  allowCustom: boolean;
}

/** A candidate-safe option — no correctness/openness flags. */
export interface PublicOption {
  value: string;
  label: string;
  description?: string;
}

/** A candidate-safe question — no gapLabel, no server-only option flags. */
export interface PublicQuestion {
  prompt: string;
  allowCustom: boolean;
  options: PublicOption[];
}

/** Maximum questions delivered per candidate (CONTEXT: <=5). */
const MAX_QUESTIONS = 5;
/** Token budget for one candidate's generation call. */
const GENERATION_MAX_TOKENS = 2048;

/** The raw question shape requested from the model (before server post-processing). */
type LlmQuestion = {
  gapLabel?: unknown;
  prompt?: unknown;
  options?: unknown;
  allowOpen?: unknown;
};
type LlmOption = { label?: unknown; isCorrect?: unknown };

/** Fisher–Yates shuffle on a copy — position must not reveal the correct option. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function clampText(value: unknown, max = 400): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/**
 * Build a compact, PRIVATE snapshot of the candidate's real background (recent
 * roles, claimed skills, years) so the model can anchor questions in the
 * candidate's own history. This is never shown to the candidate — it only lets
 * the questions reference specifics that an AI, given just a screenshot, cannot
 * answer on the candidate's behalf.
 */
function buildCandidateContext(candidate?: CandidateBundle): string {
  if (!candidate) {
    return "";
  }
  const roles = candidate.experience.slice(0, 3).map((exp) => {
    const where = exp.company ? ` at ${exp.company}` : "";
    const desc = exp.description ? ` — ${clampText(exp.description, 160)}` : "";
    return `  - ${clampText(exp.title, 80)}${where}${desc}`;
  });
  const skills = candidate.skills.slice(0, 12).map((s) => clampText(s, 40)).filter(Boolean).join(", ");
  const years = candidate.estimatedYearsExperience;
  return [
    candidate.primaryRole ? `Current/primary role: ${clampText(candidate.primaryRole, 80)}` : "",
    typeof years === "number" && years > 0 ? `Approx. years of experience: ${years}` : "",
    skills ? `Skills they claim: ${skills}` : "",
    roles.length ? `Recent experience:\n${roles.join("\n")}` : ""
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * Build the strict-JSON generation prompt, grounded ONLY in the supplied gap
 * labels + role (the recruiter needs are already sanitized upstream). We never
 * embed raw recruiter JSON, signal keys, or the recruiter's identity.
 */
function buildPrompt(gaps: string[], roleLabel: string, candidateContext: string): string {
  const gapList = gaps.map((g, i) => `${i + 1}. ${g}`).join("\n");
  return [
    "You design a subtle screening quiz that helps a recruiter tell genuinely",
    "strong candidates apart from people who exaggerate. The CANDIDATE answers these",
    "questions, so they must NOT be able to guess what the recruiter wants to hear,",
    "and must NOT be able to answer by pasting a screenshot into an AI assistant.",
    roleLabel ? `Target role: ${roleLabel}` : "",
    candidateContext
      ? ["", "Candidate background (PRIVATE — never shown to them):", candidateContext].join("\n")
      : "",
    "",
    "For EACH topic below, write ONE multiple-choice question that probes REAL depth",
    "on that topic INDIRECTLY. Ground each question ONLY in the listed topic — do not",
    "invent unrelated requirements.",
    "",
    "Topics:",
    gapList,
    "",
    "Make the questions PERSONAL so an AI cannot answer them from a screenshot:",
    "- Anchor each question in THIS candidate's own history above — their specific",
    "  roles, projects, and claimed skills — and address them as \"you\"/\"your\".",
    "- Require them to recall a concrete detail, decision, or trade-off from their",
    "  OWN work. An assistant that does not know this person must be unable to pick",
    "  the intended answer; only the real person could recognise it.",
    "- Do NOT quote their CV verbatim or name the exact fact you keyed on, so they",
    "  cannot reverse-engineer what you are testing.",
    "",
    "Make the questions TRICKY so they cannot be gamed:",
    "- Do NOT ask self-rating questions like \"how good/experienced are you with X\",",
    "  and never anything answerable by simply claiming to be excellent.",
    "- All four options must be plausible, similar in length and confidence, and",
    "  phrased neutrally. The correct one must NOT be the most impressive, most",
    "  enthusiastic, most senior-sounding, or most extreme option.",
    "- Distractors must be believable: common misconceptions, surface-level or",
    "  half-right answers, or reasonable-sounding mistakes — never obviously wrong.",
    "- Nothing in the wording, length, order, or tone may hint at which option is",
    "  correct.",
    "",
    "Rules:",
    `- Produce AT MOST ${MAX_QUESTIONS} questions (one per topic, in order).`,
    "- Each question has EXACTLY four options: exactly one with isCorrect:true (the",
    "  answer that reflects what the recruiter actually wants) and three with",
    "  isCorrect:false (plausible but not what the recruiter wants).",
    "- Keep option labels short and concrete. Do not reveal which is correct.",
    "- Set allowOpen to true so the candidate may write their own answer.",
    "",
    "Return STRICT JSON only, no prose, in this exact shape:",
    '{ "questions": [ { "gapLabel": "<the gap>", "prompt": "<question>",',
    '  "options": [ { "label": "<text>", "isCorrect": true },',
    '  { "label": "<text>", "isCorrect": false }, { "label": "<text>", "isCorrect": false },',
    '  { "label": "<text>", "isCorrect": false } ], "allowOpen": true } ] }'
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** Normalize one LLM question into a stored 5-option question, or `null` if unusable. */
function normalizeQuestion(raw: LlmQuestion, gapFallback: string, orderIndex: number): GeneratedQuestion | null {
  const prompt = clampText(raw.prompt);
  if (!prompt) {
    return null;
  }
  const gapLabel = clampText(raw.gapLabel) || gapFallback;

  const rawOptions = Array.isArray(raw.options) ? (raw.options as LlmOption[]) : [];
  const provided = rawOptions
    .map((o) => ({ label: clampText(o.label, 200), isCorrect: o.isCorrect === true }))
    .filter((o) => o.label.length > 0)
    .slice(0, 4);

  if (provided.length < 2) {
    // Not enough to form a meaningful MCQ.
    return null;
  }

  // Guarantee exactly one correct option: keep the first correct, demote the rest;
  // if none was flagged, promote the first option.
  let seenCorrect = false;
  const normalized = provided.map((o) => {
    const isCorrect = o.isCorrect && !seenCorrect;
    if (isCorrect) {
      seenCorrect = true;
    }
    return { label: o.label, isCorrect };
  });
  if (!seenCorrect) {
    normalized[0].isCorrect = true;
  }

  const shuffled = shuffle(normalized).map((o, i) => ({
    value: `o${i}`,
    label: o.label,
    isCorrect: o.isCorrect,
    isOpen: false
  }));

  // The "write your own answer" path is the free-text input (allowCustom), NOT a
  // selectable choice — so we do NOT add an open option button here.
  return { gapLabel, prompt, orderIndex, options: shuffled, allowCustom: true };
}

/** Friendly personality/behaviour topics per recruiter-preferred signal key. */
const SIGNAL_TOPIC: Record<string, string> = {
  personal_growth_driven: "Your motivation to keep growing and learning",
  technical_growth_driven: "Your passion for the technical craft",
  true_vs_claimed_proficiency: "The real depth of your core skills",
  sustained_vs_fading_effort: "Following through on long, demanding projects",
  independent_vs_supervised: "Working independently and owning outcomes",
  stress_behavior: "Staying calm and effective under pressure",
  stability_driven: "Your commitment to staying long-term"
};

/**
 * For a strong candidate with few/no unmet requirements, derive "strengthening"
 * topics from the recruiter's needs so any qualifying (>=60%) candidate still
 * receives questions (per spec: skills, languages, experience, personality
 * traits, other relevant details). Excludes anything already covered by a gap.
 */
function buildStrengtheningTopics(needs: RecruiterNeeds, exclude: string[]): string[] {
  const seen = new Set(exclude.map((g) => g.toLowerCase()));
  const topics: string[] = [];
  const add = (label: string): void => {
    const key = label.toLowerCase();
    if (label.trim().length > 0 && !seen.has(key)) {
      seen.add(key);
      topics.push(label);
    }
  };

  for (const skill of needs.requiredSkills ?? []) add(`Depth of your hands-on experience with ${skill}`);
  for (const skill of needs.niceToHaveSkills ?? []) add(`Your experience with ${skill}`);
  for (const lang of needs.languages ?? []) add(`Using ${lang} confidently at work`);
  for (const key of Object.keys(needs.preferredSignals ?? {})) if (SIGNAL_TOPIC[key]) add(SIGNAL_TOPIC[key]);
  if (needs.role) add(`Why you're a great fit for the ${needs.seniority ? `${needs.seniority} ` : ""}${needs.role} role`);
  if (typeof needs.minYearsExperience === "number") add("A standout achievement from your recent experience");
  if (needs.notes) add("How you align with the team's priorities for this role");

  return topics;
}

/**
 * Generate <=5 grounded MCQs for one candidate. Topics come from the candidate's
 * unmet/partial checklist items first; for a strong candidate with fewer than
 * MAX_QUESTIONS gaps, they are supplemented with "strengthening" topics from the
 * recruiter's needs so any >=60% candidate still receives questions. Returns []
 * only when there is genuinely nothing to ask or the LLM is unavailable.
 */
export async function generateGapQuestions(
  needs: RecruiterNeeds,
  result: SourcingResult,
  candidate?: CandidateBundle
): Promise<GeneratedQuestion[]> {
  const gaps = result.checklist.filter((c) => c.status !== "met").map((c) => c.label);
  const topics =
    gaps.length >= MAX_QUESTIONS
      ? gaps.slice(0, MAX_QUESTIONS)
      : [...gaps, ...buildStrengtheningTopics(needs, gaps)].slice(0, MAX_QUESTIONS);
  if (topics.length === 0) {
    return [];
  }

  const roleLabel = clampText(needs.role, 120);
  const prompt = buildPrompt(topics, roleLabel, buildCandidateContext(candidate));

  const raw = await callAnthropic(prompt, GENERATION_MAX_TOKENS);
  if (!raw) {
    return [];
  }

  const parsed = parseLlmJson<{ questions?: LlmQuestion[] }>(raw);
  const rawQuestions = parsed && Array.isArray(parsed.questions) ? parsed.questions : [];
  if (rawQuestions.length === 0) {
    return [];
  }

  const questions: GeneratedQuestion[] = [];
  for (const rawQuestion of rawQuestions) {
    if (questions.length >= MAX_QUESTIONS) {
      break;
    }
    const gapFallback = topics[questions.length] ?? topics[0] ?? "";
    const normalized = normalizeQuestion(rawQuestion, gapFallback, questions.length);
    if (normalized) {
      questions.push(normalized);
    }
  }

  return questions;
}

/**
 * Strip every server-only field from a question so nothing correctness-revealing
 * can leave the server. Drops `gapLabel` and each option's `isCorrect`/`isOpen`.
 * This is the SINGLE choke point for candidate-facing question delivery.
 */
export function stripPublicOptions(question: GeneratedQuestion): PublicQuestion {
  return {
    prompt: question.prompt,
    allowCustom: question.allowCustom,
    options: question.options.map((option) => ({
      value: option.value,
      label: option.label
    }))
  };
}
