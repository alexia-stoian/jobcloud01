import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import { planNextOnboardingStep } from "@/ai/onboarding/graph";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { userMessage?: string };
  const onboarding = await db.onboardingSession.findUnique({ where: { userId: session.user.id } });
  if (!onboarding) {
    return NextResponse.json({ error: "onboarding_not_started" }, { status: 404 });
  }

  const result = planNextOnboardingStep({
    userMessage: body.userMessage ?? "",
    locale: onboarding.locale as "en" | "de" | "fr",
    targetRole: onboarding.targetRole,
    extractedFacts: onboarding.cvExtractedFacts as Record<string, unknown>,
    uncertainFacts: onboarding.cvUncertainFacts as Record<string, unknown>,
    pendingQuestions: onboarding.pendingQuestions as Array<{ id: string; field?: string; text: string; required: boolean; reason?: string }>,
    skippedQuestionIds: onboarding.skippedQuestionIds as string[],
    confirmedQuestionIds: onboarding.confirmedQuestionIds as string[]
  });

  return NextResponse.json(result);
}
