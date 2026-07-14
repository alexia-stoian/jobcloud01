import { auth } from "@/auth/config";
import { NextResponse } from "next/server";
import { compareReadiness } from "@/lib/interview/readiness-score";
import { getAllRoles } from "@/lib/interview/roles";

/**
 * POST /api/readiness/compare
 * Compare user readiness across multiple roles
 * Body: { roleIds?: string[] } - if empty, uses top 5 roles
 * Response: Array of ReadinessScore objects sorted by overall readiness
 */
export async function POST(request: Request) {
  try {
    // 1. Auth check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // 2. Parse request body
    const body = (await request.json()) as {
      roleIds?: string[];
    };

    // 3. Determine roles to compare
    let roleIds = body.roleIds || [];

    if (!roleIds || roleIds.length === 0) {
      // Default to top in-demand roles
      const allRoles = getAllRoles();
      roleIds = allRoles
        .filter((r) => r.marketDemand === "high")
        .slice(0, 5)
        .map((r) => r.id);
    }

    // 4. Calculate readiness scores
    const scores = await compareReadiness(userId, roleIds);

    // 5. Return results
    return NextResponse.json({
      userId,
      compareCount: scores.length,
      scores,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Error in readiness comparison:", e);
    return NextResponse.json(
      { error: "Failed to compare readiness" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/readiness/compare
 * Get available roles for comparison
 * Query params: search (optional), limit (optional, default 10)
 * Response: Array of role profiles
 */
export async function GET(request: Request) {
  try {
    // 1. Auth check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse query params
    const url = new URL(request.url);
    const search = url.searchParams.get("search") || "";
    const limit = Math.min(20, parseInt(url.searchParams.get("limit") || "10"));

    // 3. Get roles
    let roles = getAllRoles();

    if (search) {
      roles = roles.filter(
        (r) =>
          r.title.toLowerCase().includes(search.toLowerCase()) ||
          r.requiredSkills.some((s) =>
            s.toLowerCase().includes(search.toLowerCase())
          )
      );
    }

    // 4. Sort by market demand and limit
    roles = roles.sort((a, b) => {
      const demandScore = { high: 3, medium: 2, low: 1 };
      return demandScore[b.marketDemand] - demandScore[a.marketDemand];
    });

    return NextResponse.json({
      totalRoles: getAllRoles().length,
      resultCount: Math.min(limit, roles.length),
      roles: roles.slice(0, limit),
    });
  } catch (e) {
    console.error("Error fetching roles:", e);
    return NextResponse.json(
      { error: "Failed to fetch roles" },
      { status: 500 }
    );
  }
}
