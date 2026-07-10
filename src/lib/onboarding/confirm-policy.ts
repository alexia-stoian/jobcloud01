import type { OnboardingQuestion } from "@/lib/onboarding/types";

const confirmableFields = new Set([
  "fullName",
  "currentJobSituation",
  "employmentObjective",
  "primaryRole",
  "preferredLocation",
  "targetRoles",
  "targetSeniority",
  "targetIndustries",
  "preferredWorkModel",
  "contractPreference",
  "workRate",
  "workPermitStatus",
  "salaryExpectation",
  "visaSponsorship",
  "relocationWillingness",
  "commuteRadius"
]);

export function canConfirmOnboardingField(field: string): boolean {
  return confirmableFields.has(field);
}

export function buildPendingQuestionMap(questions: OnboardingQuestion[]): Record<string, OnboardingQuestion> {
  return Object.fromEntries(questions.map((question) => [question.id, question]));
}
