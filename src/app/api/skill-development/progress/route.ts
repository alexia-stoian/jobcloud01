import { NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import { extractSkillGapsFromLatestGuidance } from "@/lib/interview/parse-gaps";

export const runtime = "nodejs";

/**
 * GET /api/skill-development/progress
 * Get user's learning progress across all skills
 */
export async function GET() {
  try {
    // 1. Auth check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Get all completed resources for user
    const completedResources = await db.completedResource.findMany({
      where: { userId: session.user.id },
      orderBy: { completedAt: "desc" },
    });

    // 3. Get skill gaps to calculate total
    const skillGaps = await extractSkillGapsFromLatestGuidance(session.user.id);
    const totalSkillGaps = skillGaps.length || 5; // Default to 5 if no gaps detected

    // 4. Calculate progress metrics
    const skillProgress: Record<
      string,
      { completed: number; inProgress: number; total: number }
    > = {};

    for (const gap of skillGaps) {
      const completed = completedResources.filter(
        (r) => r.skill.toLowerCase() === gap.skill.toLowerCase()
      ).length;

      skillProgress[gap.skill] = {
        completed,
        inProgress: completed > 0 ? 1 : 0,
        total: 5, // Average target is 5 resources per skill
      };
    }

    // 5. Calculate overall progress
    const totalCompleted = completedResources.length;
    const totalInProgress = skillGaps.length - totalCompleted; // Rough estimate
    const totalResources = totalSkillGaps * 3; // Average 3 resources per skill
    const progressPercent = Math.round(
      (totalCompleted / Math.max(totalResources, 1)) * 100
    );

    // 6. Get rating/feedback summary
    const completedWithRating = completedResources.filter((r) => r.rating);
    const averageRating =
      completedWithRating.length > 0
        ? Math.round(
            (completedWithRating.reduce((sum, r) => sum + (r.rating || 0), 0) /
              completedWithRating.length) *
              10
          ) / 10
        : 0;

    return NextResponse.json({
      totalSkillGaps,
      completedResources: totalCompleted,
      inProgressResources: Math.max(0, totalInProgress),
      totalResourcesTarget: totalResources,
      progressPercent: Math.min(progressPercent, 100),
      bySkill: skillProgress,
      averageResourceRating: averageRating,
      completedResourcesList: completedResources.map((r) => ({
        resourceId: r.resourceId,
        resourceTitle: r.resourceTitle,
        skill: r.skill,
        completedAt: r.completedAt,
        rating: r.rating,
        feedback: r.feedback,
        timeSpent: r.timeSpent,
      })),
    });
  } catch (error) {
    console.error("Error fetching skill progress:", error);
    return NextResponse.json(
      { error: "Failed to fetch progress" },
      { status: 500 }
    );
  }
}
