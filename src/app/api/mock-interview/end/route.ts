import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import { generateSessionSummary } from "@/lib/interview/engine";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse request body
    const { sessionId, userRating, userFeedback } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing sessionId" },
        { status: 400 }
      );
    }

    // 3. Fetch interview session
    const interviewSession = await db.interviewSession.findUnique({
      where: { id: sessionId },
      include: { questions: { orderBy: { questionNum: "asc" } } },
    });

    if (!interviewSession) {
      return NextResponse.json(
        { error: "Interview session not found" },
        { status: 404 }
      );
    }

    // 4. Verify ownership
    if (interviewSession.userId !== session.user.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    // 5. If session already ended, return existing summary
    if (interviewSession.endedAt) {
      return NextResponse.json({
        sessionId,
        overallScore: interviewSession.overallScore,
        strengths: interviewSession.strengths,
        improvements: interviewSession.improvements,
        recommendations: interviewSession.recommendations,
      });
    }

    // 6. Generate summary from questions answered
    const questionsWithAnswers = interviewSession.questions
      .filter((q) => q.userAnswer && q.feedback)
      .map((q) => ({
        question: q.question,
        answer: q.userAnswer || "",
        feedback: q.feedback || "",
        score: q.score || 0,
      }));

    let summaryData = {
      summary: "Interview ended.",
      overallScore: 0,
      strengths: [] as string[],
      improvements: [] as string[],
      recommendations: [] as string[],
    };

    if (questionsWithAnswers.length > 0) {
      summaryData = await generateSessionSummary(
        questionsWithAnswers,
        interviewSession.interviewType as "behavioral" | "technical" | "case-study" | "cultural-fit",
        interviewSession.locale
      );
    } else {
      summaryData.overallScore = Math.round(
        interviewSession.questions.reduce((sum, q) => sum + (q.score || 0), 0) /
          Math.max(interviewSession.questions.length, 1)
      );
    }

    // 7. Update session with final data
    const updated = await db.interviewSession.update({
      where: { id: sessionId },
      data: {
        endedAt: new Date(),
        overallScore: summaryData.overallScore,
        strengths: summaryData.strengths,
        improvements: summaryData.improvements,
        recommendations: summaryData.recommendations,
        userRating: userRating || undefined,
        userFeedback: userFeedback || undefined,
      },
    });

    // 8. Return session summary
    return NextResponse.json({
      sessionId,
      overallScore: updated.overallScore,
      strengths: updated.strengths,
      improvements: updated.improvements,
      recommendations: updated.recommendations,
    });
  } catch (error) {
    console.error("Error ending interview:", error);
    return NextResponse.json(
      { error: "Failed to end interview" },
      { status: 500 }
    );
  }
}
