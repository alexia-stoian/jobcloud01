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
    targetRoles: string | null;
    targetSeniority: string | null;
    targetIndustries: string | null;
    preferredWorkModel: string | null;
    contractPreference: string | null;
    workRate: string | null;
    workPermitStatus: string | null;
    salaryExpectation: string | null;
    visaSponsorship: string | null;
    relocationWillingness: string | null;
    commuteRadius: string | null;
    locale: string;
    editorDraft: Record<string, unknown> | null;
    sectorPreferences: unknown;
    updatedAt: string;
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
      targetRoles: input.profile.targetRoles,
      targetSeniority: input.profile.targetSeniority,
      targetIndustries: input.profile.targetIndustries,
      preferredWorkModel: input.profile.preferredWorkModel,
      contractPreference: input.profile.contractPreference,
      workRate: input.profile.workRate,
      workPermitStatus: input.profile.workPermitStatus,
      salaryExpectation: input.profile.salaryExpectation,
      visaSponsorship: input.profile.visaSponsorship,
      relocationWillingness: input.profile.relocationWillingness,
      commuteRadius: input.profile.commuteRadius,
      locale: input.profile.locale,
      editorDraft: (input.profile.editorDraft as Record<string, unknown> | null) ?? null,
      sectorPreferences: (input.profile.sectorPreferences as unknown) ?? {},
      updatedAt: input.profile.updatedAt.toISOString()
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
