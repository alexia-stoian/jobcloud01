/**
 * Candidate-scoped data-access layer for Phase 11 sourcing.
 *
 * SERVER-ONLY. The single module Plans 2 and 3 use to read/write the sourcing
 * tables. EVERY candidate-facing read/write is scoped by `candidateUserId` — a
 * client-supplied candidate id alone is never trusted. Server-only correctness
 * data (`isCorrect`/`isOpen`/`gapLabel`/`satisfiedNeed`) is persisted here but
 * NEVER included in the shape `readBackForRecruiter` returns.
 */

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { RecruiterNeeds } from "./types";
import type { GeneratedQuestion, SourcingOption } from "./questions";

/** Non-completed statuses that count as an "active" question-set. */
const ACTIVE_STATUSES = ["pending", "delivering"] as const;

export interface CreateSourcingRunArgs {
  recruiterUserId: string;
  needsSnapshot: RecruiterNeeds;
  roleLabel?: string | null;
  resultsSnapshot?: unknown;
}

/** Create a new recruiter sourcing run (the parent session). */
export async function createSourcingRun(args: CreateSourcingRunArgs) {
  return db.sourcingSession.create({
    data: {
      recruiterUserId: args.recruiterUserId,
      needsSnapshot: args.needsSnapshot as unknown as Prisma.InputJsonValue,
      resultsSnapshot: (args.resultsSnapshot ?? {}) as Prisma.InputJsonValue,
      roleLabel: args.roleLabel ?? null
    }
  });
}

/**
 * The MOST-RECENT sourcing run's displayed results snapshot, for ANY admin. This
 * is what makes the admin Sourcing page persist across all connections/logins:
 * it is scoped to the administrative part of the app, not to a specific user.
 */
export async function getLatestSourcingRun() {
  return db.sourcingSession.findFirst({
    orderBy: { createdAt: "desc" },
    select: { resultsSnapshot: true, roleLabel: true, createdAt: true }
  });
}

export interface QueueCandidateQuestionsArgs {
  sessionId: string;
  candidateUserId: string;
  fitBefore: number;
  questions: GeneratedQuestion[];
}

/**
 * Queue a candidate's question-set (status `pending`) with its questions. The
 * FULL options (including the server-only `isCorrect`/`isOpen` flags) are
 * persisted; stripping happens only at delivery / read-back time.
 */
export async function queueCandidateQuestions(args: QueueCandidateQuestionsArgs) {
  return db.sourcingCandidate.create({
    data: {
      sessionId: args.sessionId,
      candidateUserId: args.candidateUserId,
      fitBefore: args.fitBefore,
      status: "pending",
      questions: {
        create: args.questions.map((q) => ({
          orderIndex: q.orderIndex,
          gapLabel: q.gapLabel,
          prompt: q.prompt,
          options: q.options as unknown as Prisma.InputJsonValue,
          allowCustom: q.allowCustom
        }))
      }
    },
    include: { questions: { orderBy: { orderIndex: "asc" } } }
  });
}

/**
 * The newest NON-completed (`pending`/`delivering`) question-set for a candidate,
 * used by Plan 2's one-active-set guard before queueing a new run. Returns `null`
 * when the candidate has no active set. Scoped by `candidateUserId`.
 */
export async function findActiveCandidate(candidateUserId: string) {
  return db.sourcingCandidate.findFirst({
    where: {
      candidateUserId,
      status: { in: [...ACTIVE_STATUSES] }
    },
    orderBy: { createdAt: "desc" }
  });
}

/**
 * The newest non-completed question-set for a candidate, including its questions
 * (ordered by `orderIndex`) and their answers — the delivery read path. Returns
 * `null` when none. Scoped by `candidateUserId`.
 */
export async function getPendingCandidate(candidateUserId: string) {
  return db.sourcingCandidate.findFirst({
    where: {
      candidateUserId,
      status: { not: "completed" }
    },
    orderBy: { createdAt: "desc" },
    include: {
      questions: {
        orderBy: { orderIndex: "asc" },
        include: { answer: true }
      }
    }
  });
}

/**
 * The human-readable answer text for one answered question (chosen option label,
 * or the candidate's free text) — used by the candidate delivery GET to render
 * the answered transcript. Chosen-option labels are resolved from the stored
 * (full) options; nothing correctness-revealing is included.
 */
