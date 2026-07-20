import { describe, expect, test } from "vitest";
import { rescoreFromAnswers } from "./rescore";

describe("rescoreFromAnswers — visible-increase clamp", () => {
  // r1: a good answer must yield a visible increase even when the LLM lowballs.
  test("floors to fitBefore + max(1, goodAnswers) when the LLM undershoots", () => {
    expect(rescoreFromAnswers({ fitBefore: 60, goodAnswers: 3, llmAfter: 50 })).toBe(63);
    // A single good answer still bumps by at least 1.
    expect(rescoreFromAnswers({ fitBefore: 72, goodAnswers: 1, llmAfter: 40 })).toBe(73);
    // Never below the visible floor.
    const out = rescoreFromAnswers({ fitBefore: 60, goodAnswers: 3, llmAfter: 50 });
    expect(out).toBeGreaterThanOrEqual(60 + Math.max(1, 3));
  });

  // r2: no good answers → no visible change.
  test("returns fitBefore unchanged when goodAnswers is 0", () => {
    expect(rescoreFromAnswers({ fitBefore: 70, goodAnswers: 0, llmAfter: 90 })).toBe(70);
    // Even a lower LLM value cannot drop the score when nothing landed.
    expect(rescoreFromAnswers({ fitBefore: 55, goodAnswers: 0, llmAfter: 20 })).toBe(55);
  });

  // r3: capped at 100, and an LLM value above the floor is preserved.
  test("caps at 100 and preserves an LLM value above the floor", () => {
    expect(rescoreFromAnswers({ fitBefore: 98, goodAnswers: 5, llmAfter: 100 })).toBe(100);
    // Floor would be min(100, 98 + 5) = 100, so even a huge LLM value stays 100.
    expect(rescoreFromAnswers({ fitBefore: 98, goodAnswers: 5, llmAfter: 120 })).toBe(100);
    // LLM proposes higher than the floor → preserved.
    expect(rescoreFromAnswers({ fitBefore: 50, goodAnswers: 1, llmAfter: 80 })).toBe(80);
  });
});
