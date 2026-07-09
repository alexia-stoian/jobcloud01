import { describe, expect, test } from "vitest";
import type { CandidateProfile, OnboardingSession, ProfileQualification } from "@prisma/client";
import { buildDurableProfileMemory } from "@/lib/profile/memory";

describe("profile memory builder", () => {
  test("preserves profile correlation and confirmed onboarding ids", () => {
    const profile = {
      id: "p1",
      userId: "u1",
      locale: "en",
      fullName: "Alex",
      currentJobSituation: null,
      employmentObjective: null,
      primaryRole: "Designer",
      preferredLocation: null,
      contractPreference: null,
      workRate: null,
      workPermitStatus: null,
      salaryExpectation: null,
      roleSuggestionsUsed: false,
      isMinimallyComplete: false,
      missingCriticalFields: [],
      lastCompletionCheckAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } as CandidateProfile;

    const onboarding = {
      confirmedQuestionIds: ["q1", "q2"]
    } as OnboardingSession;

    const qualifications = [{
      id: "qual1",
      profileId: "p1",
      category: "skill",
      value: "Figma",
      createdAt: new Date(),
      updatedAt: new Date()
    }] as ProfileQualification[];

    const memory = buildDurableProfileMemory({
      profile,
      qualifications,
      onboardingSession: onboarding
    });

    expect(memory.userId).toBe("u1");
    expect(memory.profileId).toBe("p1");
    expect(memory.confirmedOnboardingQuestionIds).toEqual(["q1", "q2"]);
    expect(memory.qualifications[0].value).toBe("Figma");
  });
});
