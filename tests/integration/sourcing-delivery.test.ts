// Import the env shim FIRST (before any module that validates env at import
// time) — the env-import gotcha the plan calls out.
import "./_setup-env";

import { beforeEach, describe, expect, test, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const authMock = vi.hoisted(() => vi.fn());

const dbMock = vi.hoisted(() => ({
  sourcingCandidate: {
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn()
  },
  sourcingAnswer: {
    upsert: vi.fn()
  }
}));

// Phase 10 handlers that sourcing delivery MUST NOT touch (Pitfall 3).
const targetRoleQuestionMock = vi.hoisted(() => vi.fn());
const targetRoleAckMock = vi.hoisted(() => vi.fn());
const assistantPostMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth/config", () => ({
  auth: authMock
}));

vi.mock("@/lib/db", () => ({
  db: dbMock
}));

vi.mock("@/lib/env", () => ({
  env: {
    ANTHROPIC_API_KEY: "test-key",
    ANTHROPIC_MODEL: "claude-test"
  }
}));

vi.mock("@/lib/onboarding/detect-target-role", () => ({
  getTargetRoleQuestion: targetRoleQuestionMock,
  getTargetRoleAck: targetRoleAckMock
}));

vi.mock("@/app/api/onboarding/assistant/route", () => ({
  POST: assistantPostMock
}));

// Import the route AFTER the mocks so it binds to them.
import { GET, POST } from "@/app/api/onboarding/sourcing-questions/route";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const CANDIDATE_USER = "user-1";
const FIT_BEFORE = 60;

type StoredOption = { value: string; label: string; isCorrect: boolean; isOpen: boolean };
type StoredAnswer = { chosenValue: string | null; freeText: string | null; satisfiedNeed: boolean } | null;
type StoredQuestion = {
  id: string;
  orderIndex: number;
  gapLabel: string;
  prompt: string;
  options: StoredOption[];
  allowCustom: boolean;
  answer: StoredAnswer;
};
type StoredCandidate = {
  id: string;
  candidateUserId: string;
  status: string;
  fitBefore: number;
  fitAfter: number | null;
  questions: StoredQuestion[];
};

function makeQuestion(i: number): StoredQuestion {
  return {
    id: `q${i}`,
    orderIndex: i,
    gapLabel: `gap ${i}`,
    prompt: `Question ${i}?`,
    // 1 correct + 3 distractors (the shape the generator produces). The open
    // "write your own answer" path is the free-text input (allowCustom), not a choice.
    options: [
      { value: "o0", label: "the recruiter-satisfying answer", isCorrect: true, isOpen: false },
      { value: "o1", label: "distractor 1", isCorrect: false, isOpen: false },
      { value: "o2", label: "distractor 2", isCorrect: false, isOpen: false },
      { value: "o3", label: "distractor 3", isCorrect: false, isOpen: false }
    ],
    allowCustom: true,
    answer: null
  };
}

let candidate: StoredCandidate;

function resetCandidate(): void {
  candidate = {
    id: "cand-1",
    candidateUserId: CANDIDATE_USER,
    status: "pending",
    fitBefore: FIT_BEFORE,
    fitAfter: null,
    questions: [0, 1, 2, 3, 4].map(makeQuestion)
  };
}

function getReq(locale = "en"): NextRequest {
  return new NextRequest(`http://localhost/api/onboarding/sourcing-questions?locale=${locale}`);
}

function postReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/onboarding/sourcing-questions", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

/** Anthropic-shaped success body. */
function anthropicResponse(text: string): Promise<Response> {
  return Promise.resolve({
    ok: true,
    json: async () => ({ content: [{ type: "text", text }] })
  } as Response);
}

const SERVER_ONLY_KEYS = /isCorrect|isOpen|satisfiedNeed|gapLabel|needsSnapshot|fitBefore|fitAfter/;

const fetchMock = vi.fn();
// Re-scored fit returned BELOW the visible-increase floor so the clamp is what
// guarantees the increase (proves rescoreFromAnswers, not the LLM).
let rescoreFitAfter = 62;

