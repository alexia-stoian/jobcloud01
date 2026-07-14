import { beforeEach, describe, expect, test, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const dbMock = vi.hoisted(() => ({
  onboardingSession: {
    findUnique: vi.fn(),
    update: vi.fn()
  },
  candidateProfile: {
    upsert: vi.fn()
  }
}));

vi.mock("@/auth/config", () => ({
  auth: authMock
}));

vi.mock("@/lib/db", () => ({
  db: dbMock
}));

import { POST } from "@/app/api/onboarding/confirm/route";

describe("onboarding confirm route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns 401 when user is not authenticated", async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/onboarding/confirm", {
      method: "POST",
      body: JSON.stringify({ field: "primaryRole", value: "QA Engineer" })
    }) as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  test("returns 400 for non-confirmable fields", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });

    const response = await POST(new Request("http://localhost/api/onboarding/confirm", {
      method: "POST",
      body: JSON.stringify({ field: "qualifications", value: "Playwright" })
    }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_payload" });
  });

  test("returns 404 when onboarding session is missing", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    dbMock.onboardingSession.findUnique.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/onboarding/confirm", {
      method: "POST",
      body: JSON.stringify({ field: "primaryRole", value: "QA Engineer" })
    }) as never);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "onboarding_not_started" });
  });

  test("persists confirmed field and removes confirmed question from pending list", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    dbMock.onboardingSession.findUnique.mockResolvedValue({
      userId: "user-1",
      locale: "en",
      confirmedQuestionIds: ["q-1"],
      pendingQuestions: [
        { id: "q-1", field: "primaryRole", text: "Question 1", required: true },
        { id: "q-2", field: "salaryExpectation", text: "Question 2", required: true }
      ]
    });
    dbMock.candidateProfile.upsert.mockResolvedValue({ id: "profile-1", primaryRole: "QA Engineer" });
    dbMock.onboardingSession.update.mockResolvedValue({ userId: "user-1" });

    const response = await POST(new Request("http://localhost/api/onboarding/confirm", {
      method: "POST",
      body: JSON.stringify({ field: "primaryRole", value: "  QA Engineer  ", questionId: "q-1" })
    }) as never);

    expect(dbMock.candidateProfile.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: {
        userId: "user-1",
        locale: "en",
        primaryRole: "QA Engineer"
      },
      update: {
        primaryRole: "QA Engineer"
      }
    });

    expect(dbMock.onboardingSession.update).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: expect.objectContaining({
        confirmedQuestionIds: ["q-1"],
        pendingQuestions: [{ id: "q-2", field: "salaryExpectation", text: "Question 2", required: true }],
        currentStep: "questioning"
      })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
  });
});