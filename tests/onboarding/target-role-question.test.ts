import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// The mock fn is created via vi.hoisted so it exists when the hoisted vi.mock
// factory below runs.
const { callAnthropic } = vi.hoisted(() => ({ callAnthropic: vi.fn() }));

// Mock @/lib/env so importing the real anthropic module does not trigger Zod
// validation of unrelated server env vars (DATABASE_URL/AUTH_SECRET) in tests.
vi.mock("@/lib/env", () => ({
  env: {
    ANTHROPIC_API_KEY: "test-key",
    ANTHROPIC_MODEL: "claude-test"
  }
}));

// Mock ONLY the Anthropic network call. `parseLlmJson` stays REAL so these tests
// also exercise the fence-tolerant JSON salvage path end-to-end.
vi.mock("@/lib/sourcing/anthropic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sourcing/anthropic")>();
  return {
    ...actual,
    callAnthropic
  };
});

import {
  generateTargetRoleQuestion,
  getTargetRoleQuestion
} from "@/lib/onboarding/detect-target-role";

/** Build a raw model response for the CV-tailored role MCQ, optionally fenced. */
function makeRoleFixture(
  overrides?: Partial<{
    prompt: string;
    options: Array<{ value: string; label: string }>;
    fenced: boolean;
  }>
): string {
  const payload = {
    prompt: overrides?.prompt ?? "D'après ton CV, quel poste vises-tu ? 🎯",
    options:
      overrides?.options ??
      [
        { value: "high_school_teacher", label: "Enseignant au lycée 🍎" },
        { value: "university_lecturer", label: "Maître de conférences 🎓" },
        { value: "private_tutor", label: "Tuteur privé ✏️" }
      ]
  };
  const json = JSON.stringify(payload);
  return overrides?.fenced ? "```json\n" + json + "\n```" : json;
}

describe("generateTargetRoleQuestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Branch 1 — no CV facts: open-ended static question, NO options, NO LLM call.
  test("returns the open-ended static question when no CV facts are present", async () => {
    const result = await generateTargetRoleQuestion({ locale: "en", cvFacts: null });

    expect(callAnthropic).not.toHaveBeenCalled();
    expect(result.allowCustom).toBe(true);
    expect(result.options).toBeUndefined();
    expect(result.prompt).toBe(getTargetRoleQuestion("en"));
  });

  test("treats an empty CV facts object as open-ended (no LLM call)", async () => {
    const result = await generateTargetRoleQuestion({ locale: "de", cvFacts: {} });

    expect(callAnthropic).not.toHaveBeenCalled();
    expect(result.options).toBeUndefined();
    expect(result.prompt).toBe(getTargetRoleQuestion("de"));
  });

  // Branch 2 — CV facts present + model returns options: localized MCQ.
  test("returns a CV-tailored localized MCQ when CV facts are present", async () => {
    callAnthropic.mockResolvedValueOnce(makeRoleFixture({ fenced: true }));

    const result = await generateTargetRoleQuestion({
      locale: "fr",
      cvFacts: { headline: "Math teacher", experience: ["Lycée Voltaire"] }
    });

    expect(callAnthropic).toHaveBeenCalledTimes(1);
    expect(result.allowCustom).toBe(true);
    expect(result.prompt).toContain("CV");
    expect(result.options).toBeDefined();
    expect(result.options!.length).toBeGreaterThanOrEqual(2);
    expect(result.options!.length).toBeLessThanOrEqual(5);
    // Localized copy passes through verbatim (not translated locally).
    expect(result.options![0].label).toContain("Enseignant au lycée");
  });

  // Branch 3 — CV facts present but model returns null: fall back to open-ended.
  test("falls back to the open-ended question when the model returns null", async () => {
    callAnthropic.mockResolvedValueOnce(null);

    const result = await generateTargetRoleQuestion({
      locale: "en",
      cvFacts: { headline: "Math teacher" }
    });

    expect(callAnthropic).toHaveBeenCalledTimes(1);
    expect(result.options).toBeUndefined();
    expect(result.prompt).toBe(getTargetRoleQuestion("en"));
  });

  test("falls back to the open-ended question when the model returns junk JSON", async () => {
    callAnthropic.mockResolvedValueOnce("not json at all <<<");

    const result = await generateTargetRoleQuestion({
      locale: "en",
      cvFacts: { headline: "Math teacher" }
    });

    expect(result.options).toBeUndefined();
    expect(result.prompt).toBe(getTargetRoleQuestion("en"));
  });

  // Sanitization + clamping of untrusted model strings (V5).
  test("sanitizes and clamps option labels and caps options at 5", async () => {
    const longLabel = "A".repeat(400);
    callAnthropic.mockResolvedValueOnce(
      makeRoleFixture({
        prompt: "Cheerful\u0000 prompt`with`junk 🎯",
        options: [
          { value: "one", label: "Line1\nLine2\ttabbed `code`" },
          { value: "two", label: longLabel },
          { value: "three", label: "High school teacher" },
          { value: "four", label: "University lecturer" },
          { value: "five", label: "Tutor" },
          { value: "six", label: "Extra option that should be dropped" }
        ]
      })
    );

    const result = await generateTargetRoleQuestion({
      locale: "en",
      cvFacts: { headline: "Math teacher" }
    });

    expect(result.options).toBeDefined();
    // 6 options in, capped to 5.
    expect(result.options!.length).toBe(5);
    // Control chars and backticks stripped from prompt.
    expect(result.prompt).not.toMatch(/[\u0000-\u001F]/);
    expect(result.prompt).not.toContain("`");
    // Control chars stripped and label clamped.
    const firstLabel = result.options![0].label;
    expect(firstLabel).not.toMatch(/[\u0000-\u001F]/);
    expect(firstLabel).not.toContain("`");
    expect(result.options![1].label.length).toBeLessThanOrEqual(120);
  });

  test("falls back to open-ended when the model returns zero usable options", async () => {
    callAnthropic.mockResolvedValueOnce(
      JSON.stringify({ prompt: "Hi", options: [{ value: "", label: "" }] })
    );

    const result = await generateTargetRoleQuestion({
      locale: "en",
      cvFacts: { headline: "Math teacher" }
    });

    expect(result.options).toBeUndefined();
    expect(result.prompt).toBe(getTargetRoleQuestion("en"));
  });
});
