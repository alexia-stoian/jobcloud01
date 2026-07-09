import type { CandidateProfile } from "@prisma/client";

export function validateIntentWarnings(profile: CandidateProfile): string[] {
  const warnings: string[] = [];

  if (!profile.workPermitStatus || profile.workPermitStatus.trim().length === 0) {
    warnings.push("workPermitStatus is required and currently missing.");
  }

  if (!profile.salaryExpectation || profile.salaryExpectation.trim().length === 0) {
    warnings.push("salaryExpectation is optional but recommended.");
  }

  return warnings;
}
