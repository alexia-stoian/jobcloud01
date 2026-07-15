import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { env } from "@/lib/env";
import { loadSignalStateWithMeta } from "@/lib/ai/signals/signal-dal";

/**
 * Dev/admin/recruiter-only read of the invisible recruiter-signal state.
 *
 * Gate behaviour (see Phase 7 plan Section 8a):
 *  - Feature flag OFF  -> 404 (endpoint appears non-existent to job seekers).
 *  - Flag ON, no session -> 401.
 *  - Flag ON + session (and, if an allowlist is configured, on the allowlist)
 *    -> 200 with `{ signals, inputCount, updatedAt }`.
 *
 * A `?userId=` override is honoured ONLY for allowlisted admins; every other
 * caller is scoped to their own session user id.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // When disabled, do not reveal the endpoint exists.
  if (!env.SIGNALS_ADMIN_ENABLED) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sessionUserId = session.user.id;

  const allowlist = (env.SIGNALS_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const isAllowlisted = allowlist.length > 0 && allowlist.includes(sessionUserId);

  // If an allowlist is configured, non-listed callers are treated as if the
  // endpoint does not exist (stay hidden rather than expose a 403).
  if (allowlist.length > 0 && !isAllowlisted) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const requestedUserId = request.nextUrl.searchParams.get("userId");
  const targetUserId =
    isAllowlisted && requestedUserId && requestedUserId.length > 0
      ? requestedUserId
      : sessionUserId;

  const { signals, inputCount, updatedAt } = await loadSignalStateWithMeta(targetUserId);

  return NextResponse.json({ signals, inputCount, updatedAt });
}
