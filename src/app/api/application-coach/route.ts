import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth/config";
import { invokeApplicationCoachAgent, deriveApplicationCoachSessionId } from "@/lib/ai/agentcore";
import { runInferenceSafely } from "@/lib/ai/signals/hook";
import {
  isObject,
  persistCoverLetter,
  persistInterview
} from "@/lib/ai/application-coach-persistence";

/**
 * Application Coach assistant chat — cover letters + interview practice.
 *
 * Powered by a dedicated Amazon Bedrock AgentCore runtime (separate from the
 * Career Guide agent). This route forwards the user's message to the agent and
 * persists any `cover_letter` / `interview` data it emits. Recruiter-signal
 * inference still runs on each message (invisible; feeds Admin > Profile).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(20000),
  locale: z.enum(["en", "de", "fr"]).optional()
});

const FALLBACK_REPLY =
  "Sorry, I could not reach the Application Coach just now. Please try again in a moment.";

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

  // One persistent Application Coach session per user (distinct from Career Guide).
  const sessionId = deriveApplicationCoachSessionId(userId);
  const reply = await invokeApplicationCoachAgent({ prompt: message, sessionId });

  // Persist any cover letter / interview data the agent produced. Best-effort.
  if (reply?.data && Object.keys(reply.data).length > 0) {
    if (isObject(reply.data.cover_letter)) {
      await persistCoverLetter(userId, reply.data.cover_letter);
    }
    if (isObject(reply.data.interview)) {
      await persistInterview(userId, reply.data.interview);
    }
  }

  // Keep recruiter-signal inference live (invisible; feeds Admin > Profile).
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
