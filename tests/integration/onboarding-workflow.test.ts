import { describe, expect, test } from "vitest";
import { canConfirmOnboardingField } from "@/lib/onboarding/confirm-policy";
import { restoreOnboardingState } from "@/lib/onboarding/resume-state";

describe("onboarding workflow helpers", () => {
  test("allows only confirmable fields", () => {
    expect(canConfirmOnboardingField("primaryRole")).toBe(true);
    expect(canConfirmOnboardingField("salaryExpectation")).toBe(true);
    expect(canConfirmOnboardingField("qualifications")).toBe(false);
  });

  test("restores unresolved and skipped questions", () => {
    const resumed = restoreOnboardingState({
      userId: "user-1",
      locale: "en",
      currentStep: "questioning",
      targetRole: null,
      cvFileName: null,
      cvMimeType: null,
      cvExtractedFacts: {},
      cvUncertainFacts: {},
      pendingQuestions: [
        { id: "q1", text: "Question 1", required: true },
        { id: "q2", text: "Question 2", required: false }
      ],
      skippedQuestionIds: ["q2"],
      confirmedQuestionIds: ["q1"],
      lastInteractedAt: null
    });

    expect(resumed.unresolvedQuestions).toHaveLength(1);
    expect(resumed.unresolvedQuestions[0].id).toBe("q2");
    expect(resumed.skippedQuestions).toEqual(["q2"]);
  });
});