export function answerDisplayText(
  options: unknown,
  chosenValue: string | null,
  freeText: string | null
): string {
  const trimmed = freeText?.trim();
  if (trimmed) {
    return trimmed;
  }
  return labelForChosenValue(options, chosenValue) ?? chosenValue ?? "";
}

/**
 * Most-recent question-set for a candidate REGARDLESS of status (including
 * `completed`), with questions (ordered) + answers. Used by the candidate
 * delivery GET to render the full Q&A transcript so it persists across sessions.
 * Scoped by `candidateUserId`.
 */
export async function getLatestCandidateForDisplay(candidateUserId: string) {
  return db.sourcingCandidate.findFirst({
    where: { candidateUserId },
    orderBy: { createdAt: "desc" },
    include: {
      questions: {
        orderBy: { orderIndex: "asc" },
        include: { answer: true }
      }
    }
  });
}

export interface RecordAnswerArgs {
  questionId: string;
  chosenValue?: string | null;
  freeText?: string | null;
  satisfiedNeed?: boolean;
}

/** Upsert a candidate's answer to one question (silent `satisfiedNeed` judgment). */
export async function recordAnswer(args: RecordAnswerArgs) {
  const data = {
    chosenValue: args.chosenValue ?? null,
    freeText: args.freeText ?? null,
    satisfiedNeed: args.satisfiedNeed ?? false
  };
  return db.sourcingAnswer.upsert({
    where: { questionId: args.questionId },
    create: { questionId: args.questionId, ...data },
    update: data
  });
}

export interface CompleteCandidateArgs {
  candidateId: string;
  fitAfter: number;
}

/** Mark a candidate's set completed and persist the re-scored fit. */
export async function completeCandidate(args: CompleteCandidateArgs) {
  return db.sourcingCandidate.update({
    where: { id: args.candidateId },
    data: { status: "completed", fitAfter: args.fitAfter }
  });
}

/** One question in the recruiter-facing read-back — no server-only fields. */
export interface ReadBackQuestion {
  prompt: string;
  /** The chosen option's label, or `null` for an open answer. */
  chosenLabel: string | null;
  /** The candidate's free-text answer, or `null` when a choice was made. */
  freeText: string | null;
}

/** The recruiter-facing view of one candidate's most-recent question-set. */
export interface ReadBackCandidate {
  candidateUserId: string;
  fitBefore: number;
  fitAfter: number | null;
  questions: ReadBackQuestion[];
}

/** Resolve a chosen option value to its label from the stored (full) options. */
function labelForChosenValue(options: unknown, chosenValue: string | null): string | null {
  if (!chosenValue || !Array.isArray(options)) {
    return null;
  }
  const match = (options as SourcingOption[]).find((o) => o && o.value === chosenValue);
  return match ? match.label : null;
}

/**
 * Per candidate, return the MOST RECENT `SourcingCandidate` by `createdAt`
 * (regardless of status) shaped for the recruiter card. SERVER strips
 * `isCorrect`/`isOpen`/`gapLabel`/`satisfiedNeed` — only the prompt and the
 * candidate's chosen label / free text leave the server.
 */
export async function readBackForRecruiter(
  candidateUserIds: string[]
): Promise<ReadBackCandidate[]> {
  const uniqueIds = Array.from(new Set(candidateUserIds));
  const results: ReadBackCandidate[] = [];

  for (const candidateUserId of uniqueIds) {
    const candidate = await db.sourcingCandidate.findFirst({
      where: { candidateUserId },
      orderBy: { createdAt: "desc" },
      include: {
        questions: {
          orderBy: { orderIndex: "asc" },
          include: { answer: true }
        }
      }
    });
    if (!candidate) {
      continue;
    }

    results.push({
      candidateUserId,
      fitBefore: candidate.fitBefore,
      fitAfter: candidate.fitAfter,
      questions: candidate.questions.map((q) => ({
        prompt: q.prompt,
        chosenLabel: labelForChosenValue(q.options, q.answer?.chosenValue ?? null),
        freeText: q.answer?.freeText ?? null
      }))
    });
  }

  return results;
}
