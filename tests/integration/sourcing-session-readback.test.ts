import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextResponse } from "next/server";

// --- Hoisted spies -------------------------------------------------------
const requireAdminMock = vi.hoisted(() => vi.fn());

// The sourcing DB models the read-back path (real `readBackForRecruiter`) touches.
const dbMock = vi.hoisted(() => ({
  sourcingCandidate: {
    findFirst: vi.fn()
  }
}));

// POST-route dependency spies.
const parseRecruiterNeedsMock = vi.hoisted(() => vi.fn());
const aggregateCandidatesMock = vi.hoisted(() => vi.fn());
const rankCandidatesMock = vi.hoisted(() => vi.fn());
const buildMatchChecklistMock = vi.hoisted(() => vi.fn());
const buildConciseSummaryMock = vi.hoisted(() => vi.fn());
const buildReportsMock = vi.hoisted(() => vi.fn());
const computeCommuteMock = vi.hoisted(() => vi.fn());

// session-dal write spies (read-back stays REAL via importActual so the strip
// is proven, not stubbed).
const createSourcingRunMock = vi.hoisted(() => vi.fn());
const findActiveCandidateMock = vi.hoisted(() => vi.fn());
const completeCandidateMock = vi.hoisted(() => vi.fn());
const queueCandidateQuestionsMock = vi.hoisted(() => vi.fn());

const generateGapQuestionsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: requireAdminMock
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

vi.mock("@/lib/sourcing/recruiter-needs", () => ({
  parseRecruiterNeeds: parseRecruiterNeedsMock
}));

vi.mock("@/lib/sourcing/aggregate", () => ({
  aggregateCandidates: aggregateCandidatesMock
}));

vi.mock("@/lib/sourcing/score", () => ({
  rankCandidates: rankCandidatesMock,
  buildMatchChecklist: buildMatchChecklistMock,
  buildConciseSummary: buildConciseSummaryMock
}));

vi.mock("@/lib/sourcing/report", () => ({
  buildReports: buildReportsMock,
  computeCommute: computeCommuteMock
}));

vi.mock("@/lib/sourcing/questions", () => ({
  generateGapQuestions: generateGapQuestionsMock
}));

// Partial mock: keep the REAL `readBackForRecruiter` (so the strip is exercised
// against `@/lib/db`) but spy the write functions the POST route calls.
vi.mock("@/lib/sourcing/session-dal", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/sourcing/session-dal")>();
  return {
    ...actual,
    createSourcingRun: createSourcingRunMock,
    findActiveCandidate: findActiveCandidateMock,
    completeCandidate: completeCandidateMock,
    queueCandidateQuestions: queueCandidateQuestionsMock
  };
});

import { GET } from "@/app/api/admin/sourcing/session/route";
import { POST } from "@/app/api/admin/sourcing/route";

type AnyObj = Record<string, unknown>;

function scored(userId: string, name: string, score: number): AnyObj {
  return {
    bundle: {
      userId,
      name,
      preferences: { preferredLocation: null, commuteRadius: null }
    },
    score
  };
}

function report(fitPercent: number): AnyObj {
  return {
    fitPercent,
    whyFit: "",
    bestSkills: [],
    pros: [],
    cons: [],
    verdict: "consider",
    recommendation: "",
    grounded: true
  };
}

describe("sourcing session read-back", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({ userId: "admin-1" });
  });

  // (a) Admin caller gets before->now + Q&A with NO correctness leakage.
  test("admin read-back returns before/after + Q&A and never leaks server-only fields", async () => {
    dbMock.sourcingCandidate.findFirst.mockImplementation(async ({ where }: AnyObj) => {
      if ((where as AnyObj).candidateUserId !== "user-60") {
        return null;
      }
      return {
        candidateUserId: "user-60",
        fitBefore: 60,
        fitAfter: 72,
        questions: [
          {
            prompt: "How often do you deploy to Kubernetes?",
            // Full server-only options MUST be stripped by readBackForRecruiter.
            options: [
              { value: "o0", label: "Daily in production", isCorrect: true, isOpen: false },
              { value: "o1", label: "Never", isCorrect: false, isOpen: false },
              { value: "open", label: "write your own answer", isCorrect: false, isOpen: true }
            ],
            gapLabel: "Skill: Kubernetes",
            answer: { chosenValue: "o0", freeText: null, satisfiedNeed: true }
          }
        ]
      };
    });

    const response = await GET(
      new Request("http://localhost/api/admin/sourcing/session?userIds=user-60") as never
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.candidates).toHaveLength(1);
    const candidate = body.candidates[0];
    expect(candidate.candidateUserId).toBe("user-60");
    expect(candidate.fitBefore).toBe(60);
    expect(candidate.fitAfter).toBe(72);
    expect(candidate.answered).toBe(true);
    expect(candidate.questions).toHaveLength(1);
    expect(candidate.questions[0].prompt).toBe("How often do you deploy to Kubernetes?");
    expect(candidate.questions[0].answer).toBe("Daily in production");

    // No server-only correctness field may appear ANYWHERE in the JSON.
    const raw = JSON.stringify(body);
    for (const forbidden of ["isCorrect", "isOpen", "satisfiedNeed", "needsSnapshot", "gapLabel"]) {
      expect(raw).not.toContain(forbidden);
    }
  });

  // (b) Non-admin gets 404 BEFORE any DB read.
  test("non-admin gets 404 and no DB read runs", async () => {
    requireAdminMock.mockResolvedValueOnce({
      response: NextResponse.json({ error: "not_found" }, { status: 404 })
    });

    const response = await GET(
      new Request("http://localhost/api/admin/sourcing/session?userIds=user-60") as never
    );

    expect(response.status).toBe(404);
    expect(dbMock.sourcingCandidate.findFirst).not.toHaveBeenCalled();
  });
});

