import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/admin";

/**
 * Admin-only list of every user for the admin dashboard.
 *
 * Gate: `requireAdmin()` runs FIRST — before any DB read. Non-admins and
 * unauthenticated callers get a `404` (stay hidden, never reveal the surface).
 *
 * Returns `{ users: { id, name, email, targetRole, isComplete }[] }`.
 */
export async function GET(): Promise<NextResponse> {
  const gate = await requireAdmin();
  if ("response" in gate) {
    return gate.response;
  }

  const rows = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      profile: {
        select: {
          fullName: true,
          targetRoles: true,
          primaryRole: true,
          isMinimallyComplete: true
        }
      }
    }
  });

  const users = rows.map((row) => ({
    id: row.id,
    name: row.profile?.fullName?.trim() || row.email.split("@")[0],
    email: row.email,
    targetRole: row.profile?.primaryRole ?? row.profile?.targetRoles ?? null,
    isComplete: row.profile?.isMinimallyComplete ?? false
  }));

  return NextResponse.json({ users });
}
