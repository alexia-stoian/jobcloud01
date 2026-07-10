import { NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import { restoreOnboardingState } from "@/lib/onboarding/resume-state";
import { getInteractiveQuestionStateForMode } from "@/lib/onboarding/interactive";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const onboarding = await db.onboardingSession.findUnique({ where: { userId: session.user.id } });
  if (!onboarding) {
    return NextResponse.json({ error: "onboarding_not_started" }, { status: 404 });
  }

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      fullName: true,
      currentJobSituation: true,
      employmentObjective: true,
      primaryRole: true,
      preferredLocation: true,
      targetRoles: true,
      targetSeniority: true,
      targetIndustries: true,
      preferredWorkModel: true,
      contractPreference: true,
      workRate: true,
      workPermitStatus: true,
      salaryExpectation: true,
      visaSponsorship: true,
      relocationWillingness: true,
      commuteRadius: true
    }
  });

  const hasCvUpload = Boolean(
    onboarding.cvFileName ||
      (onboarding.cvExtractedFacts && Object.keys(onboarding.cvExtractedFacts as Record<string, unknown>).length > 0)
  );

  const state = getInteractiveQuestionStateForMode({
    fullName: profile?.fullName,
    currentJobSituation: profile?.currentJobSituation,
    employmentObjective: profile?.employmentObjective,
    primaryRole: profile?.primaryRole,
    preferredLocation: profile?.preferredLocation,
    targetRoles: profile?.targetRoles,
    targetSeniority: profile?.targetSeniority,
    targetIndustries: profile?.targetIndustries,
    preferredWorkModel: profile?.preferredWorkModel,
    contractPreference: profile?.contractPreference,
    workRate: profile?.workRate,
    workPermitStatus: profile?.workPermitStatus,
    salaryExpectation: profile?.salaryExpectation,
    visaSponsorship: profile?.visaSponsorship,
    relocationWillingness: profile?.relocationWillingness,
    commuteRadius: profile?.commuteRadius
  }, {
    hasCvUpload
  });

  const resumed = restoreOnboardingState({
    userId: onboarding.userId,
    locale: onboarding.locale as "en" | "de" | "fr",
    currentStep: onboarding.currentStep as "cv_upload" | "cv_extract" | "questioning" | "confirming" | "complete",
    targetRole: onboarding.targetRole,
    cvFileName: onboarding.cvFileName,
    cvMimeType: onboarding.cvMimeType,
    cvExtractedFacts: onboarding.cvExtractedFacts as Record<string, unknown>,
    cvUncertainFacts: onboarding.cvUncertainFacts as Record<string, unknown>,
    conversationHistory: onboarding.conversationHistory as Array<{ role: "assistant" | "user"; text: string; options?: Array<{ value: string; label: string; description?: string }>; field?: string }>,
    pendingQuestions: onboarding.pendingQuestions as Array<{ id: string; field?: string; text: string; required: boolean; reason?: string }>,
    skippedQuestionIds: onboarding.skippedQuestionIds as string[],
    confirmedQuestionIds: onboarding.confirmedQuestionIds as string[],
    lastInteractedAt: onboarding.lastInteractedAt?.toISOString() ?? null
  });

  return NextResponse.json({
    success: true,
    onboarding,
    history: onboarding.conversationHistory,
    question: state.question,
    done: state.done,
    hasCvUpload,
    ...resumed
  });
}