describe("sourcing delivery endpoint (Phase 11 candidate side)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCandidate();
    rescoreFitAfter = 62;

    authMock.mockResolvedValue({ user: { id: CANDIDATE_USER } });

    // getPendingCandidate: newest non-completed set scoped to candidateUserId.
    dbMock.sourcingCandidate.findFirst.mockImplementation(async ({ where }: { where: { candidateUserId: string } }) => {
      if (where.candidateUserId !== candidate.candidateUserId) {
        return null;
      }
      if (candidate.status === "completed") {
        return null;
      }
      return candidate;
    });

    dbMock.sourcingCandidate.updateMany.mockImplementation(async ({ where, data }: { where: { id: string; candidateUserId: string }; data: { status: string } }) => {
      if (where.id === candidate.id && where.candidateUserId === candidate.candidateUserId) {
        candidate.status = data.status;
        return { count: 1 };
      }
      return { count: 0 };
    });

    dbMock.sourcingCandidate.update.mockImplementation(async ({ data }: { data: { status: string; fitAfter: number } }) => {
      candidate.status = data.status;
      candidate.fitAfter = data.fitAfter;
      return candidate;
    });

    dbMock.sourcingAnswer.upsert.mockImplementation(async ({ where, update }: { where: { questionId: string }; update: { chosenValue: string | null; freeText: string | null; satisfiedNeed: boolean } }) => {
      const q = candidate.questions.find((question) => question.id === where.questionId);
      if (q) {
        q.answer = { chosenValue: update.chosenValue, freeText: update.freeText, satisfiedNeed: update.satisfiedNeed };
      }
      return q?.answer;
    });

    fetchMock.mockImplementation(async (_url: string, opts: { body: string }) => {
      const prompt = JSON.parse(opts.body).messages[0].content as string;
      if (prompt.includes("fitAfter")) {
        return anthropicResponse(`{"fitAfter": ${rescoreFitAfter}}`);
      }
      if (prompt.includes("satisfied")) {
        return anthropicResponse('{"satisfied": true}');
      }
      return anthropicResponse("{}");
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  // (a) >=60 candidate: GET returns ONE 5-option MCQ + notice, no correctness.
  test("GET serves the first question as a 5-option MCQ with the recruiter notice and no correctness", async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.done).toBe(false);
    expect(body.question.id).toBe("q0");
    expect(body.question.options).toHaveLength(4);
    expect(body.question.allowCustom).toBe(true);
    expect(String(body.notice).toLowerCase()).toContain("recruiter");
    // Correctness/server-only fields never leave the server.
    expect(JSON.stringify(body)).not.toMatch(SERVER_ONLY_KEYS);
    expect(body.question.options.every((o: Record<string, unknown>) => !("isCorrect" in o) && !("isOpen" in o))).toBe(true);
  });

  // (b) one at a time; done:false with no correctness until the last; (e) <=5 cap.
  test("answers advance one at a time, never reveal correctness, and cap at 5", async () => {
    for (let i = 0; i < 4; i++) {
      const res = await POST(postReq({ questionId: `q${i}`, chosenValue: "o1" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.done).toBe(false);
      expect(JSON.stringify(body)).not.toMatch(SERVER_ONLY_KEYS);
      expect("chosenValueCorrect" in body).toBe(false);
    }

    // 5th (last) completes the set.
    const last = await POST(postReq({ questionId: "q4", chosenValue: "o1" }));
    const lastBody = await last.json();
    expect(lastBody.done).toBe(true);
    expect(candidate.questions).toHaveLength(5);

    // Any further GET after completion -> done, no question (never a 6th).
    const after = await GET(getReq());
    const afterBody = await after.json();
    expect(afterBody.done).toBe(true);
    expect(afterBody.question).toBeUndefined();
  });

  // (c) open answer judged silently: satisfiedNeed set server-side, revealed to no one.
  test("open answers are judged silently and never surface the judgement", async () => {
    const res = await POST(postReq({ questionId: "q0", freeText: "I led a full migration to TypeScript across three teams." }));
    expect(res.status).toBe(200);
    const body = await res.json();

    // The silent judge ran and set satisfiedNeed server-side...
    expect(candidate.questions[0].answer?.satisfiedNeed).toBe(true);
    expect(candidate.questions[0].answer?.freeText).toContain("migration");
    // ...but the response reveals nothing.
    expect(body.done).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(SERVER_ONLY_KEYS);
  });

  // (d) after the last answer: re-score with the visible-increase clamp + thank-you.
  test("completing the set re-scores with a visible before->now increase and thanks the candidate", async () => {
    // Answer all 5 with the correct option -> goodAnswers = 5.
    let lastBody: Record<string, unknown> = {};
    for (let i = 0; i < 5; i++) {
      const res = await POST(postReq({ questionId: `q${i}`, chosenValue: "o0" }));
      lastBody = await res.json();
    }

    expect(lastBody.done).toBe(true);
    expect(String(lastBody.message).toLowerCase()).toMatch(/thank|contacted/);

    // completeCandidate persisted a fitAfter with the guaranteed visible increase,
    // even though the LLM proposed a value below the floor.
    expect(dbMock.sourcingCandidate.update).toHaveBeenCalledTimes(1);
    expect(candidate.status).toBe("completed");
    expect(candidate.fitAfter).not.toBeNull();
    expect(candidate.fitAfter as number).toBeGreaterThanOrEqual(FIT_BEFORE + Math.max(1, 5));
  });

  // (f) owner scoping: a question in another user's set is never answerable.
  test("a candidate cannot answer a question that is not in their own set (404, no write)", async () => {
    authMock.mockResolvedValue({ user: { id: "someone-else" } });

    const res = await POST(postReq({ questionId: "q0", chosenValue: "o0" }));
    expect(res.status).toBe(404);
    expect(dbMock.sourcingAnswer.upsert).not.toHaveBeenCalled();
    expect(dbMock.sourcingCandidate.update).not.toHaveBeenCalled();
  });

  // (g) Phase 10 bypass: the delivery path calls neither the assistant nor the
  // target-role detector.
  test("the delivery path bypasses Phase 10 assistant/target-role routing", async () => {
    await GET(getReq());
    for (let i = 0; i < 5; i++) {
      await POST(postReq({ questionId: `q${i}`, chosenValue: "o0" }));
    }

    expect(assistantPostMock).not.toHaveBeenCalled();
    expect(targetRoleQuestionMock).not.toHaveBeenCalled();
    expect(targetRoleAckMock).not.toHaveBeenCalled();
    // No sourcing traffic ever hit the assistant endpoint.
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain("/assistant");
    }
  });
});
