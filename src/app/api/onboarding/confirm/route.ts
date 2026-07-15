import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import { canConfirmOnboardingField } from "@/lib/onboarding/confirm-policy";
import { createInitialAssistantState } from "@/types/assistant-state";

type ConfirmBody = {
  field?: string;
  value?: string | null;
  questionId?: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as ConfirmBody;
  if (!body.field || !canConfirmOnboardingField(body.field) || typeof body.value !== "string" || body.value.trim().length === 0) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const onboarding = await db.onboardingSession.findUnique({ where: { userId: session.user.id } });
  if (!onboarding) {
    return NextResponse.json({ error: "onboarding_not_started" }, { status: 404 });
  }

  const profile = await db.candidateProfile.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      locale: onboarding.locale,
      assistantState: JSON.parse(JSON.stringify(createInitialAssistantState())),
      [body.field]: body.value.trim()
    },
    update: {
      [body.field]: body.value.trim()
    }
  });

  // Build the confirmed question IDs - avoid duplicates
  const existingConfirmed = Array.isArray(onboarding.confirmedQuestionIds)
    ? onboarding.confirmedQuestionIds.filter((id): id is string => typeof id === "string")
    : [];
  
  const confirmedQuestionIds = body.questionId && !existingConfirmed.includes(body.questionId)
    ? [...existingConfirmed, body.questionId]
    : existingConfirmed;

  // Filter out the confirmed question from pending questions
  const pendingQuestions = Array.isArray(onboarding.pendingQuestions)
    ? (onboarding.pendingQuestions as Array<{ id?: string }>).filter((q) => q?.id !== body.questionId)
    : [];

  await db.onboardingSession.update({
    where: { userId: session.user.id },
    data: {
      confirmedQuestionIds,
      pendingQuestions,
      currentStep: "questioning",
      lastInteractedAt: new Date()
    }
  });

  return NextResponse.json({ success: true, profile });
}
