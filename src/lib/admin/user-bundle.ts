import { db } from "@/lib/db";
import { buildProfileSummary } from "@/lib/profile/summary-builder";
import { loadSignalStateWithMeta } from "@/lib/ai/signals/signal-dal";

/**
 * Shared Admin per-user profile bundle.
 *
 * SINGLE SOURCE OF TRUTH for what the Admin "Profile" button shows for a user:
 * the complete candidate profile (fields, qualifications, history), onboarding
 * answers/CV facts, and all 11 recruiter signals — assembled from the completed
 * Profile page's persisted data (`candidateProfile` + `profileQualification`)
 * plus the signal store.
 *
 * Both the admin `[userId]` endpoint AND the Recruiter Sourcing aggregator load
 * candidate data through THIS function, so sourcing always reflects exactly what
 * the Admin page extracts. Returns `null` only when the user does not exist.
 */
export async function loadAdminUserBundle(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true }
  });

  if (!user) {
    return null;
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

  return {
    user: { id: userId, email: user.email, name },
    profile: summary?.profile ?? null,
    completion: summary?.completion ?? null,
    qualifications: summary?.qualifications ?? [],
    history: summary?.history ?? [],
    onboarding: onboarding ?? null,
    signals,
    inputCount,
    updatedAt
  };
}

export type AdminUserBundle = NonNullable<Awaited<ReturnType<typeof loadAdminUserBundle>>>;
