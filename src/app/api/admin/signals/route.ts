import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { env } from "@/lib/env";
import { resolveIsAdmin } from "@/lib/auth/admin";
import { loadSignalStateWithMeta } from "@/lib/ai/signals/signal-dal";

/**
 * Dev/admin/recruiter-only read of the invisible recruiter-signal state.
 *
 * Gate behaviour (see Phase 7 plan Section 8a, reconciled in Phase 8 Plan 1):
 *  - Feature flag OFF  -> 404 (endpoint appears non-existent to job seekers).
 *  - Flag ON, no session -> 401.
 *  - Flag ON + session + admin (`resolveIsAdmin`) -> 200 with
 *    `{ signals, inputCount, updatedAt }`.
 *
 * Admin-ness is decided by the shared `resolveIsAdmin` helper (durable
 * `User.role === "ADMIN"` OR the legacy `SIGNALS_ADMIN_USER_IDS` allowlist),
 * so the whole admin area shares one server-enforced rule.
 *
 * A `?userId=` override is honoured ONLY for admins; every other caller is
 * scoped to their own session user id.
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

  const isAdmin = await resolveIsAdmin(sessionUserId);

  // Non-admin callers are treated as if the endpoint does not exist (stay
  // hidden rather than expose a 403).
  if (!isAdmin) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const requestedUserId = request.nextUrl.searchParams.get("userId");
  const targetUserId =
    requestedUserId && requestedUserId.length > 0 ? requestedUserId : sessionUserId;

  const { signals, inputCount, updatedAt } = await loadSignalStateWithMeta(targetUserId);

  return NextResponse.json({ signals, inputCount, updatedAt });
}
