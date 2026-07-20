/**
 * Candidate-facing Sourcing-mode delivery endpoint (Phase 11, Plan 3).
 *
 * SERVER-ONLY. Serves the recruiter-queued gap questions one at a time as an
 * `InteractiveResponse`-shaped MCQ (notify on the first, correctness NEVER
 * revealed, <=5 cap), silently judges open answers, and on the final answer
 * re-scores the candidate's fit with the visible-increase clamp and persists
 * before->now + `status="completed"`.
 *
 * Guardrails:
 *  - EVERY read/write is scoped to `session.user.id` (owner of the
 *    `SourcingCandidate`); a candidate can never reach another user's set.
 *  - The response NEVER contains `isCorrect`/`isOpen`/`satisfiedNeed`/`gapLabel`/
 *    the re-score number — only `stripPublicOptions` output + neutral advance/done.
 *  - Free-text answers are untrusted: clamped before the silent-judge prompt,
 *    which grounds ONLY on need-satisfaction and returns a strict boolean.
 *  - This endpoint is dedicated: sourcing answers NEVER pass through the Phase 10
 *    `/assistant` target-role/interview routing.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import { getPendingCandidate, getLatestCandidateForDisplay, answerDisplayText, recordAnswer, completeCandidate } from "@/lib/sourcing/session-dal";
import { stripPublicOptions, type SourcingOption, type GeneratedQuestion } from "@/lib/sourcing/questions";
import { rescoreFromAnswers } from "@/lib/sourcing/rescore";
import { callAnthropic, parseLlmJson } from "@/lib/sourcing/anthropic";
import { DEFAULT_LOCALE, isSupportedLocale, type SupportedLocale } from "@/i18n/config";
import enMessages from "../../../../../messages/en.json";
import deMessages from "../../../../../messages/de.json";
import frMessages from "../../../../../messages/fr.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** CONTEXT: at most 5 questions are delivered per candidate. */
const MAX_QUESTIONS = 5;
/** Untrusted free-text is clamped before it reaches the silent-judge prompt. */
const FREE_TEXT_MAX = 400;

const MESSAGES: Record<SupportedLocale, unknown> = {
  en: enMessages,
  de: deMessages,
  fr: frMessages
};

/** Resolve a cheerful candidate-facing string from `messages/*.json` (consume-only). */
function sourcingText(locale: SupportedLocale, key: "recruiterInterested" | "thankYou"): string {
  const section = (MESSAGES[locale] as { sourcing?: Record<string, string> }).sourcing;
  return section?.[key] ?? (MESSAGES[DEFAULT_LOCALE] as { sourcing: Record<string, string> }).sourcing[key];
}

