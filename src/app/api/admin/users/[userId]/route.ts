import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/admin";
import { buildProfileSummary } from "@/lib/profile/summary-builder";
import { loadSignalStateWithMeta } from "@/lib/ai/signals/signal-dal";

/**
 * Admin-only full profile + 11-signals bundle for a single user.
 *
 * Gate: `requireAdmin()` runs FIRST — before any DB read. Non-admins and
 * unauthenticated callers get a `404`. Signal data is served ONLY through this
 * admin-gated endpoint.
 *
 * Returns the complete candidate profile (fields, qualifications, history),
 * onboarding answers/CV facts, and all 11 recruiter signals. A valid userId with
 * no profile still returns `200` with `profile: null` and seeded (11) signals.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
): Promise<NextResponse> {
  const gate = await requireAdmin();
  if ("response" in gate) {
    return gate.response;
  }

  const { userId } = await params;

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true }
  });

  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const profile = await db.candidateProfile.findUnique({
    where: { userId },
    include: {
      qualifications: true,
      historyEvents: { orderBy: { createdAt: "desc" } }
    }
  });

  const onboarding = await db.onboardingSession.findUnique({
    where: { userId },
    select: {
      targetRole: true,
      currentStep: true,
      cvFileName: true,
      cvExtractedFacts: true,
      conversationHistory: true,
      lastInteractedAt: true
    }
  });

  const { signals, inputCount, updatedAt } = await loadSignalStateWithMeta(userId);

  const summary = profile
    ? buildProfileSummary({
        profile,
        qualifications: profile.qualifications,
        history: profile.historyEvents
      })
    : null;

  const name = summary?.profile.fullName?.trim() || user.email.split("@")[0];

  return NextResponse.json({
    user: { id: userId, email: user.email, name },
    profile: summary?.profile ?? null,
    completion: summary?.completion ?? null,
    qualifications: summary?.qualifications ?? [],
    history: summary?.history ?? [],
    onboarding: onboarding ?? null,
    signals,
    inputCount,
    updatedAt
  });
}
