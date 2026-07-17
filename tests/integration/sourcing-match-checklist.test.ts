import { describe, expect, test } from "vitest";
import { buildMatchChecklist, scoreCandidate } from "@/lib/sourcing/score";
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

    expect(byLabel["Must-have: React"]).toBe("met");
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
});