function resolveLocale(value: string | null | undefined): SupportedLocale {
  return value && isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

/** The stored question shape returned by `getPendingCandidate` (server-side, full options). */
type StoredQuestion = {
  id: string;
  orderIndex: number;
  gapLabel: string;
  prompt: string;
  options: unknown;
  allowCustom: boolean;
  answer: { chosenValue: string | null; freeText: string | null; satisfiedNeed: boolean } | null;
};

/** Cast the stored (full) options — includes the SERVER-ONLY `isCorrect`/`isOpen`. */
function fullOptions(question: StoredQuestion): SourcingOption[] {
  return Array.isArray(question.options) ? (question.options as SourcingOption[]) : [];
}

/** Strip a stored question to its candidate-safe payload via the single choke point. */
function toPublicPayload(question: StoredQuestion) {
  const generated: GeneratedQuestion = {
    gapLabel: question.gapLabel,
    prompt: question.prompt,
    orderIndex: question.orderIndex,
    options: fullOptions(question),
    allowCustom: question.allowCustom
  };
  const stripped = stripPublicOptions(generated);
  return {
    id: question.id,
    prompt: stripped.prompt,
    options: stripped.options,
    allowCustom: stripped.allowCustom
  };
}

/**
 * GET — serve the next pending question (one at a time). Returns `{ done: true }`
 * when the candidate has no active set or every capped question is answered.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const locale = resolveLocale(new URL(request.url).searchParams.get("locale"));
  // Fetch the most-recent set REGARDLESS of status so a completed set's Q&A
  // transcript still renders (persists across sessions), not just active sets.
  const candidate = await getLatestCandidateForDisplay(session.user.id);
  if (!candidate) {
    return NextResponse.json({ done: true });
  }

  const questions = (candidate.questions as StoredQuestion[]).slice(0, MAX_QUESTIONS);

  // The answered Q&A transcript (in order) — prompt + the candidate's answer text
  // (chosen option label or free text). Rendered client-side so every question
  // and its answer stay visible across sessions.
  const answered = questions
    .filter((q) => q.answer)
    .map((q) => ({
      prompt: q.prompt,
      answerText: answerDisplayText(q.options, q.answer!.chosenValue, q.answer!.freeText)
    }));

  const next = candidate.status !== "completed" ? questions.find((q) => !q.answer) : undefined;
  if (!next) {
    // Completed (or every question answered): return the transcript + thank-you so
    // a returning candidate still sees their full Q&A.
    return NextResponse.json({
      done: true,
      answered,
      message: answered.length > 0 ? sourcingText(locale, "thankYou") : undefined
    });
  }

  // First serve: flip the set to "delivering" (scoped to the owner via updateMany).
  if (candidate.status === "pending") {
    await db.sourcingCandidate.updateMany({
      where: { id: candidate.id, candidateUserId: session.user.id },
      data: { status: "delivering" }
    });
  }

  return NextResponse.json({
    question: toPublicPayload(next),
    notice: next.orderIndex === 0 ? sourcingText(locale, "recruiterInterested") : undefined,
    answered,
    done: false,
    answeredCount: answered.length
  });
}

type PostBody = {
  questionId?: unknown;
  chosenValue?: unknown;
  freeText?: unknown;
  locale?: unknown;
};

/** Silently judge whether a clamped free-text answer satisfies the recruiter's need. */
async function judgeFreeText(question: StoredQuestion, answer: string): Promise<boolean> {
  const options = fullOptions(question);
  const need = options.find((o) => o.isCorrect)?.label ?? question.gapLabel;
  const prompt = [
    "You silently judge whether a candidate's free-text answer satisfies a recruiter's need.",
    `Recruiter's need / gap: ${question.gapLabel}`,
    `An answer that satisfies the need looks like: ${need}`,
    `Question asked: ${question.prompt}`,
    `Candidate's answer: ${answer}`,
    'Return STRICT JSON only: {"satisfied": true} or {"satisfied": false}.'
  ].join("\n");

  const raw = await callAnthropic(prompt, 50);
  if (!raw) {
    return false;
  }
  const parsed = parseLlmJson<{ satisfied?: unknown }>(raw);
  return parsed?.satisfied === true;
}

/** Ask the LLM for a proposed new fit %, then clamp for the guaranteed visible increase. */
async function rescore(fitBefore: number, goodAnswers: number, total: number): Promise<number> {
  const prompt = [
    "You re-score a candidate's job-fit percentage after they answered gap questions.",
    `Current fit percentage: ${fitBefore}`,
    `They answered ${goodAnswers} of ${total} gap questions well.`,
    "Propose a new fit percentage between 0 and 100 (higher when more answers were good).",
    'Return STRICT JSON only: {"fitAfter": <integer 0-100>}.'
  ].join("\n");

  const raw = await callAnthropic(prompt, 50);
  const parsed = raw ? parseLlmJson<{ fitAfter?: unknown }>(raw) : null;
  const llmAfter = typeof parsed?.fitAfter === "number" ? parsed.fitAfter : fitBefore;
  return rescoreFromAnswers({ fitBefore, goodAnswers, llmAfter });
}

/**
 * POST — capture one answer scoped to the owner, advance, and on the final
 * (<=5th) answer re-score + complete + return the cheerful thank-you. NEVER
 * returns any correctness signal.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as PostBody;
  const questionId = typeof body.questionId === "string" ? body.questionId.trim() : "";
  if (!questionId) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  // Distinguish the answer SOURCE by which field is present — never inferred.
  const isOption = typeof body.chosenValue === "string";
  const isFreeText = typeof body.freeText === "string";
  if (isOption === isFreeText) {
    // Neither present, or both present — ambiguous.
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  const locale = resolveLocale(typeof body.locale === "string" ? body.locale : undefined);

  // Load the question ONLY through the candidate-scoped path: a question that
  // does not belong to THIS user's pending set is never found -> 404 (owner scope).
  const candidate = await getPendingCandidate(session.user.id);
  if (!candidate) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const questions = (candidate.questions as StoredQuestion[]).slice(0, MAX_QUESTIONS);
  const question = questions.find((q) => q.id === questionId);
  if (!question) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let satisfiedNeed = false;
  let chosenValue: string | null = null;
  let freeText: string | null = null;

  if (isOption) {
    chosenValue = (body.chosenValue as string).trim();
    const option = fullOptions(question).find((o) => o.value === chosenValue);
    if (!option) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }
    // Correctness is read SERVER-SIDE and never returned.
    satisfiedNeed = option.isCorrect === true;
  } else {
    freeText = (body.freeText as string).slice(0, FREE_TEXT_MAX).trim();
    satisfiedNeed = freeText.length > 0 ? await judgeFreeText(question, freeText) : false;
  }

  await recordAnswer({ questionId: question.id, chosenValue, freeText, satisfiedNeed });

  // Did this answer complete the (<=5) set?
  const answeredIds = new Set(questions.filter((q) => q.answer).map((q) => q.id));
  answeredIds.add(question.id);
  const complete = answeredIds.size >= questions.length;

  if (!complete) {
    // Neutral advance — NO correctness field.
    return NextResponse.json({ done: false });
  }

  // Final answer: tally good answers, re-score with the visible-increase clamp,
  // persist before->now, and thank the candidate.
  const goodAnswers = questions.reduce((count, q) => {
    const satisfied = q.id === question.id ? satisfiedNeed : q.answer?.satisfiedNeed ?? false;
    return count + (satisfied ? 1 : 0);
  }, 0);
  const fitAfter = await rescore(candidate.fitBefore, goodAnswers, questions.length);
  await completeCandidate({ candidateId: candidate.id, fitAfter });

  return NextResponse.json({ done: true, message: sourcingText(locale, "thankYou") });
}
