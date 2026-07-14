import { beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

const authMock = vi.hoisted(() => vi.fn());
const upsertOnboardingCvExtractionMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth/config", () => ({
  auth: authMock
}));

vi.mock("@/lib/onboarding/persist", () => ({
  upsertOnboardingCvExtraction: upsertOnboardingCvExtractionMock
}));

vi.mock("@/lib/cv/extract", () => ({
  cvUploadRequestSchema: z.object({
    cvText: z.string().min(20),
    fileName: z.string().min(1).optional(),
    mimeType: z.string().min(1).optional(),
    locale: z.enum(["en", "de", "fr"]).default("en")
  })
}));

import { POST } from "@/app/api/onboarding/cv/upload/route";

describe("onboarding cv upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns 401 when user is not authenticated", async () => {
    authMock.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/onboarding/cv/upload", {
      method: "POST",
      body: JSON.stringify({ cvText: "This CV content is long enough to pass schema validation", locale: "en" })
    }) as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
  });

  test("returns 400 when payload is invalid", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });

    const response = await POST(new Request("http://localhost/api/onboarding/cv/upload", {
      method: "POST",
      body: JSON.stringify({ cvText: "too short", locale: "en" })
    }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_payload" });
  });

  test("returns extracted payload and scopes extraction to authenticated user", async () => {
    authMock.mockResolvedValue({ user: { id: "user-42" } });
    upsertOnboardingCvExtractionMock.mockResolvedValue({
      session: { userId: "user-42", currentStep: "questioning" },
      extracted: {
        facts: { fullName: "Alice Doe", primaryRole: "QA Engineer" },
        uncertainFacts: { workPermitStatus: "unclear" }
      },
      profileSeeds: {
        fullName: "Alice Doe",
        primaryRole: "QA Engineer"
      }
    });

    const response = await POST(new Request("http://localhost/api/onboarding/cv/upload", {
      method: "POST",
      body: JSON.stringify({
        cvText: "Alice Doe QA Engineer with automation and testing experience",
        fileName: "alice-cv.pdf",
        mimeType: "application/pdf",
        locale: "en"
      })
    }) as never);

    expect(upsertOnboardingCvExtractionMock).toHaveBeenCalledWith({
      userId: "user-42",
      cvText: "Alice Doe QA Engineer with automation and testing experience",
      fileName: "alice-cv.pdf",
      mimeType: "application/pdf",
      locale: "en"
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      facts: { fullName: "Alice Doe", primaryRole: "QA Engineer" },
      uncertainFacts: { workPermitStatus: "unclear" }
    });
  });

  test("returns 500 when extraction fails", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    upsertOnboardingCvExtractionMock.mockRejectedValue(new Error("extract failed"));

    const response = await POST(new Request("http://localhost/api/onboarding/cv/upload", {
      method: "POST",
      body: JSON.stringify({
        cvText: "Alice Doe QA Engineer with automation and testing experience",
        locale: "en"
      })
    }) as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "extraction_failed",
      detail: "extract failed"
    });
  });
});