import { describe, expect, test } from "vitest";
import { getInteractiveQuestionStateForMode } from "@/lib/onboarding/interactive";

describe("onboarding interactive flow", () => {
  test("starts with name for pre-CV users", () => {
    const state = getInteractiveQuestionStateForMode({}, { hasCvUpload: false });
    expect(state.question?.field).toBe("fullName");
  });

  test("asks current role after name", () => {
    const state = getInteractiveQuestionStateForMode({ fullName: "Alex" }, { hasCvUpload: false });
    expect(state.question?.field).toBe("primaryRole");
  });

  test("includes not sure yet option on option-based questions", () => {
    const state = getInteractiveQuestionStateForMode({ fullName: "Alex" }, { hasCvUpload: false });
    const labels = state.question?.options?.map((option) => option.value) ?? [];
    expect(labels).toContain("Not sure yet");
  });

  test("post-CV flow starts with preferences", () => {
    const state = getInteractiveQuestionStateForMode({}, { hasCvUpload: true });
    expect(state.question?.field).toBe("salaryExpectation");
  });
});
