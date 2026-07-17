import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import { buildDurableProfileMemory } from "@/lib/profile/memory";
import { generateFirstQuestion } from "@/lib/interview/engine";
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
    const { interviewType, targetRole } = await request.json();

    if (!interviewType || !["behavioral", "technical", "case-study", "cultural-fit"].includes(interviewType)) {
      return NextResponse.json(
        { error: "Invalid interview type" },
        { status: 400 }
      );
    }

    // 3. Fetch user's profile for context
    const profile = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      include: { qualifications: true },
    });

    if (!profile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    // 4. Build profile context
    const profileContext = buildDurableProfileMemory({
      profile,
      qualifications: profile.qualifications,
      onboardingSession: null,
    });

    // 5. Generate first question
    const firstQuestion = await generateFirstQuestion(
      interviewType as InterviewType,
      targetRole || profile.targetRoles || profile.primaryRole || null,
      profileContext,
      profile.locale
    );

    // 6. Create interview session in database
    const session_created = await db.interviewSession.create({
      data: {
        userId: session.user.id,
        interviewType,
        targetRole: targetRole || profile.primaryRole,
        locale: profile.locale,
      },
    });

    // 7. Create first question record
    if (firstQuestion.type === "question") {
      await db.interviewQuestion.create({
        data: {
          sessionId: session_created.id,
          questionNum: 1,
          question: firstQuestion.content,
        },
      });
    }

    // 8. Return response
    return NextResponse.json({
      sessionId: session_created.id,
      startedAt: session_created.startedAt,
      interviewType,
      targetRole: session_created.targetRole,
      question: firstQuestion.content,
      questionNumber: 1,
    });
  } catch (error) {
    console.error("Error starting interview:", error);
    return NextResponse.json(
      { error: "Failed to start interview" },
      { status: 500 }
    );
  }
}
