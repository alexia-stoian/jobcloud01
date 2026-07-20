// Import the env side-effect FIRST so `@/lib/env` validates at import time
// (anthropic.ts imports it). This mirrors the tests/integration/_setup-env pattern.
import "../../../tests/integration/_setup-env";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { generateGapQuestions, stripPublicOptions } from "./questions";
import type { RecruiterNeeds, SourcingResult } from "./types";

/** Build a SourcingResult with a mixed met/partial/unmet checklist. */
function makeResult(): SourcingResult {
  return {
    userId: "cand-1",
    name: "Ada Lovelace",
    fitPercent: 65,
    whyFit: "",
    bestSkills: [],
    pros: [],
    cons: [],
    verdict: "consider",
    recommendation: "",
    summary: "",
    checklist: [
      { label: "Skill: React", status: "met" },
      { label: "Skill: Kubernetes", status: "unmet" },
      { label: "Language: German B2", status: "partial" }
    ]
  };
}

const NEEDS: RecruiterNeeds = { role: "Senior Engineer" };

/** An Anthropic-style OK response wrapping the given JSON text. */
function anthropicOk(jsonText: string): Response {
  return {
    ok: true,
    json: async () => ({ content: [{ type: "text", text: jsonText }] })
  } as unknown as Response;
}

/** A well-formed 2-question generation payload (four options each, one correct). */
const LLM_PAYLOAD = JSON.stringify({
  questions: [
    {
      gapLabel: "Skill: Kubernetes",
      prompt: "How would you describe your hands-on Kubernetes experience?",
      options: [
        { label: "I run production clusters daily", isCorrect: true },
        { label: "I have only read about it", isCorrect: false },
        { label: "I prefer bare-metal servers", isCorrect: false },
        { label: "I use Docker Swarm instead", isCorrect: false }
      ],
      allowOpen: true
    },
    {
      gapLabel: "Language: German B2",
      prompt: "What is your German proficiency?",
      options: [
        { label: "Fluent, C1+", isCorrect: true },
        { label: "A1 basics", isCorrect: false },
        { label: "None", isCorrect: false },
        { label: "Only written", isCorrect: false }
      ],
      allowOpen: true
    }
  ]
});

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ANTHROPIC_MODEL = "claude-test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("generateGapQuestions — gap filter", () => {
  // u1: gaps derive ONLY from checklist items with status !== "met".
  test("a met checklist item never becomes a question gap", async () => {
    let capturedPrompt = "";
    const fetchMock = vi.fn(async (_url: unknown, init: RequestInit | undefined) => {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      capturedPrompt = body?.messages?.[0]?.content ?? "";
      return anthropicOk(LLM_PAYLOAD);
    });
    vi.stubGlobal("fetch", fetchMock);

    await generateGapQuestions(NEEDS, makeResult());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The unmet + partial gaps are grounded in the prompt; the met one is not.
    expect(capturedPrompt).toContain("Skill: Kubernetes");
    expect(capturedPrompt).toContain("Language: German B2");
    expect(capturedPrompt).not.toContain("Skill: React");
  });
});

describe("generateGapQuestions — shape + option stripping", () => {
  // u2: each question has exactly 5 options (1 correct, 3 distractors, 1 open),
  // and stripPublicOptions removes all server-only correctness fields.
  test("produces 5-option MCQs and strips correctness for delivery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => anthropicOk(LLM_PAYLOAD))
    );

    const questions = await generateGapQuestions(NEEDS, makeResult());
    expect(questions.length).toBe(2);

    for (const q of questions) {
      expect(q.options).toHaveLength(5);
      expect(q.options.filter((o) => o.isCorrect)).toHaveLength(1);
      expect(q.options.filter((o) => o.isOpen)).toHaveLength(1);
      // The open option is never the correct one.
      const open = q.options.find((o) => o.isOpen);
      expect(open?.isCorrect).toBe(false);
      // Three non-open distractors.
      expect(q.options.filter((o) => !o.isOpen && !o.isCorrect)).toHaveLength(3);
      expect(q.allowCustom).toBe(true);

      const publicShape = stripPublicOptions(q);
      const serialized = JSON.stringify(publicShape);
      expect(serialized).not.toContain("isCorrect");
      expect(serialized).not.toContain("isOpen");
      expect(serialized).not.toContain("gapLabel");
      expect(publicShape.options).toHaveLength(5);
    }
  });
});

describe("generateGapQuestions — graceful degradation", () => {
  // u3: no key or a non-ok response yields [] (no questions generated).
  test("returns [] when the API key is absent", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = vi.fn(async () => anthropicOk(LLM_PAYLOAD));
    vi.stubGlobal("fetch", fetchMock);

    const questions = await generateGapQuestions(NEEDS, makeResult());
    expect(questions).toEqual([]);
    // Never even reaches the network without a key.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("returns [] when the response is non-ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}) }) as unknown as Response)
    );

    const questions = await generateGapQuestions(NEEDS, makeResult());
    expect(questions).toEqual([]);
  });

  test("returns [] when there are no gaps (all met)", async () => {
    const fetchMock = vi.fn(async () => anthropicOk(LLM_PAYLOAD));
    vi.stubGlobal("fetch", fetchMock);

    const allMet = makeResult();
    allMet.checklist = [
      { label: "Skill: React", status: "met" },
      { label: "Skill: Node", status: "met" }
    ];

    const questions = await generateGapQuestions(NEEDS, allMet);
    expect(questions).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
