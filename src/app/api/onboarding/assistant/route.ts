import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth/config";
import { invokeCareerGuideAgent, deriveCareerGuideSessionId } from "@/lib/ai/agentcore";
import { runInferenceSafely } from "@/lib/ai/signals/hook";

/**
 * Career Guide free-form assistant chat.
 *
 * The assistant brain now lives entirely in the Amazon Bedrock AgentCore runtime
 * (see src/lib/ai/agentcore.ts) — this route simply forwards the user's message
 * to the deployed agent and returns its reply as `{ answer }`.
 *
 * Recruiter-signal inference still runs on each message (invisible; feeds
 * Admin > Profile) via `runInferenceSafely`, which never throws or leaks signal
 * vocabulary into the user-facing reply.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(20000),
  locale: z.enum(["en", "de", "fr"]).optional()
});

const FALLBACK_REPLY =
  "Sorry, I could not reach the Career Guide assistant just now. Please try again in a moment.";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const { message } = parsed.data;

  // The agent owns the conversation; one persistent session per user.
  const sessionId = deriveCareerGuideSessionId(userId);
  const reply = await invokeCareerGuideAgent({ prompt: message, sessionId });

  // Keep recruiter-signal inference live (invisible; feeds Admin > Profile).
  // Awaited so state persists, but it can never throw or block the reply.
  await runInferenceSafely({
    userId,
    newInput: message.slice(0, 6000),
    source: "message",
    sessionId: null
  });

  return NextResponse.json({
    answer: reply?.text ?? FALLBACK_REPLY,
    options: reply?.options ?? [],
    openField: reply?.openField ?? true
  });
}
