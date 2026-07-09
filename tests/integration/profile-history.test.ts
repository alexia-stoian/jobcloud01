import { describe, expect, test } from "vitest";
import { buildDiffPreview, requiresExplicitConfirmation } from "@/lib/profile/confirm-policy";
import { parseIntentFromMessage } from "@/lib/profile/intent-parser";

describe("profile history preview", () => {
  test("builds deterministic preview lines", () => {
    const preview = buildDiffPreview([
      {
        field: "primaryRole",
        operation: "set",
        value: "Data Analyst"
      }
    ]);

    expect(preview).toEqual(["primaryRole -> Data Analyst"]);
  });

  test("requires explicit confirmation for high-impact field edits", () => {
    const required = requiresExplicitConfirmation([
      { field: "workPermitStatus", operation: "set", value: "B" }
    ]);
    const notRequired = requiresExplicitConfirmation([
      { field: "currentJobSituation", operation: "set", value: "Open to change" }
    ]);

    expect(required).toBe(true);
    expect(notRequired).toBe(false);
  });

  test("parses qualification add and remove intents", () => {
    const addIntent = parseIntentFromMessage("add certification: ISTQB Advanced");
    const removeIntent = parseIntentFromMessage("remove skill: Selenium");

    expect(addIntent).toEqual({
      field: "qualifications",
      operation: "addItem",
      category: "certification",
      value: "ISTQB Advanced"
    });
    expect(removeIntent).toEqual({
      field: "qualifications",
      operation: "removeItem",
      category: "skill",
      value: "Selenium"
    });
  });
});
