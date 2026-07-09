import type { CandidateProfile, ProfileHistoryEvent, ProfileQualification } from "@prisma/client";

export function buildProfileSummary(input: {
  profile: CandidateProfile;
  qualifications: ProfileQualification[];
  history: ProfileHistoryEvent[];
}): {
  profile: {
    fullName: string | null;
    currentJobSituation: string | null;
    employmentObjective: string | null;
    primaryRole: string | null;
    preferredLocation: string | null;
    contractPreference: string | null;
    workRate: string | null;
    workPermitStatus: string | null;
    salaryExpectation: string | null;
    locale: string;
  };
  completion: {
    isMinimallyComplete: boolean;
    missingCriticalFields: string[];
  };
  qualifications: Array<{ category: string; value: string }>;
  history: Array<{ id: string; createdAt: string; source: string }>;
} {
  return {
    profile: {
      fullName: input.profile.fullName,
      currentJobSituation: input.profile.currentJobSituation,
      employmentObjective: input.profile.employmentObjective,
      primaryRole: input.profile.primaryRole,
      preferredLocation: input.profile.preferredLocation,
      contractPreference: input.profile.contractPreference,
      workRate: input.profile.workRate,
      workPermitStatus: input.profile.workPermitStatus,
      salaryExpectation: input.profile.salaryExpectation,
      locale: input.profile.locale
    },
    completion: {
      isMinimallyComplete: input.profile.isMinimallyComplete,
      missingCriticalFields: input.profile.missingCriticalFields as string[]
    },
    qualifications: input.qualifications.map((item) => ({
      category: item.category,
      value: item.value
    })),
    history: input.history.map((event) => ({
      id: event.id,
      createdAt: event.createdAt.toISOString(),
      source: event.source
    }))
  };
}
