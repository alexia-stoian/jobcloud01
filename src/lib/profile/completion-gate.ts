import type { CandidateProfile } from "@prisma/client";

// Minimal gate: these 5 fields are required for profile to be "minimally complete"
const MINIMAL_CRITICAL_FIELDS: Array<keyof CandidateProfile> = [
  "fullName",
  "preferredLocation",
  "primaryRole",
  "workPermitStatus"
  // locale is checked separately via profile.locale
];

// Soft warnings: recommended but not required
const RECOMMENDED_FIELDS: Array<keyof CandidateProfile> = [
  "currentJobSituation",
  "employmentObjective",
  "contractPreference",
  "workRate",
  "salaryExpectation",
  "visaSponsorship",
  "relocationWillingness",
  "commuteRadius"
];

export function computeCompletion(profile: CandidateProfile): {
  isMinimallyComplete: boolean;
  missingCriticalFields: string[];
} {
  const missingCriticalFields: string[] = [];

  // Check minimal critical fields
  for (const field of MINIMAL_CRITICAL_FIELDS) {
    const value = profile[field];
    if (!value || (typeof value === "string" && value.trim().length === 0)) {
      missingCriticalFields.push(field);
    }
  }

  // Locale must also be set
  if (!profile.locale || profile.locale.trim().length === 0) {
    missingCriticalFields.push("locale");
  }

  return {
    isMinimallyComplete: missingCriticalFields.length === 0,
    missingCriticalFields
  };
}
