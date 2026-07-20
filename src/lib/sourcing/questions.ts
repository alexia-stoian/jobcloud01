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

import type { RecruiterNeeds, SourcingResult } from "./types";
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
const GENERATION_MAX_TOKENS = 1500;

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
 * Build the strict-JSON generation prompt, grounded ONLY in the supplied gap
 * labels + role (the recruiter needs are already sanitized upstream). We never
 * embed raw recruiter JSON, signal keys, or the recruiter's identity.
 */
function buildPrompt(gaps: string[], roleLabel: string): string {
  const gapList = gaps.map((g, i) => `${i + 1}. ${g}`).join("\n");
  return [
    "You help a candidate close specific skill/experience gaps for a role.",
    roleLabel ? `Target role: ${roleLabel}` : "",
    "",
    "For EACH gap below, write ONE friendly multiple-choice question that lets the",
    "candidate show whether they can close that gap. Ground each question ONLY in",
    "the listed gap — do not invent unrelated requirements.",
    "",
    "Gaps:",
    gapList,
    "",
    "Rules:",
    `- Produce AT MOST ${MAX_QUESTIONS} questions (one per gap, in order).`,
    "- Each question has EXACTLY four options: exactly one with isCorrect:true (the",
    "  answer a recruiter wants) and three with isCorrect:false (plausible but not",
    "  what the recruiter wants).",
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

  // Append the open "write your own answer" option (never correct).
  shuffled.push({
    value: "open",
    label: "write your own answer",
    isCorrect: false,
    isOpen: true
  });

  return { gapLabel, prompt, orderIndex, options: shuffled, allowCustom: true };
}

/**
 * Generate <=5 gap-grounded MCQs for one candidate. Gaps are derived from the
 * candidate's checklist items whose status is NOT "met". Returns [] when there
 * are no gaps or the LLM is unavailable/unparseable.
 */
export async function generateGapQuestions(
  needs: RecruiterNeeds,
  result: SourcingResult
): Promise<GeneratedQuestion[]> {
  const gaps = result.checklist.filter((c) => c.status !== "met").map((c) => c.label);
  if (gaps.length === 0) {
    return [];
  }

  const roleLabel = clampText(needs.role, 120);
  const prompt = buildPrompt(gaps.slice(0, MAX_QUESTIONS), roleLabel);

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
    const gapFallback = gaps[questions.length] ?? gaps[0] ?? "";
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
