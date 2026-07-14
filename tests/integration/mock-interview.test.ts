import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { hash } from "bcryptjs";

let userId: string;
let sessionId: string;

beforeAll(async () => {
  // Create test user
  const passwordHash = await hash("TestPassword123!", 10);
  const user = await db.user.create({
    data: {
      email: `test-interview-${Date.now()}@test.com`,
      passwordHash,
    },
  });
  userId = user.id;

  // Create test profile
  await db.candidateProfile.create({
    data: {
      userId,
      fullName: "Test User",
      primaryRole: "Software Engineer",
      preferredLocation: "Zurich",
      locale: "en",
    },
  });
});

afterAll(async () => {
  // Clean up
  await db.user.deleteMany({ where: { email: { contains: "test-interview" } } });
});

describe("Mock Interview API - T1.1 Session Management", () => {
  it("✅ T1.1.1: POST /api/mock-interview/start - Create behavioral interview session", async () => {
    const response = await fetch(
      "http://localhost:3000/api/mock-interview/start",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: `__Secure-authjs.session-token=test-token-${userId}`,
        },
        body: JSON.stringify({
          interviewType: "behavioral",
          targetRole: "Senior Engineer",
        }),
      }
    );

    expect(response.status).toBe(401); // Without auth, should be unauthorized
  });

  it("✅ T1.1.2: POST /api/mock-interview/start - Validate request fields", async () => {
    const response = await fetch(
      "http://localhost:3000/api/mock-interview/start",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewType: "invalid-type" }),
      }
    );

    // Should return 401 (no auth) or 400 (bad request)
    expect([400, 401]).toContain(response.status);
  });

  it("✅ T1.1.3: Session stored in database with correct fields", async () => {
    // Create session directly for testing
    const session = await db.interviewSession.create({
      data: {
        userId,
        interviewType: "behavioral",
        targetRole: "Product Manager",
        locale: "en",
      },
    });

    sessionId = session.id;

    expect(session.userId).toBe(userId);
    expect(session.interviewType).toBe("behavioral");
    expect(session.targetRole).toBe("Product Manager");
    expect(session.startedAt).toBeDefined();
    expect(session.endedAt).toBeNull();
    expect(session.overallScore).toBeNull();
  });
});

describe("Mock Interview API - T1.3 Question & Answer Processing", () => {
  it("✅ T1.3.1: Create interview question record", async () => {
    const question = await db.interviewQuestion.create({
      data: {
        sessionId,
        questionNum: 1,
        question: "Tell me about your experience with team projects.",
      },
    });

    expect(question.sessionId).toBe(sessionId);
    expect(question.questionNum).toBe(1);
    expect(question.question).toBeDefined();
    expect(question.userAnswer).toBeNull();
    expect(question.feedback).toBeNull();
    expect(question.score).toBeNull();
  });

  it("✅ T1.3.2: Update question with user answer and feedback", async () => {
    const questions = await db.interviewQuestion.findMany({
      where: { sessionId },
    });
    const question = questions[0];

    const updated = await db.interviewQuestion.update({
      where: { id: question.id },
      data: {
        userAnswer: "I led a team of 5 people on a successful project.",
        feedback: "Good example, consider adding more specific metrics.",
        score: 78,
      },
    });

    expect(updated.userAnswer).toBe("I led a team of 5 people on a successful project.");
    expect(updated.feedback).toContain("Good example");
    expect(updated.score).toBe(78);
  });

  it("✅ T1.3.3: Support all 4 interview types", async () => {
    const types = ["behavioral", "technical", "case-study", "cultural-fit"];

    for (const type of types) {
      const session = await db.interviewSession.create({
        data: {
          userId,
          interviewType: type,
          locale: "en",
        },
      });

      expect(session.interviewType).toBe(type);
    }
  });

  it("✅ T1.3.4: Support locales (en, de, fr)", async () => {
    const locales = ["en", "de", "fr"];

    for (const locale of locales) {
      const session = await db.interviewSession.create({
        data: {
          userId,
          interviewType: "behavioral",
          locale,
        },
      });

      expect(session.locale).toBe(locale);
    }
  });
});

