import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import { computeCompletion } from "@/lib/profile/completion-gate";
import { getInteractiveQuestionStateForMode } from "@/lib/onboarding/interactive";
import { canConfirmOnboardingField } from "@/lib/onboarding/confirm-policy";
import { createInitialAssistantState } from "@/types/assistant-state";

type AnswerBody = {
  field?: string;
  value?: string;
};

function asksForInternalDetails(input: string): boolean {
  const text = input.toLowerCase();
  const patterns = [
    /training data/,
    /trained on/,
    /system prompt/,
    /hidden prompt/,
    /internal instruction/,
    /chain[- ]of[- ]thought/,
    /api key/,
    /model (name|config|configuration)/,
    /private context/,
    /reveal (your|the) (prompt|instructions|rules)/
  ];

  return patterns.some((pattern) => pattern.test(text));
}

async function ensureOnboardingSession(userId: string, locale: "en" | "de" | "fr"): Promise<void> {
  try {
    const existing = await db.onboardingSession.findUnique({ where: { userId } });
    if (existing) {
      return;
    }

    await db.onboardingSession.create({
      data: {
        userId,
        locale,
        currentStep: "questioning",
        conversationHistory: [],
        pendingQuestions: [],
        skippedQuestionIds: [],
        confirmedQuestionIds: []
      }
    });
  } catch {
    // Keep interactive onboarding available even if optional local onboarding tables are missing.
  }
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
      commuteRadius: true,
      locale: true,
      isMinimallyComplete: true,
      missingCriticalFields: true
    }
  });

  const locale = (profile?.locale === "de" || profile?.locale === "fr" ? profile.locale : "en") as "en" | "de" | "fr";
  await ensureOnboardingSession(session.user.id, locale);

  const onboarding = await db.onboardingSession.findUnique({
    where: { userId: session.user.id },
    select: {
      cvFileName: true,
      cvExtractedFacts: true
    }
  });

  const hasCvUpload = Boolean(
    onboarding?.cvFileName ||
      (onboarding?.cvExtractedFacts && Object.keys(onboarding.cvExtractedFacts as Record<string, unknown>).length > 0)
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

  return NextResponse.json({
    question: state.question,
    done: state.done,
    hasCvUpload,
    completedFields: state.completedFields,
    missingFields: state.missingFields,
    completion: {
      isMinimallyComplete: profile?.isMinimallyComplete ?? false,
      missingCriticalFields: (profile?.missingCriticalFields as string[] | undefined) ?? []
    }
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as AnswerBody;
  const field = body.field?.trim() ?? "";
  const value = body.value?.trim() ?? "";

  if (asksForInternalDetails(value)) {
    return NextResponse.json({
      blocked: true,
      message: "I cannot share internal instructions or training details. I can continue helping with your job-search profile right away."
    });
  }

  if (!field || !value || !canConfirmOnboardingField(field)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  // Guard against stale sessions: a valid JWT can outlive its User row (e.g. after
  // a DB reset). Creating a profile for a non-existent user violates the FK and
  // 500s. Verify the user exists and return 401 so the client re-authenticates.
  const userExists = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true }
  });
  if (!userExists) {
    return NextResponse.json({ error: "session_invalid" }, { status: 401 });
  }

  const profile = await db.candidateProfile.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      locale: "en",
      assistantState: JSON.parse(JSON.stringify(createInitialAssistantState())),
      [field]: value
    },
    update: {
      [field]: value
    }
  });

  const completion = computeCompletion(profile);

  const updatedProfile = await db.candidateProfile.update({
    where: { id: profile.id },
    data: {
      isMinimallyComplete: completion.isMinimallyComplete,
      missingCriticalFields: completion.missingCriticalFields,
      lastCompletionCheckAt: new Date()
    },
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
      commuteRadius: true,
      locale: true,
      isMinimallyComplete: true,
      missingCriticalFields: true
    }
  });

  await ensureOnboardingSession(session.user.id, (updatedProfile.locale === "de" || updatedProfile.locale === "fr" ? updatedProfile.locale : "en") as "en" | "de" | "fr");

  const onboarding = await db.onboardingSession.findUnique({
    where: { userId: session.user.id },
    select: {
      cvFileName: true,
      cvExtractedFacts: true
    }
  });

  const hasCvUpload = Boolean(
    onboarding?.cvFileName ||
      (onboarding?.cvExtractedFacts && Object.keys(onboarding.cvExtractedFacts as Record<string, unknown>).length > 0)
  );

  try {
    const onboardingSession = await db.onboardingSession.findUnique({ where: { userId: session.user.id } });
    if (onboardingSession) {
      const confirmedQuestionIds = Array.isArray(onboardingSession.confirmedQuestionIds)
        ? onboardingSession.confirmedQuestionIds.filter((id): id is string => typeof id === "string")
        : [];

      if (!confirmedQuestionIds.includes(field)) {
        confirmedQuestionIds.push(field);
      }

      await db.onboardingSession.update({
        where: { userId: session.user.id },
        data: {
          currentStep: "questioning",
          confirmedQuestionIds,
          lastInteractedAt: new Date()
        }
      });
    }
  } catch {
    // Interactive profile filling should still work without onboarding session persistence.
  }

  const state = getInteractiveQuestionStateForMode({
    fullName: updatedProfile.fullName,
    currentJobSituation: updatedProfile.currentJobSituation,
    employmentObjective: updatedProfile.employmentObjective,
    primaryRole: updatedProfile.primaryRole,
    preferredLocation: updatedProfile.preferredLocation,
    targetRoles: updatedProfile.targetRoles,
    targetSeniority: updatedProfile.targetSeniority,
    targetIndustries: updatedProfile.targetIndustries,
    preferredWorkModel: updatedProfile.preferredWorkModel,
    contractPreference: updatedProfile.contractPreference,
    workRate: updatedProfile.workRate,
    workPermitStatus: updatedProfile.workPermitStatus,
    salaryExpectation: updatedProfile.salaryExpectation,
    visaSponsorship: updatedProfile.visaSponsorship,
    relocationWillingness: updatedProfile.relocationWillingness,
    commuteRadius: updatedProfile.commuteRadius
  }, {
    hasCvUpload
  });

  return NextResponse.json({
    success: true,
    saved: {
      field,
      value
    },
    question: state.question,
    done: state.done,
    hasCvUpload,
    completedFields: state.completedFields,
    missingFields: state.missingFields,
    completion: {
      isMinimallyComplete: updatedProfile.isMinimallyComplete,
      missingCriticalFields: (updatedProfile.missingCriticalFields as string[] | undefined) ?? []
    }
  });
}