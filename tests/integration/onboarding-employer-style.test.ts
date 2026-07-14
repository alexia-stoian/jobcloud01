import { describe, expect, test } from "vitest";
import { planNextOnboardingStep } from "@/ai/onboarding/graph";

describe("onboarding employer-style follow-up", () => {
  test("prioritizes unresolved employer screening signals", () => {
    const result = planNextOnboardingStep({
      userMessage: "I uploaded my CV and want roles in Zurich",
      locale: "en",
      targetRole: "QA Engineer",
      extractedFacts: {
        fullName: "Alice Doe",
        preferredLocation: "Zurich"
      },
      uncertainFacts: {
        workPermitStatus: "unclear",
        languageRequirement: "German B2 or higher"
      },
      pendingQuestions: [],
      skippedQuestionIds: [],
      confirmedQuestionIds: []
    });

    expect("questions" in result).toBe(true);
    if ("questions" in result) {
      const fields = result.questions.map((question) => question.field);
      const reasoning = result.questions
        .map((question) => (question.reason ?? "").toLowerCase())
        .join(" ");
      expect(fields).toContain("workPermitStatus");
      expect(reasoning).toMatch(/employers|matching|eligibility/);
    }
  });
});