import { describe, expect, test } from "vitest";
import { createOnboardingDefaultState } from "@/lib/onboarding/validation";

describe("onboarding state", () => {
  test("creates a scoped default state", () => {
    const state = createOnboardingDefaultState("user-1", "de");

    expect(state.userId).toBe("user-1");
    expect(state.locale).toBe("de");
    expect(state.currentStep).toBe("cv_upload");
    expect(state.pendingQuestions).toHaveLength(0);
  });
});
