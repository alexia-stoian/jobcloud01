import { describe, expect, test } from "vitest";
import { getInteractiveQuestionStateForMode } from "@/lib/onboarding/interactive";

describe("onboarding interactive flow", () => {
  test("starts with employment objective (goal) for pre-CV users", () => {
    const state = getInteractiveQuestionStateForMode({}, { hasCvUpload: false });
    expect(state.question?.field).toBe("employmentObjective");
  });

  test("asks primary role after employment objective is answered", () => {
    const state = getInteractiveQuestionStateForMode({ employmentObjective: "Find a new job" }, { hasCvUpload: false });
    expect(state.question?.field).toBe("primaryRole");
  });

  test("pre-CV questions support custom answers", () => {
    const state = getInteractiveQuestionStateForMode({ employmentObjective: "Find a new job" }, { hasCvUpload: false });
    expect(state.question?.allowCustom).toBe(true);
  });

  test("post-CV flow starts with preferred location", () => {
    const state = getInteractiveQuestionStateForMode({}, { hasCvUpload: true });
    expect(state.question?.field).toBe("preferredLocation");
  });
});
