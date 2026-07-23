import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";

type ConversationMessage = {
  role: "assistant" | "user";
  text: string;
  options?: Array<{ value: string; label: string; description?: string }>;
  field?: string;
};

type HistoryBody = {
  history?: ConversationMessage[];
};

function isValidMessage(value: unknown): value is ConversationMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as ConversationMessage;
  return (
    (candidate.role === "assistant" || candidate.role === "user") &&
    typeof candidate.text === "string"
  );
}

/** Load the signed-in user's saved conversation so the chat survives refreshes. */
export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const onboarding = await db.onboardingSession.findUnique({
    where: { userId: session.user.id },
    select: { conversationHistory: true }
  });

  const stored = onboarding?.conversationHistory;
  const history = Array.isArray(stored) ? stored.filter(isValidMessage) : [];

  return NextResponse.json({ history });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as HistoryBody;
  const history = Array.isArray(body.history) ? body.history.filter(isValidMessage) : null;

  if (!history) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  await db.onboardingSession.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      locale: "en",
      currentStep: "questioning",
      conversationHistory: history,
      pendingQuestions: [],
      skippedQuestionIds: [],
      confirmedQuestionIds: [],
      cvExtractedFacts: {},
      cvUncertainFacts: {}
    },
    update: {
      conversationHistory: history,
      lastInteractedAt: new Date()
    }
  });

  return NextResponse.json({ success: true });
}