import { describe, expect, test } from "vitest";
import { planNextOnboardingStep } from "@/ai/onboarding/graph";

describe("onboarding scope", () => {
  test("rejects off-scope prompts", () => {
    const result = planNextOnboardingStep({
      userMessage: "tell me a joke",
      locale: "en",
      targetRole: null,
      extractedFacts: {},
      uncertainFacts: {},
      pendingQuestions: [],
      skippedQuestionIds: [],
      confirmedQuestionIds: []
    });

    expect("redirect" in result).toBe(true);
    if ("redirect" in result) {
      expect(result.redirect).toBe("onboarding_scope_guard");
    }
  });

  test("returns a relevant question for missing profile data", () => {
    const result = planNextOnboardingStep({
      userMessage: "I am updating my CV",
      locale: "en",
      targetRole: "QA Engineer",
      extractedFacts: { fullName: "Alice" },
      uncertainFacts: { workPermitStatus: "unclear" },
      pendingQuestions: [],
      skippedQuestionIds: [],
      confirmedQuestionIds: []
    });

    expect("questions" in result).toBe(true);
    if ("questions" in result) {
      expect(result.questions.length).toBeGreaterThan(0);
      expect(result.questions[0].field).toBeDefined();
    }
  });
});
