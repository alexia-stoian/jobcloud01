import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Mock ONLY the Anthropic network call. `parseLlmJson` stays REAL so these tests
// also exercise the fence-tolerant JSON salvage path end-to-end.
const callAnthropic = vi.fn();
vi.mock("@/lib/sourcing/anthropic", async () => {
  const actual = await vi.importActual<typeof import("@/lib/sourcing/anthropic")>(
    "@/lib/sourcing/anthropic"
  );
  return {
    ...actual,
    callAnthropic: (prompt: string, maxTokens: number) => callAnthropic(prompt, maxTokens)
  };
});

import { classifySectorAndGenerateFields } from "@/lib/onboarding/sector-fields";
import type { SectorFieldSet } from "@/lib/onboarding/sector-fields";

/**
 * Wave 0 shared fixture: build a raw model response string for a non-engineer
 * sector. Optionally wrap in a ```json fence to prove fence tolerance.
 */
function makeSectorFixture(
  overrides?: Partial<{
    sector: string;
    usesDefaultFields: boolean;
    fields: Array<{
      key: string;
      label: string;
      question: string;
      options: Array<{ value: string; label: string }>;
    }>;
    fenced: boolean;
  }>
): string {
  const payload = {
    sector: overrides?.sector ?? "education",
    usesDefaultFields: overrides?.usesDefaultFields ?? false,
    fields:
      overrides?.fields ??
      [
        {
          key: "teaching_level",
          label: "Niveau d'enseignement",
          question: "À quel niveau aimes-tu enseigner ? 🍎",
          options: [
            { value: "primaire", label: "École primaire 🎒" },
            { value: "secondaire", label: "Lycée 📚" },
            { value: "superieur", label: "Université 🎓" }
          ]
        },
        {
          key: "subject_area",
          label: "Matière préférée",
          question: "Quelle matière te fait vibrer ? ✨",
          options: [
            { value: "maths", label: "Mathématiques ➗" },
            { value: "sciences", label: "Sciences 🔬" }
          ]
        }
      ]
  };
  const json = JSON.stringify(payload);
  return overrides?.fenced ? "```json\n" + json + "\n```" : json;
}

describe("classifySectorAndGenerateFields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Case 1 — valid teacher fixture in "fr": sector set, <=3 fields, French copy preserved.
  test("returns a localized SectorFieldSet with fields when the model classifies a sector", async () => {
    callAnthropic.mockResolvedValueOnce(makeSectorFixture({ fenced: true }));

    const result = (await classifySectorAndGenerateFields({
      targetRole: "Math teacher",
      locale: "fr"
    })) as SectorFieldSet;

    expect(callAnthropic).toHaveBeenCalledTimes(1);
    expect(result).not.toBeNull();
    expect(result.sector).toBe("education");
    expect(result.usesDefaultFields).toBe(false);
    expect(result.generatedLocale).toBe("fr");
    expect(result.fields.length).toBeGreaterThanOrEqual(1);
    expect(result.fields.length).toBeLessThanOrEqual(3);
    // French copy is passed through verbatim (not machine-translated locally).
    expect(result.fields[0].label).toBe("Niveau d'enseignement");
    expect(result.fields[0].question).toContain("enseigner");
    expect(result.fields[0].options.length).toBeGreaterThan(0);
    expect(result.fields[0].options[0].label).toContain("École primaire");
    // Value is seeded empty at generation time.
    expect(result.fields[0].value).toBe("");
  });

  // Case 2 — engineering fixture short-circuits: usesDefaultFields=true, no fields.
  test("engineer/software role short-circuits to usesDefaultFields with zero fields", async () => {
    callAnthropic.mockResolvedValueOnce(
      makeSectorFixture({
        sector: "software",
        usesDefaultFields: true,
        fields: [
          {
            key: "should_be_dropped",
            label: "Ignored",
            question: "Ignored?",
            options: [{ value: "x", label: "x" }]
          }
        ]
      })
    );

    const result = (await classifySectorAndGenerateFields({
      targetRole: "Backend Software Engineer",
      locale: "en"
    })) as SectorFieldSet;

    expect(result).not.toBeNull();
    expect(result.usesDefaultFields).toBe(true);
    expect(result.fields.length).toBe(0);
    expect(result.generatedLocale).toBe("en");
  });

  // Case 3 — callAnthropic resolves null (D-02) → function returns null, no throw.
  test("returns null when callAnthropic returns null (graceful degradation)", async () => {
    callAnthropic.mockResolvedValueOnce(null);

    const result = await classifySectorAndGenerateFields({
      targetRole: "Nurse",
      locale: "de"
    });

    expect(result).toBeNull();
  });

  // Case 4 — junk / non-JSON raw → parseLlmJson null → function returns null, no throw.
  test("returns null when the model returns unparseable junk", async () => {
    callAnthropic.mockResolvedValueOnce("Sorry, I cannot help with that. <<<not json>>>");

    const result = await classifySectorAndGenerateFields({
      targetRole: "Firefighter",
      locale: "en"
    });

    expect(result).toBeNull();
  });

  // Case 5 — fixture with 6 fields → normalizer clamps to exactly 3 (D-04).
  test("clamps the number of fields to at most 3", async () => {
    const sixFields = Array.from({ length: 6 }, (_, i) => ({
      key: `field_${i}`,
      label: `Label ${i}`,
      question: `Question ${i}? 🎉`,
      options: [
        { value: `a_${i}`, label: `Option A ${i}` },
        { value: `b_${i}`, label: `Option B ${i}` }
      ]
    }));
    callAnthropic.mockResolvedValueOnce(
      makeSectorFixture({ sector: "marketing", fields: sixFields })
    );

    const result = (await classifySectorAndGenerateFields({
      targetRole: "Marketing Manager",
      locale: "en"
    })) as SectorFieldSet;

    expect(result).not.toBeNull();
    expect(result.fields.length).toBe(3);
  });

  // Case 6 — control chars / backticks in a label are sanitized in the output (V5).
  test("strips control characters and backticks from model strings", async () => {
    callAnthropic.mockResolvedValueOnce(
      makeSectorFixture({
        sector: "hospitality",
        fields: [
          {
            key: "Shift Type!!",
            label: "Shift `type`\tpreference",
            question: "Which shifts do you love? 🌙",
            options: [{ value: "Night Owl", label: "Nights `only`" }]
          }
        ]
      })
    );

    const result = (await classifySectorAndGenerateFields({
      targetRole: "Hotel Receptionist",
      locale: "en"
    })) as SectorFieldSet;

    expect(result).not.toBeNull();
    const field = result.fields[0];
    // No backticks anywhere in the sanitized output.
    expect(field.label).not.toContain("`");
    expect(field.options[0].label).not.toContain("`");
    // No control characters (tabs, newlines) survive.
    expect(field.label).not.toMatch(/[\u0000-\u001F]/);
    // Key is slugged to [a-z0-9_].
    expect(field.key).toMatch(/^[a-z0-9_]+$/);
    // Option value is slugged too.
    expect(field.options[0].value).toMatch(/^[a-z0-9_]+$/);
  });
});
