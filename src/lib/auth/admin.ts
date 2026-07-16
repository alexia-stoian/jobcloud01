import { NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Shared, server-only admin authorization. This is the single source of truth
 * for "is this caller an admin?" and is reused by every admin route and page.
 *
 * A caller is an admin if their persisted `User.role === "ADMIN"`, OR — for
 * legacy Phase 7 compatibility — the `SIGNALS_ADMIN_ENABLED` gate is on and the
 * caller's id is present in the `SIGNALS_ADMIN_USER_IDS` allowlist.
 */

function parseAllowlist(): string[] {
  return (env.SIGNALS_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Resolve whether the given user id is an admin. Combines the durable `role`
 * marker with the legacy signals gate so the whole admin area shares one rule.
 */
export async function resolveIsAdmin(userId: string): Promise<boolean> {
  if (!userId) {
    return false;
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  if (user?.role === "ADMIN") {
    return true;
  }

  // Legacy reconciliation: preserve the Phase 7 dev gate so nothing regresses.
  // When SIGNALS_ADMIN_ENABLED is on, the original behavior granted access to any
  // authenticated user (there was no allowlist requirement). Keep that: allow when
  // the allowlist is empty (dev mode) OR the caller is explicitly allowlisted.
  if (env.SIGNALS_ADMIN_ENABLED) {
    const allowlist = parseAllowlist();
    if (allowlist.length === 0 || allowlist.includes(userId)) {
      return true;
    }
  }

  return false;
}

/**
 * Guard for admin API routes. Returns the admin `userId` on success, or a 404
 * `NextResponse` (stay hidden — never reveal the surface) otherwise. Consumers
 * narrow on `"response" in result`.
 */
export async function requireAdmin(): Promise<{ userId: string } | { response: NextResponse }> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return { response: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  }

  const isAdmin = await resolveIsAdmin(userId);
  if (!isAdmin) {
    return { response: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  }

  return { userId };
}

/**
 * Server-component helper for pages: returns the session user id when the caller
 * is an admin, else `null`. Pages call `notFound()` when this returns `null`.
 */
export async function getAdminUserIdOrNull(): Promise<string | null> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return null;
  }

  return (await resolveIsAdmin(userId)) ? userId : null;
}
