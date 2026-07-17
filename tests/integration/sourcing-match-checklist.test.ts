import { describe, expect, test } from "vitest";
import { buildMatchChecklist, buildConciseSummary, scoreCandidate } from "@/lib/sourcing/score";
import { seedSignals } from "@/lib/ai/signals/signal-definitions";
import type { CandidateBundle, CandidateLanguage, RecruiterNeeds, ScoredCandidate } from "@/lib/sourcing/types";

function makeBundle(overrides: Partial<CandidateBundle>): CandidateBundle {
  return {
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
      commuteRadius: null
    },
    signals: seedSignals(),
    ...overrides
  };
}

function scored(needs: RecruiterNeeds, bundle: CandidateBundle): ScoredCandidate {
  return scoreCandidate(needs, bundle);
}

describe("buildMatchChecklist", () => {
  test("lists every requirement from the JSON with met/unmet status", () => {
    const lang: CandidateLanguage = { name: "German", levelText: "C1", cefr: "C1" };
    const bundle = makeBundle({
      skills: ["React", "Node.js"],
      estimatedYearsExperience: 6,
      education: [{ title: "BSc Computer Science", school: "ETH" }],
      languageProficiencies: [lang],
      preferences: {
        ...makeBundle({}).preferences,
        preferredLocation: "Zurich",
        preferredWorkModel: "Remote",
        contractPreference: "Permanent"
      }
    });
    const needs: RecruiterNeeds = {
      mustHaveSkills: ["React"],
      requiredSkills: ["Node.js", "Kubernetes"],
      niceToHaveSkills: ["GraphQL"],
      minYearsExperience: 5,
      education: ["Computer Science"],
      languages: ["German B2"],
      location: "Zurich",
      workModel: "Remote",
      contract: "Permanent"
    };

    const checklist = buildMatchChecklist(needs, scored(needs, bundle));
    const byLabel = Object.fromEntries(checklist.map((item) => [item.label, item.status]));

    // Must-have skills are surfaced in the concise summary, NOT the checklist.
    expect(byLabel["Must-have: React"]).toBeUndefined();
    expect(byLabel["Skill: Node.js"]).toBe("met");
    expect(byLabel["Skill: Kubernetes"]).toBe("unmet");
    expect(byLabel["Nice-to-have: GraphQL"]).toBe("unmet");
    expect(byLabel["Experience: 5+ yrs"]).toBe("met");
    expect(byLabel["Education: Computer Science"]).toBe("met");
    expect(byLabel["Language: German B2"]).toBe("met");
    expect(byLabel["Location: Zurich"]).toBe("met");
    expect(byLabel["Work model: Remote"]).toBe("met");
    expect(byLabel["Contract: Permanent"]).toBe("met");
  });

  test("marks a language below the required level as partial", () => {
    const bundle = makeBundle({
      languageProficiencies: [{ name: "German", levelText: "A2", cefr: "A2" }]
    });
    const needs: RecruiterNeeds = { languages: ["German C1"] };
    const checklist = buildMatchChecklist(needs, scored(needs, bundle));
    expect(checklist).toEqual([{ label: "Language: German C1", status: "partial" }]);
  });

  test("marks experience below the minimum as unmet", () => {
    const bundle = makeBundle({ estimatedYearsExperience: 2 });
    const needs: RecruiterNeeds = { minYearsExperience: 5 };
    const checklist = buildMatchChecklist(needs, scored(needs, bundle));
    expect(checklist).toEqual([{ label: "Experience: 5+ yrs", status: "unmet" }]);
  });

  test("omits requirements the recruiter did not specify", () => {
    const bundle = makeBundle({ skills: ["React"] });
    const needs: RecruiterNeeds = { requiredSkills: ["React"] };
    const checklist = buildMatchChecklist(needs, scored(needs, bundle));
    expect(checklist).toEqual([{ label: "Skill: React", status: "met" }]);
  });

  test("location is met when within commute radius despite a different preferred location", () => {
    const bundle = makeBundle({
      preferences: { ...makeBundle({}).preferences, preferredLocation: "Winterthur" }
    });
    const needs: RecruiterNeeds = { location: "Zurich" };
    const withinRadius = buildMatchChecklist(needs, scored(needs, bundle), true);
    const outsideRadius = buildMatchChecklist(needs, scored(needs, bundle), false);
    expect(withinRadius).toEqual([{ label: "Location: Zurich", status: "met" }]);
    expect(outsideRadius).toEqual([{ label: "Location: Zurich", status: "unmet" }]);
  });
});

describe("buildConciseSummary", () => {
  test("highlights met and missing must-have skills", () => {
    const bundle = makeBundle({ skills: ["React", "Node.js"] });
    const needs: RecruiterNeeds = { mustHaveSkills: ["React", "Kubernetes"] };
    const summary = buildConciseSummary(needs, scored(needs, bundle));
    expect(summary).toBe("Has React; missing Kubernetes.");
  });

  test("falls back to required skills when no must-haves are set", () => {
    const bundle = makeBundle({ skills: ["Python"] });
    const needs: RecruiterNeeds = { requiredSkills: ["Python", "SQL"] };
    const summary = buildConciseSummary(needs, scored(needs, bundle));
    expect(summary).toBe("Has Python; missing SQL.");
  });

  test("caps the summary at 50 words", () => {
    const many = Array.from({ length: 60 }, (_, i) => `Skill${i}`);
    const bundle = makeBundle({ skills: [] });
    const needs: RecruiterNeeds = { mustHaveSkills: many };
    const summary = buildConciseSummary(needs, scored(needs, bundle));
    expect(summary.split(/\s+/).length).toBeLessThanOrEqual(50);
    expect(summary.endsWith("…")).toBe(true);
  });

  test("returns empty string when no priority skills are specified", () => {
    const bundle = makeBundle({ skills: ["React"] });
    const needs: RecruiterNeeds = { languages: ["English"] };
    expect(buildConciseSummary(needs, scored(needs, bundle))).toBe("");
  });
});
