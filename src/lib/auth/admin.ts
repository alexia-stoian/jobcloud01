import { NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";

/**
 * Shared, server-only admin authorization. This is the single source of truth
 * for "is this caller an admin?" and is reused by every admin route and page.
 *
 * A caller is an admin ONLY if their persisted `User.role === "ADMIN"`. There is
 * exactly one admin account (see scripts/seed-admin.mjs); every other user is a
 * job seeker and can neither see nor access the Admin/Sourcing surfaces.
 */

/**
 * Resolve whether the given user id is an admin, strictly from the durable
 * `User.role` marker.
 */
export async function resolveIsAdmin(userId: string): Promise<boolean> {
  if (!userId) {
    return false;
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  return user?.role === "ADMIN";
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
