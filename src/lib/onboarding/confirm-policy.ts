import type { OnboardingQuestion } from "@/lib/onboarding/types";

const confirmableFields = new Set([
  "fullName",
  "currentJobSituation",
  "employmentObjective",
  "primaryRole",
  "preferredLocation",
  "contractPreference",
  "workRate",
  "workPermitStatus",
  "salaryExpectation"
]);

export function canConfirmOnboardingField(field: string): boolean {
  return confirmableFields.has(field);
}

export function buildPendingQuestionMap(questions: OnboardingQuestion[]): Record<string, OnboardingQuestion> {
  return Object.fromEntries(questions.map((question) => [question.id, question]));
}
