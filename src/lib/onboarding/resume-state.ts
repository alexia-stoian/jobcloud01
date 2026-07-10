import type { OnboardingQuestion, OnboardingSessionState } from "@/lib/onboarding/types";

export function restoreOnboardingState(state: OnboardingSessionState): {
  unresolvedQuestions: OnboardingQuestion[];
  skippedQuestions: string[];
} {
  return {
    unresolvedQuestions: state.pendingQuestions.filter((question) => !state.confirmedQuestionIds.includes(question.id)),
    skippedQuestions: state.skippedQuestionIds
  };
}
