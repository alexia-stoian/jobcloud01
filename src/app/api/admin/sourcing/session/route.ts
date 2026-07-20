import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { readBackForRecruiter } from "@/lib/sourcing/session-dal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cap the number of candidate ids one read-back may resolve. */
const MAX_USER_IDS = 50;

/**
 * Admin-gated recruiter read-back for the Sourcing cards.
 *
 * Gate: `requireAdmin()` runs FIRST — before any DB read. Non-admins and
 * unauthenticated callers get a `404`. Per requested candidate, returns the
 * most-recent question-set's public shape (prompt + the candidate's answer +
 * the before/after fit). Server-only correctness fields
 * (`isCorrect`/`isOpen`/`gapLabel`/`satisfiedNeed`/`needsSnapshot`) are NEVER
 * included — `readBackForRecruiter` already strips them.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const gate = await requireAdmin();
  if ("response" in gate) {
    return gate.response;
  }

  const { searchParams } = new URL(request.url);
  const userIds = (searchParams.get("userIds") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0)
    .slice(0, MAX_USER_IDS);

  if (userIds.length === 0) {
    return NextResponse.json({ candidates: [] });
  }

  const readBack = await readBackForRecruiter(userIds);
  const candidates = readBack.map((candidate) => {
    const questions = candidate.questions.map((question) => ({
      prompt: question.prompt,
      // The chosen option label, else the free-text answer, else unanswered.
      answer: question.chosenLabel ?? question.freeText ?? null
    }));
    return {
      candidateUserId: candidate.candidateUserId,
      fitBefore: candidate.fitBefore,
      fitAfter: candidate.fitAfter,
      answered: questions.some((question) => question.answer !== null),
      questions
    };
  });

  return NextResponse.json({ candidates });
}