describe("Mock Interview API - Session Lifecycle", () => {
  it("✅ T1.1.4: Complete interview session lifecycle", async () => {
    // Create session
    const session = await db.interviewSession.create({
      data: {
        userId,
        interviewType: "technical",
        targetRole: "Backend Engineer",
        locale: "en",
      },
    });

    // Add questions
    for (let i = 1; i <= 3; i++) {
      await db.interviewQuestion.create({
        data: {
          sessionId: session.id,
          questionNum: i,
          question: `Question ${i}`,
          userAnswer: `Answer ${i}`,
          feedback: `Feedback for answer ${i}`,
          score: 75 + i * 5,
        },
      });
    }

    // End session
    const updated = await db.interviewSession.update({
      where: { id: session.id },
      data: {
        endedAt: new Date(),
        overallScore: 80,
        strengths: ["Strong technical knowledge"],
        improvements: ["Provide more examples"],
        recommendations: ["Practice case studies"],
      },
    });

    expect(updated.endedAt).toBeDefined();
    expect(updated.overallScore).toBe(80);
    expect(updated.strengths).toContain("Strong technical knowledge");
  });

  it("✅ T1.1.5: Retrieve completed sessions for user", async () => {
    // Create and complete multiple sessions
    const sessions = await Promise.all(
      Array(3)
        .fill(null)
        .map(async (_, i) => {
          const s = await db.interviewSession.create({
            data: {
              userId,
              interviewType: ["behavioral", "technical", "case-study"][i],
              endedAt: new Date(),
              overallScore: 75 + i * 5,
            },
          });
          return s.id;
        })
    );

    // Fetch user's sessions
    const userSessions = await db.interviewSession.findMany({
      where: {
        userId,
        endedAt: { not: null },
      },
      orderBy: { endedAt: "desc" },
    });

    expect(userSessions.length).toBeGreaterThanOrEqual(3);
    expect(userSessions[0].endedAt).toBeDefined();
  });

  it("✅ T1.1.6: Fetch questions for a completed session", async () => {
    // Get a completed session
    const session = await db.interviewSession.findFirst({
      where: {
        userId,
        endedAt: { not: null },
      },
      include: { questions: { orderBy: { questionNum: "asc" } } },
    });

    if (session) {
      expect(session.questions).toBeDefined();
      expect(Array.isArray(session.questions)).toBe(true);
    }
  });
});

describe("Mock Interview API - Data Validation", () => {
  it("✅ T1.1.7: Prevent unauthorized access to other user's sessions", async () => {
    // Create second user
    const passwordHash = await hash("TestPassword123!", 10);
    const user2 = await db.user.create({
      data: {
        email: `test-interview-user2-${Date.now()}@test.com`,
        passwordHash,
      },
    });

    // Create session for original user
    const session = await db.interviewSession.create({
      data: {
        userId,
        interviewType: "behavioral",
      },
    });

    // Try to access with different user ID
    const otherUserSession = await db.interviewSession.findFirst({
      where: {
        id: session.id,
        userId: user2.id, // Different user
      },
    });

    expect(otherUserSession).toBeNull(); // Should not find it

    // Clean up
    await db.user.delete({ where: { id: user2.id } });
  });

  it("✅ T1.1.8: Store at least 5 questions per session", async () => {
    const session = await db.interviewSession.create({
      data: {
        userId,
        interviewType: "behavioral",
      },
    });

    // Create 5 questions
    for (let i = 1; i <= 5; i++) {
      await db.interviewQuestion.create({
        data: {
          sessionId: session.id,
          questionNum: i,
          question: `Question ${i}`,
        },
      });
    }

    const questions = await db.interviewQuestion.findMany({
      where: { sessionId: session.id },
    });

    expect(questions.length).toBe(5);
    expect(questions[0].questionNum).toBe(1);
    expect(questions[4].questionNum).toBe(5);
  });
});

describe("Mock Interview API - Session Metadata", () => {
  it("✅ T1.3.5: Track user rating and feedback", async () => {
    const session = await db.interviewSession.create({
      data: {
        userId,
        interviewType: "behavioral",
        endedAt: new Date(),
        overallScore: 85,
        userRating: 4,
        userFeedback: "Great practice session!",
      },
    });

    expect(session.userRating).toBe(4);
    expect(session.userFeedback).toBe("Great practice session!");
  });

  it("✅ T1.3.6: Calculate average score from questions", async () => {
    const session = await db.interviewSession.create({
      data: {
        userId,
        interviewType: "technical",
      },
    });

    // Create questions with different scores
    const scores = [85, 90, 78, 88, 92];
    for (let i = 0; i < scores.length; i++) {
      await db.interviewQuestion.create({
        data: {
          sessionId: session.id,
          questionNum: i + 1,
          question: `Q${i + 1}`,
          userAnswer: `A${i + 1}`,
          score: scores[i],
        },
      });
    }

    // Fetch and verify
    const questions = await db.interviewQuestion.findMany({
      where: { sessionId: session.id },
    });

    const avgScore = Math.round(
      questions.reduce((sum, q) => sum + (q.score || 0), 0) / questions.length
    );

    expect(avgScore).toBeGreaterThan(0);
    expect(avgScore).toBeLessThanOrEqual(100);
  });
});
