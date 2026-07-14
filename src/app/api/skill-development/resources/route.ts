import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { getResourcesForSkill, getAllSkillTags } from "@/lib/interview/resources";
import { extractSkillGapsFromLatestGuidance } from "@/lib/interview/parse-gaps";

export const runtime = "nodejs";

/**
 * GET /api/skill-development/resources
 * Query params:
 * - skillGap: string (skill tag to get resources for)
 * - numberOfResources: number (default 5, max 10)
 * - difficulty: "beginner" | "intermediate" | "advanced" (optional)
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Auth check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const skillGap = searchParams.get("skillGap");
    const numberOfResourcesStr = searchParams.get("numberOfResources") || "5";
    const difficulty = searchParams.get("difficulty") as
      | "beginner"
      | "intermediate"
      | "advanced"
      | null;

    const numberOfResources = Math.min(
      Math.max(parseInt(numberOfResourcesStr, 10), 1),
      10
    );

    // 3. If no skill specified, return skill gap detection prompt
    if (!skillGap) {
      try {
        const gaps = await extractSkillGapsFromLatestGuidance(session.user.id);
        const skillTags = getAllSkillTags();

        return NextResponse.json({
          availableSkills: skillTags,
          identifiedGaps: gaps,
          message:
            "Specify a skillGap parameter to get resources for that skill",
        });
      } catch (e) {
        return NextResponse.json({
          availableSkills: getAllSkillTags(),
          message: "Specify a skillGap parameter to get resources for that skill",
        });
      }
    }

    // 4. Get resources for the specified skill
    const resources = getResourcesForSkill(skillGap, numberOfResources, difficulty ?? undefined);

    if (resources.length === 0) {
      return NextResponse.json({
        skill: skillGap,
        resources: [],
        message: `No resources found for skill: ${skillGap}`,
        availableSkills: getAllSkillTags(),
      });
    }

    // 5. Return formatted response
    return NextResponse.json({
      skill: skillGap,
      numberOfResources: resources.length,
      resources: resources.map((r) => ({
        id: r.id,
        title: r.title,
        type: r.type,
        source: r.source,
        duration: r.duration,
        cost: r.cost,
        difficulty: r.difficulty,
        link: r.link,
        description: r.description,
      })),
    });
  } catch (error) {
    console.error("Error fetching skill resources:", error);
    return NextResponse.json(
      { error: "Failed to fetch resources" },
      { status: 500 }
    );
  }
}
