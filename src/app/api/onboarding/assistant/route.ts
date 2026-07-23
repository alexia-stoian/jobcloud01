import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
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

/**
 * CandidateProfile string fields the agent may set directly (when it emits keys
 * that already match the schema). Keeping this an allowlist prevents the agent
 * from writing arbitrary columns.
 */
const DIRECT_PROFILE_FIELDS = new Set([
  "fullName",
  "primaryRole",
  "currentJobSituation",
  "employmentObjective",
  "preferredLocation",
  "contractPreference",
  "workRate",
  "workPermitStatus",
  "salaryExpectation",
  "targetRoles",
  "targetSeniority",
  "targetIndustries",
  "preferredWorkModel",
  "commuteRadius"
]);

/** Coerce a value to a trimmed non-empty string, or null. */
function toStr(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

/**
 * Map the agent's `profile` object onto CandidateProfile columns. The agent uses
 * its own ad-hoc keys (`target_role`, `job_sector`, ...); we translate the ones
 * we understand and pass through any key already named like a schema field.
 */
function mapAgentProfile(profile: Record<string, unknown>): Record<string, string> {
  const data: Record<string, string> = {};

  const targetRole = toStr(profile.target_role);
  if (targetRole) {
    data.primaryRole = targetRole;
    data.targetRoles = targetRole;
  }

  const sector = toStr(profile.job_sector);
  if (sector) {
    data.targetIndustries = sector;
  }

  const location = toStr(profile.preferred_location) ?? toStr(profile.location);
  if (location) {
    data.preferredLocation = location;
  }

  // Any key already named like a schema field passes straight through — so once
  // the agent emits schema-aligned keys, they persist with no further changes.
  for (const [key, value] of Object.entries(profile)) {
    if (DIRECT_PROFILE_FIELDS.has(key)) {
      const str = toStr(value);
      if (str) {
        data[key] = str;
      }
    }
  }

  return data;
}

/**
 * Persist the agent's collected profile fields to the signed-in user's
 * CandidateProfile. Best-effort: never throws into the request handler.
 */
async function persistAgentProfile(userId: string, profile: Record<string, unknown>): Promise<void> {
  const data = mapAgentProfile(profile);
  if (Object.keys(data).length === 0) {
    return;
  }
  try {
    await db.candidateProfile.updateMany({ where: { userId }, data });
  } catch (error) {
    console.error(
      "[career-guide] profile persist failed:",
      error instanceof Error ? error.message : error
    );
  }
}

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

  // Persist any profile fields the agent collected onto the user's profile so
  // answers land in the right Profile fields immediately. Best-effort.
  if (reply?.profile && Object.keys(reply.profile).length > 0) {
    await persistAgentProfile(userId, reply.profile);
  }

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
