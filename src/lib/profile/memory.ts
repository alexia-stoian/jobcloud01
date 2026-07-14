import type { CandidateProfile, OnboardingSession, ProfileQualification } from "@prisma/client";

export type DurableProfileMemory = {
  userId: string;
  profileId: string;
  locale: string;
  profile: {
    fullName: string | null;
    currentJobSituation: string | null;
    employmentObjective: string | null;
    primaryRole: string | null;
    targetRole: string | null;  // User's stated career goal
    preferredLocation: string | null;
    contractPreference: string | null;
    workRate: string | null;
    workPermitStatus: string | null;
    salaryExpectation: string | null;
  };
  qualifications: Array<{ category: string; value: string }>;
  confirmedOnboardingQuestionIds: string[];
  generatedAt: string;
};

export function buildDurableProfileMemory(input: {
  profile: CandidateProfile;
  qualifications: ProfileQualification[];
  onboardingSession: OnboardingSession | null;
}): DurableProfileMemory {
  const confirmedIds = Array.isArray(input.onboardingSession?.confirmedQuestionIds)
    ? input.onboardingSession!.confirmedQuestionIds.filter((id): id is string => typeof id === "string")
    : [];

  return {
    userId: input.profile.userId,
    profileId: input.profile.id,
    locale: input.profile.locale,
    profile: {
      fullName: input.profile.fullName,
      currentJobSituation: input.profile.currentJobSituation,
      employmentObjective: input.profile.employmentObjective,
      primaryRole: input.profile.primaryRole,
      targetRole: input.profile.targetRoles || input.onboardingSession?.targetRole,  // Include target role from profile or onboarding session
      preferredLocation: input.profile.preferredLocation,
      contractPreference: input.profile.contractPreference,
      workRate: input.profile.workRate,
      workPermitStatus: input.profile.workPermitStatus,
      salaryExpectation: input.profile.salaryExpectation
    },
    qualifications: input.qualifications.map((item) => ({
      category: item.category,
      value: item.value
    })),
    confirmedOnboardingQuestionIds: confirmedIds,
    generatedAt: new Date().toISOString()
  };
}
