import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";

/**
 * Persistence for the Career Guide AGENT conversation.
 *
 * Stored separately from the legacy onboarding `conversationHistory` (which held
 * the old hand-built assistant's messages) so the agent chat is clean for every
 * user and never shows stale pre-agent history.
 */

type ChatMessage = {
  role: "assistant" | "user";
  text: string;
  options?: string[];
};

function isValidMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as ChatMessage;
  return (candidate.role === "assistant" || candidate.role === "user") && typeof candidate.text === "string";
}

/** Load the signed-in user's saved agent conversation so the chat survives refreshes. */
export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const onboarding = await db.onboardingSession.findUnique({
    where: { userId: session.user.id },
    select: { agentConversation: true }
  });

  const stored = onboarding?.agentConversation;
  const history = Array.isArray(stored) ? stored.filter(isValidMessage) : [];

  return NextResponse.json({ history });
}

/** Save the full agent conversation. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { history?: unknown };
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
      agentConversation: history
    },
    update: {
      agentConversation: history,
      lastInteractedAt: new Date()
    }
  });

  return NextResponse.json({ success: true });
}
