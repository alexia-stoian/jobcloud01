import { describe, expect, test } from "vitest";
import { computeCompletion } from "@/lib/profile/completion-gate";
import { validateIntentWarnings } from "@/lib/profile/validation";

describe("completion gate", () => {
  test("requires name, location, role, locale and permit", () => {
    const completion = computeCompletion({
      fullName: "Alice",
      preferredLocation: "Zurich",
      primaryRole: "QA Engineer",
      locale: "en",
      workPermitStatus: "B",
      id: "p1",
      userId: "u1",
      currentJobSituation: null,
      employmentObjective: null,
      contractPreference: null,
      workRate: null,
      salaryExpectation: null,
      roleSuggestionsUsed: false,
      isMinimallyComplete: false,
      missingCriticalFields: [],
      lastCompletionCheckAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } as never);

    expect(completion.isMinimallyComplete).toBe(true);
    expect(completion.missingCriticalFields).toHaveLength(0);
  });

  test("fails minimal gate when permit is missing even with salary set", () => {
    const completion = computeCompletion({
      fullName: "Alice",
      preferredLocation: "Zurich",
      primaryRole: "QA Engineer",
      locale: "en",
      workPermitStatus: null,
      salaryExpectation: "120000",
      id: "p1",
      userId: "u1",
      currentJobSituation: null,
      employmentObjective: null,
      contractPreference: null,
      workRate: null,
      roleSuggestionsUsed: false,
      isMinimallyComplete: false,
      missingCriticalFields: [],
      lastCompletionCheckAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } as never);

    expect(completion.isMinimallyComplete).toBe(false);
    expect(completion.missingCriticalFields).toContain("workPermitStatus");
  });

  test("warns softly for missing permit while salary remains optional", () => {
    const warnings = validateIntentWarnings({
      id: "p1",
      userId: "u1",
      locale: "en",
      fullName: "Alice",
      currentJobSituation: null,
      employmentObjective: null,
      primaryRole: "QA Engineer",
      preferredLocation: "Zurich",
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
    } as never);

    expect(warnings).toContain("workPermitStatus is required and currently missing.");
    expect(warnings).toContain("salaryExpectation is optional but recommended.");
  });
});
