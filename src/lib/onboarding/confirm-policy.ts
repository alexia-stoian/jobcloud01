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
  // Sector-mode fields carry a DISTINCT `sector:` prefix and are persisted via the
  // dedicated sector-questions endpoint (the primary path). This leading branch is
  // defense-in-depth so a `sector:` field is never rejected by the fixed allowlist
  // below, and it never collides with the Phase 11 `sourcing:` mode (Pitfall 3/4).
  if (field.startsWith("sector:")) {
    return true;
  }
  return confirmableFields.has(field);
}

export function buildPendingQuestionMap(questions: OnboardingQuestion[]): Record<string, OnboardingQuestion> {
  return Object.fromEntries(questions.map((question) => [question.id, question]));
}
