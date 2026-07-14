import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import { scoreAnswerAndGenerateFeedback } from "@/lib/interview/engine";
import { InterviewType } from "@/lib/interview/prompts";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse request body
    const { sessionId, userAnswer } = await request.json();

    if (!sessionId || !userAnswer) {
      return NextResponse.json(
        { error: "Missing sessionId or userAnswer" },
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

    // 5. Get latest question
    const lastQuestion = interviewSession.questions[interviewSession.questions.length - 1];
    if (!lastQuestion) {
      return NextResponse.json(
        { error: "No question found" },
        { status: 400 }
      );
    }

    // 6. Score answer and get feedback
    const feedback = await scoreAnswerAndGenerateFeedback(
      lastQuestion.question,
      userAnswer,
      interviewSession.interviewType as InterviewType,
      interviewSession.questions.length,
      interviewSession.locale
    );

    // 7. Update last question with answer and feedback
    await db.interviewQuestion.update({
      where: { id: lastQuestion.id },
      data: {
        userAnswer,
        feedback: feedback.content,
        score: feedback.score ?? undefined,
      },
    });

    // 8. If interview is done, finalize session
    if (feedback.isDone) {
      const summaryData = {
        endedAt: new Date(),
        overallScore: Math.round(
          interviewSession.questions.reduce(
            (sum, q) => sum + (q.score || 0),
            feedback.score || 0
          ) / (interviewSession.questions.length + 1)
        ),
        strengths: feedback.nextQuestion ? [] : ["Completed interview"],
        improvements: [],
        recommendations: [],
      };

      await db.interviewSession.update({
        where: { id: sessionId },
        data: summaryData,
      });

      return NextResponse.json({
        sessionId,
        isDone: true,
        feedback: feedback.content,
        score: feedback.score,
        summary: feedback.content,
        overallScore: summaryData.overallScore,
      });
    }

    // 9. Create next question if not done
    if (feedback.nextQuestion && !feedback.isDone) {
      const nextQuestionNum = interviewSession.questions.length + 1;
      await db.interviewQuestion.create({
        data: {
          sessionId,
          questionNum: nextQuestionNum,
          question: feedback.nextQuestion,
        },
      });

      return NextResponse.json({
        sessionId,
        isDone: false,
        feedback: feedback.content,
        score: feedback.score,
        nextQuestion: feedback.nextQuestion,
        questionNumber: nextQuestionNum,
      });
    }

    // 10. If somehow we get here, end the session
    await db.interviewSession.update({
      where: { id: sessionId },
      data: { endedAt: new Date() },
    });

    return NextResponse.json({
      sessionId,
      isDone: true,
      feedback: feedback.content,
      score: feedback.score,
    });
  } catch (error) {
    console.error("Error processing interview question:", error);
    return NextResponse.json(
      { error: "Failed to process answer" },
      { status: 500 }
    );
  }
}
