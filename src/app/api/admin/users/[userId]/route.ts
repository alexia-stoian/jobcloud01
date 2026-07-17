import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { loadAdminUserBundle } from "@/lib/admin/user-bundle";

/**
 * Admin-only full profile + 11-signals bundle for a single user.
 *
 * Gate: `requireAdmin()` runs FIRST — before any DB read. Non-admins and
 * unauthenticated callers get a `404`. Signal data is served ONLY through this
 * admin-gated endpoint.
 *
 * Returns the complete candidate profile (fields, qualifications, history),
 * onboarding answers/CV facts, and all 11 recruiter signals. A valid userId with
 * no profile still returns `200` with `profile: null` and seeded (11) signals.
 * The bundle is assembled by the shared `loadAdminUserBundle()` — the same source
 * the Recruiter Sourcing aggregator reads from.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
): Promise<NextResponse> {
  const gate = await requireAdmin();
  if ("response" in gate) {
    return gate.response;
  }

  const { userId } = await params;

  const bundle = await loadAdminUserBundle(userId);

  if (!bundle) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(bundle);
}
