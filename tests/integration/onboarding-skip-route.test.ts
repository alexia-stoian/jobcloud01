import { beforeEach, describe, expect, test, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const dbMock = vi.hoisted(() => ({
  onboardingSession: {
    findUnique: vi.fn(),
    update: vi.fn()
  }
}));

vi.mock("@/auth/config", () => ({
  auth: authMock
}));

vi.mock("@/lib/db", () => ({
  db: dbMock
}));

import { POST } from "@/app/api/onboarding/skip/route";

describe("onboarding skip route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns 401 when user is not authenticated", async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/onboarding/skip", {
      method: "POST",
      body: JSON.stringify({ questionId: "q-1" })
    }) as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  test("returns 400 when questionId is missing", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });

    const response = await POST(new Request("http://localhost/api/onboarding/skip", {
      method: "POST",
      body: JSON.stringify({})
    }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_payload" });
  });

  test("returns 404 when onboarding session is missing", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    dbMock.onboardingSession.findUnique.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/onboarding/skip", {
      method: "POST",
      body: JSON.stringify({ questionId: "q-1" })
    }) as never);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "onboarding_not_started" });
  });

  test("stores skipped question IDs without duplicates", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    dbMock.onboardingSession.findUnique.mockResolvedValue({
      userId: "user-1",
      skippedQuestionIds: ["q-1"]
    });
    dbMock.onboardingSession.update.mockResolvedValue({ userId: "user-1", skippedQuestionIds: ["q-1", "q-2"] });

    const response = await POST(new Request("http://localhost/api/onboarding/skip", {
      method: "POST",
      body: JSON.stringify({ questionId: "q-2" })
    }) as never);

    expect(dbMock.onboardingSession.update).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: expect.objectContaining({
        skippedQuestionIds: ["q-1", "q-2"],
        currentStep: "questioning"
      })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, skippedQuestionIds: ["q-1", "q-2"] });
  });
});