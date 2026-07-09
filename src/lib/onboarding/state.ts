import type { OnboardingQuestion, OnboardingSessionState, OnboardingStep } from "@/lib/onboarding/types";

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  "cv_upload",
  "cv_extract",
  "questioning",
  "confirming",
  "complete"
] as const;

export function createDefaultOnboardingSessionState(input: {
  userId: string;
  locale?: "en" | "de" | "fr";
}): OnboardingSessionState {
  return {
    userId: input.userId,
    locale: input.locale ?? "en",
    currentStep: "cv_upload",
    targetRole: null,
    cvFileName: null,
    cvMimeType: null,
    cvExtractedFacts: {},
    cvUncertainFacts: {},
    pendingQuestions: [],
    skippedQuestionIds: [],
    confirmedQuestionIds: [],
    lastInteractedAt: null
  };
}

export function normalizeQuestion(question: OnboardingQuestion): OnboardingQuestion {
  return {
    id: question.id,
    field: question.field,
    text: question.text.trim(),
    required: question.required,
    reason: question.reason?.trim()
  };
}

export function isTerminalStep(step: OnboardingStep): boolean {
  return step === "complete";
}
