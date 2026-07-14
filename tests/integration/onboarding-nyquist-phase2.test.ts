import { beforeEach, describe, expect, test, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  candidateProfile: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  },
  profileQualification: {
    deleteMany: vi.fn(),
    createMany: vi.fn()
  },
  onboardingSession: {
    upsert: vi.fn()
  }
}));

const extractCvFactsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: dbMocks
}));

vi.mock("@/lib/cv/extract", () => ({
  extractCvFacts: extractCvFactsMock
}));

import { planNextOnboardingStep } from "@/ai/onboarding/graph";
import { upsertOnboardingCvExtraction } from "@/lib/onboarding/persist";

describe("phase 02 nyquist coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("continues onboarding when CV parsing is incomplete", () => {
    const result = planNextOnboardingStep({
      userMessage: "I uploaded my cv",
      locale: "en",
      targetRole: "QA Engineer",
      extractedFacts: {},
      uncertainFacts: {},
      pendingQuestions: [],
      skippedQuestionIds: [],
      confirmedQuestionIds: []
    });

    expect("questions" in result).toBe(true);
    if ("questions" in result) {
      expect(result.questions.length).toBeGreaterThan(0);
    }
  });

  test("keeps onboarding active after skipping one question", () => {
    const result = planNextOnboardingStep({
      userMessage: "I uploaded my cv",
      locale: "en",
      targetRole: "QA Engineer",
      extractedFacts: {},
      uncertainFacts: {},
      pendingQuestions: [],
      skippedQuestionIds: ["fullName"],
      confirmedQuestionIds: []
    });

    expect("questions" in result).toBe(true);
    if ("questions" in result) {
      const ids = result.questions.map((question) => question.id);
      expect(ids).not.toContain("fullName");
      expect(result.questions.length).toBeGreaterThan(0);
    }
  });

  test("uses target role to ask role-specific confirmation question", () => {
    const result = planNextOnboardingStep({
      userMessage: "I uploaded my cv for QA Engineer roles",
      locale: "en",
      targetRole: "QA Engineer",
      extractedFacts: { fullName: "Alice", preferredLocation: "Zurich" },
      uncertainFacts: {},
      pendingQuestions: [],
      skippedQuestionIds: [],
      confirmedQuestionIds: []
    });

    expect("questions" in result).toBe(true);
    if ("questions" in result) {
      expect(result.questions.some((question) => question.id === "primaryRole" && question.text.includes("QA Engineer"))).toBe(true);
    }
  });

  test("asks eligibility follow-up when work permit is unclear", () => {
    const result = planNextOnboardingStep({
      userMessage: "I uploaded my cv for a QA Engineer role",
      locale: "en",
      targetRole: "QA Engineer",
      extractedFacts: { fullName: "Alice", preferredLocation: "Zurich" },
      uncertainFacts: { workPermitStatus: "unclear" },
      pendingQuestions: [],
      skippedQuestionIds: [],
      confirmedQuestionIds: []
    });

    expect("questions" in result).toBe(true);
    if ("questions" in result) {
      const fields = result.questions.map((question) => question.field);
      expect(fields).toContain("workPermitStatus");
    }
  });

  test("stores extracted CV details and uncertain facts for onboarding session", async () => {
    extractCvFactsMock.mockResolvedValue({
      facts: {
        fullName: "Alice Doe",
        primaryRole: "QA Engineer",
        currentJobSituation: null,
        employmentObjective: null,
        preferredLocation: null,
        contractPreference: null,
        workRate: null,
        workPermitStatus: null,
        salaryExpectation: null,
        qualifications: [
          { category: "skill", value: "Playwright" }
        ]
      },
      uncertainFacts: {
        workPermitStatus: "unclear"
      }
    });

    dbMocks.candidateProfile.findUnique.mockResolvedValue({ id: "profile-1" });
    dbMocks.candidateProfile.update.mockResolvedValue({
      id: "profile-1",
      fullName: "Alice Doe",
      primaryRole: "QA Engineer",
      currentJobSituation: null,
      employmentObjective: null,
      preferredLocation: null,
      contractPreference: null,
      workRate: null,
      workPermitStatus: null,
      salaryExpectation: null,
      qualifications: []
    });
    dbMocks.onboardingSession.upsert.mockResolvedValue({
      userId: "user-1",
      currentStep: "questioning",
      cvExtractedFacts: {
        fullName: "Alice Doe",
        primaryRole: "QA Engineer",
        qualifications: [{ category: "skill", value: "Playwright" }]
      },
      cvUncertainFacts: { workPermitStatus: "unclear" }
    });

    const result = await upsertOnboardingCvExtraction({
      userId: "user-1",
      cvText: "Alice Doe QA Engineer",
      fileName: "alice-cv.pdf",
      mimeType: "application/pdf",
      locale: "en"
    });

    expect(result.extracted.uncertainFacts).toEqual({ workPermitStatus: "unclear" });
    // Qualifications should NOT be persisted to profile immediately
    expect(dbMocks.profileQualification.createMany).not.toHaveBeenCalled();
    // But should be available in onboarding session
    expect(dbMocks.onboardingSession.upsert).toHaveBeenCalled();
    const upsertCall = dbMocks.onboardingSession.upsert.mock.calls[0];
    expect(upsertCall[0].create?.cvExtractedFacts?.qualifications).toBeTruthy();
  });

  test("persists CV detail fidelity across scalar profile seeds and multi-category qualifications", async () => {
    extractCvFactsMock.mockResolvedValue({
      facts: {
        fullName: "Alice Doe",
        primaryRole: "QA Engineer",
        currentJobSituation: "Employed, open to opportunities",
        employmentObjective: "Find a new job",
        preferredLocation: "Zurich",
        contractPreference: "Permanent",
        workRate: "100%",
        workPermitStatus: "C Permit",
        salaryExpectation: "100k-120k CHF",
        qualifications: [
          { category: "skill", value: "Playwright" },
          { category: "framework", value: "Vitest" },
          { category: "education", value: "BSc Computer Science" }
        ]
      },
      uncertainFacts: {
        languageRequirement: "German B2"
      }
    });

    dbMocks.candidateProfile.findUnique.mockResolvedValue({ id: "profile-1" });
    dbMocks.onboardingSession.upsert.mockResolvedValue({
      userId: "user-1",
      currentStep: "questioning",
      cvExtractedFacts: {
        fullName: "Alice Doe",
        primaryRole: "QA Engineer",
        preferredLocation: "Zurich",
        workPermitStatus: "C Permit",
        salaryExpectation: "100k-120k CHF",
        qualifications: [
          { category: "skill", value: "Playwright" },
          { category: "framework", value: "Vitest" },
          { category: "education", value: "BSc Computer Science" }
        ]
      }
    });

    const result = await upsertOnboardingCvExtraction({
      userId: "user-1",
      cvText: "Alice Doe QA Engineer with Playwright and Vitest experience",
      fileName: "alice-cv.pdf",
      mimeType: "application/pdf",
      locale: "en"
    });

    // Qualifications should NOT be persisted to profile immediately
    expect(dbMocks.profileQualification.createMany).not.toHaveBeenCalled();
    // Profile should NOT be updated with extracted facts
    expect(dbMocks.candidateProfile.update).not.toHaveBeenCalled();
    
    const upsertCall = dbMocks.onboardingSession.upsert.mock.calls[0]?.[0];
    expect(upsertCall.create.cvExtractedFacts).toMatchObject({
      fullName: "Alice Doe",
      primaryRole: "QA Engineer",
      preferredLocation: "Zurich",
      workPermitStatus: "C Permit",
      salaryExpectation: "100k-120k CHF"
    });
    // Verify qualifications are in extracted facts
    expect(upsertCall.create.cvExtractedFacts.qualifications).toEqual([
      { category: "skill", value: "Playwright" },
      { category: "framework", value: "Vitest" },
      { category: "education", value: "BSc Computer Science" }
    ]);
    expect(result.extracted.uncertainFacts).toEqual({ languageRequirement: "German B2" });
  });

  test("completes onboarding when all critical facts are provided", () => {
    const result = planNextOnboardingStep({
      userMessage: "I uploaded my CV",
      locale: "en",
      targetRole: "QA Engineer",
      extractedFacts: {
        fullName: "Alice Doe",
        primaryRole: "QA Engineer",
        preferredLocation: "Zurich",
        workPermitStatus: "C Permit",
        contractPreference: "Permanent"
      },
      uncertainFacts: {
        certificationRequirement: "ISTQB desired",
        languageRequirement: "German B2",
        workCondition: "Onsite availability"
      },
      pendingQuestions: [],
      skippedQuestionIds: [],
      confirmedQuestionIds: []
    });

    // All critical facts provided, so should redirect to complete
    expect("redirect" in result).toBe(true);
    if ("redirect" in result) {
      expect(result.redirect).toBe("onboarding_complete");
    }
  });

  test("does not persist unconfirmed CV assumptions as canonical profile facts", async () => {
    extractCvFactsMock.mockResolvedValue({
      facts: {
        fullName: "Alice Doe",
        primaryRole: "QA Engineer",
        currentJobSituation: null,
        employmentObjective: null,
        preferredLocation: null,
        contractPreference: null,
        workRate: null,
        workPermitStatus: null,
        salaryExpectation: null,
        qualifications: []
      },
      uncertainFacts: {
        primaryRole: "guessed from summary"
      }
    });

    dbMocks.candidateProfile.findUnique.mockResolvedValue({ id: "profile-1" });
    dbMocks.candidateProfile.update.mockResolvedValue({
      id: "profile-1",
      fullName: "Alice Doe",
      primaryRole: "QA Engineer",
      currentJobSituation: null,
      employmentObjective: null,
      preferredLocation: null,
      contractPreference: null,
      workRate: null,
      workPermitStatus: null,
      salaryExpectation: null,
      qualifications: []
    });
    dbMocks.onboardingSession.upsert.mockResolvedValue({
      userId: "user-1",
      currentStep: "questioning",
      cvExtractedFacts: {
        fullName: "Alice Doe",
        primaryRole: "QA Engineer"
      }
    });

    await upsertOnboardingCvExtraction({
      userId: "user-1",
      cvText: "Alice Doe QA Engineer",
      fileName: "alice-cv.pdf",
      mimeType: "application/pdf",
      locale: "en"
    });

    // Verify that profile.update is NOT called - facts stay provisional in onboarding session
    expect(dbMocks.candidateProfile.update).not.toHaveBeenCalled();
    // Verify onboarding session was created/updated with facts
    expect(dbMocks.onboardingSession.upsert).toHaveBeenCalled();
  });
});
