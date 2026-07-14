import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/skill-development/mark-complete
 * Mark a learning resource as complete
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse request body
    const { resourceId, skill, resourceTitle, rating, feedback, timeSpent } =
      await request.json();

    if (!resourceId || !skill) {
      return NextResponse.json(
        { error: "Missing resourceId or skill" },
        { status: 400 }
      );
    }

    // 3. Create or update completed resource record
    const completed = await db.completedResource.upsert({
      where: {
        userId_resourceId: {
          userId: session.user.id,
          resourceId,
        },
      },
      update: {
        completedAt: new Date(),
        rating: rating || undefined,
        feedback: feedback || undefined,
        timeSpent: timeSpent || undefined,
      },
      create: {
        userId: session.user.id,
        resourceId,
        skill,
        resourceTitle: resourceTitle || "Resource",
        rating: rating || undefined,
        feedback: feedback || undefined,
        timeSpent: timeSpent || undefined,
      },
    });

    return NextResponse.json({
      resourceId,
      completedAt: completed.completedAt,
      pointsEarned: Math.min(10 + (rating || 0) * 2, 20), // Gamification
    });
  } catch (error) {
    console.error("Error marking resource complete:", error);
    return NextResponse.json(
      { error: "Failed to mark resource complete" },
      { status: 500 }
    );
  }
}
