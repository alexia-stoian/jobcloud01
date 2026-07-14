import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    // 1. Auth check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch all completed interview sessions for user
    const sessions = await db.interviewSession.findMany({
      where: {
        userId: session.user.id,
        endedAt: { not: null }, // Only completed sessions
      },
      include: {
        questions: {
          select: {
            questionNum: true,
            question: true,
            userAnswer: true,
            feedback: true,
            score: true,
          },
          orderBy: { questionNum: "asc" },
        },
      },
      orderBy: { endedAt: "desc" },
    });

    // 3. Format response
    const history = sessions.map((s) => ({
      sessionId: s.id,
      interviewType: s.interviewType,
      targetRole: s.targetRole,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      overallScore: s.overallScore,
      strengths: s.strengths,
      improvements: s.improvements,
      recommendations: s.recommendations,
      userRating: s.userRating,
      questionCount: s.questions.length,
      questions: s.questions,
    }));

    return NextResponse.json({ sessions: history });
  } catch (error) {
    console.error("Error fetching interview history:", error);
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 }
    );
  }
}
