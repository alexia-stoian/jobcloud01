import { NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import { restoreOnboardingState } from "@/lib/onboarding/resume-state";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const onboarding = await db.onboardingSession.findUnique({ where: { userId: session.user.id } });
  if (!onboarding) {
    return NextResponse.json({ error: "onboarding_not_started" }, { status: 404 });
  }

  const resumed = restoreOnboardingState({
    userId: onboarding.userId,
    locale: onboarding.locale as "en" | "de" | "fr",
    currentStep: onboarding.currentStep as "cv_upload" | "cv_extract" | "questioning" | "confirming" | "complete",
    targetRole: onboarding.targetRole,
    cvFileName: onboarding.cvFileName,
    cvMimeType: onboarding.cvMimeType,
    cvExtractedFacts: onboarding.cvExtractedFacts as Record<string, unknown>,
    cvUncertainFacts: onboarding.cvUncertainFacts as Record<string, unknown>,
    pendingQuestions: onboarding.pendingQuestions as Array<{ id: string; field?: string; text: string; required: boolean; reason?: string }>,
    skippedQuestionIds: onboarding.skippedQuestionIds as string[],
    confirmedQuestionIds: onboarding.confirmedQuestionIds as string[],
    lastInteractedAt: onboarding.lastInteractedAt?.toISOString() ?? null
  });

  return NextResponse.json({ success: true, onboarding, ...resumed });
}
