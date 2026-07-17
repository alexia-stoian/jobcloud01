import "./_setup-env";
import { describe, expect, test } from "vitest";
import { stripSatisfiedPreferenceCons } from "@/lib/sourcing/report";
import { seedSignals } from "@/lib/ai/signals/signal-definitions";
import type { CandidateBundle, RecruiterNeeds, ScoredCandidate } from "@/lib/sourcing/types";

function scoredWith(preferences: Partial<CandidateBundle["preferences"]>): ScoredCandidate {
  const bundle: CandidateBundle = {
    userId: "u1",
    name: "Test",
    primaryRole: null,
    skills: [],
    languages: [],
    languageProficiencies: [],
    experience: [],
    education: [],
    estimatedYearsExperience: 0,
    preferences: {
      preferredLocation: null,
      currentJobSituation: null,
      employmentObjective: null,
      targetRoles: null,
      targetSeniority: null,
      targetIndustries: null,
      preferredWorkModel: null,
      contractPreference: null,
      workRate: null,
      workPermitStatus: null,
      salaryExpectation: null,
      visaSponsorship: null,
      relocationWillingness: null,
      commuteRadius: null,
      ...preferences
    },
    signals: seedSignals()
  };
  return {
    bundle,
    score: 80,
    breakdown: {
      mustHave: 0,
      requiredSkills: 0,
      niceToHaveSkills: 0,
      experience: 0,
      education: 0,
      languages: 0,
      preferences: 1,
      signals: 0
    },
    matchedRequiredSkills: [],
    matchedNiceToHaveSkills: [],
    missingRequiredSkills: []
  };
}

describe("stripSatisfiedPreferenceCons", () => {
  test("removes cons about a work model the candidate already matches", () => {
    const scored = scoredWith({ preferredWorkModel: "Remote" });
    const needs: RecruiterNeeds = { workModel: "Remote" };
    const cons = [
      "Candidate prefers remote work — confirm this aligns with the role.",
      "Missing required skill: Kubernetes."
    ];
    const result = stripSatisfiedPreferenceCons(cons, needs, scored);
    expect(result).toEqual(["Missing required skill: Kubernetes."]);
  });

  test("removes cons about a matched location", () => {
    const scored = scoredWith({ preferredLocation: "Zurich" });
    const needs: RecruiterNeeds = { location: "Zurich" };
    const cons = ["Located in Zurich, verify willingness to commute.", "Only 2 years of experience."];
    const result = stripSatisfiedPreferenceCons(cons, needs, scored);
    expect(result).toEqual(["Only 2 years of experience."]);
  });

  test("removes cons about a matched contract preference", () => {
    const scored = scoredWith({ contractPreference: "Permanent" });
    const needs: RecruiterNeeds = { contract: "Permanent" };
    const cons = ["Wants a permanent contract — align with the offer.", "No leadership experience."];
    const result = stripSatisfiedPreferenceCons(cons, needs, scored);
    expect(result).toEqual(["No leadership experience."]);
  });

  test("keeps preference cons when the candidate does NOT match", () => {
    const scored = scoredWith({ preferredWorkModel: "On-site" });
    const needs: RecruiterNeeds = { workModel: "Remote" };
    const cons = ["Candidate prefers on-site but the role is remote."];
    const result = stripSatisfiedPreferenceCons(cons, needs, scored);
    expect(result).toEqual(["Candidate prefers on-site but the role is remote."]);
  });

  test("no-ops when the recruiter specified no matching preference", () => {
    const scored = scoredWith({ preferredLocation: "Zurich" });
    const needs: RecruiterNeeds = {};
    const cons = ["Located in Zurich."];
    const result = stripSatisfiedPreferenceCons(cons, needs, scored);
    expect(result).toEqual(["Located in Zurich."]);
  });
});
