import type { OnboardingQuestion } from "@/lib/onboarding/types";

export function buildQuestionReason(question: OnboardingQuestion): string {
  return question.reason ?? "This helps complete your job-search onboarding profile.";
}
