import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";

type SkipBody = {
  questionId?: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as SkipBody;
  if (!body.questionId) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const onboarding = await db.onboardingSession.findUnique({ where: { userId: session.user.id } });
  if (!onboarding) {
    return NextResponse.json({ error: "onboarding_not_started" }, { status: 404 });
  }

  const skippedQuestionIds = Array.from(new Set([...(onboarding.skippedQuestionIds as string[]), body.questionId]));
  await db.onboardingSession.update({
    where: { userId: session.user.id },
    data: {
      skippedQuestionIds,
      currentStep: "questioning",
      lastInteractedAt: new Date()
    }
  });

  return NextResponse.json({ success: true, skippedQuestionIds });
}
