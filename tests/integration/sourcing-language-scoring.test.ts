import { describe, expect, test } from "vitest";
import { scoreCandidate } from "@/lib/sourcing/score";
import { seedSignals } from "@/lib/ai/signals/signal-definitions";
import type { CandidateBundle, CandidateLanguage } from "@/lib/sourcing/types";

function bundleWith(languageProficiencies: CandidateLanguage[]): CandidateBundle {
  return {
    userId: "u1",
    name: "Test",
    primaryRole: null,
    skills: [],
    languages: languageProficiencies.map((l) => l.name),
    languageProficiencies,
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
      commuteRadius: null
    },
    signals: seedSignals()
  };
}

describe("level-aware language scoring", () => {
  test("full credit when candidate meets the required level", () => {
    const bundle = bundleWith([{ name: "German", levelText: "C1", cefr: "C1" }]);
    const result = scoreCandidate({ languages: ["German B2"] }, bundle);
    expect(result.breakdown.languages).toBe(1);
  });

  test("half credit when the language is present but below the required level", () => {
    const bundle = bundleWith([{ name: "German", levelText: "B1", cefr: "B1" }]);
    const result = scoreCandidate({ languages: ["German C1"] }, bundle);
    expect(result.breakdown.languages).toBe(0.5);
  });

  test("no credit when the language is missing", () => {
    const bundle = bundleWith([{ name: "French", levelText: "C2", cefr: "C2" }]);
    const result = scoreCandidate({ languages: ["German B2"] }, bundle);
    expect(result.breakdown.languages).toBe(0);
  });

  test("name-only requirement ignores the level", () => {
    const bundle = bundleWith([{ name: "English", levelText: null, cefr: null }]);
    const result = scoreCandidate({ languages: ["English"] }, bundle);
    expect(result.breakdown.languages).toBe(1);
  });

  test("descriptive candidate level is normalized for comparison", () => {
    const bundle = bundleWith([{ name: "English", levelText: "Fluent", cefr: "C1" }]);
    const result = scoreCandidate({ languages: ["English B2"] }, bundle);
    expect(result.breakdown.languages).toBe(1);
  });
});
