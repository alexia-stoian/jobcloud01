import type { CandidateProfile } from "@prisma/client";

const CRITICAL_FIELDS: Array<keyof CandidateProfile> = [
  "fullName",
  "preferredLocation",
  "primaryRole",
  "locale",
  "workPermitStatus"
];

export function computeCompletion(profile: CandidateProfile): {
  isMinimallyComplete: boolean;
  missingCriticalFields: string[];
} {
  const missingCriticalFields = CRITICAL_FIELDS.filter((field) => {
    const value = profile[field];
    return !value || (typeof value === "string" && value.trim().length === 0);
  }).map((field) => String(field));

  return {
    isMinimallyComplete: missingCriticalFields.length === 0,
    missingCriticalFields
  };
}