describe("sourcing run >=60 gap-question trigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({ userId: "admin-1" });
    parseRecruiterNeedsMock.mockReturnValue({ needs: { role: "Engineer", location: "Zurich" } });
    aggregateCandidatesMock.mockResolvedValue([{}, {}, {}]);
    rankCandidatesMock.mockReturnValue([
      scored("user-58", "Cand FiftyEight", 90),
      scored("user-60", "Cand Sixty", 88),
      scored("user-62", "Cand SixtyTwo", 86)
    ]);
    buildReportsMock.mockResolvedValue(
      new Map([
        ["user-58", report(58)],
        ["user-60", report(60)],
        ["user-62", report(62)]
      ])
    );
    computeCommuteMock.mockResolvedValue({ withinRadius: false });
    buildMatchChecklistMock.mockReturnValue([]);
    buildConciseSummaryMock.mockReturnValue("");
    createSourcingRunMock.mockResolvedValue({ id: "run-1" });
    generateGapQuestionsMock.mockResolvedValue([
      { orderIndex: 0, gapLabel: "g0", prompt: "q0", options: [], allowCustom: true },
      { orderIndex: 1, gapLabel: "g1", prompt: "q1", options: [], allowCustom: true },
      { orderIndex: 2, gapLabel: "g2", prompt: "q2", options: [], allowCustom: true }
    ]);
    // Default: no candidate has a prior active set.
    findActiveCandidateMock.mockResolvedValue(null);
  });

  async function runPost(): Promise<Response> {
    return (await POST(
      new Request("http://localhost/api/admin/sourcing", {
        method: "POST",
        body: JSON.stringify({ role: "Engineer" })
      }) as never
    )) as unknown as Response;
  }

  // (c) 58% is NOT queued.
  test("a 58% candidate is NOT queued", async () => {
    const response = await runPost();
    expect(response.status).toBe(200);

    const queuedIds = queueCandidateQuestionsMock.mock.calls.map(
      (call) => (call[0] as AnyObj).candidateUserId
    );
    expect(queuedIds).not.toContain("user-58");
  });

  // (d) 60% and 62% are EACH queued once with fitBefore === fitPercent, <=5 questions.
  test("60% and 62% candidates are each queued once with fitBefore === fitPercent", async () => {
    await runPost();

    expect(queueCandidateQuestionsMock).toHaveBeenCalledTimes(2);

    const calls = queueCandidateQuestionsMock.mock.calls.map((call) => call[0] as AnyObj);
    const sixty = calls.filter((c) => c.candidateUserId === "user-60");
    const sixtyTwo = calls.filter((c) => c.candidateUserId === "user-62");

    expect(sixty).toHaveLength(1);
    expect(sixtyTwo).toHaveLength(1);
    expect(sixty[0].fitBefore).toBe(60);
    expect(sixtyTwo[0].fitBefore).toBe(62);

    for (const c of calls) {
      expect((c.questions as unknown[]).length).toBeLessThanOrEqual(5);
    }
  });

  // (e) A prior active set is retired BEFORE the new queue (one active set per candidate).
  test("an existing active set is retired before requeue (one active set per candidate)", async () => {
    findActiveCandidateMock.mockImplementation(async (candidateUserId: string) =>
      candidateUserId === "user-60"
        ? { id: "existing-60", fitBefore: 55, fitAfter: null }
        : null
    );

    await runPost();

    // Retired exactly the prior set with no visible change (fitAfter = prior fitBefore).
    expect(completeCandidateMock).toHaveBeenCalledTimes(1);
    expect(completeCandidateMock).toHaveBeenCalledWith({
      candidateId: "existing-60",
      fitAfter: 55
    });

    // completeCandidate ran BEFORE the fresh queue for user-60.
    const completeOrder = completeCandidateMock.mock.invocationCallOrder[0];
    const queueIndex = queueCandidateQuestionsMock.mock.calls.findIndex(
      (call) => (call[0] as AnyObj).candidateUserId === "user-60"
    );
    const queueOrder = queueCandidateQuestionsMock.mock.invocationCallOrder[queueIndex];
    expect(completeOrder).toBeLessThan(queueOrder);

    // Only ONE fresh set was queued for user-60 (no second live set).
    const sixtyQueues = queueCandidateQuestionsMock.mock.calls.filter(
      (call) => (call[0] as AnyObj).candidateUserId === "user-60"
    );
    expect(sixtyQueues).toHaveLength(1);
  });
});
