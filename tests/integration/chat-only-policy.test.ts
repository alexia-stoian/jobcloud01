import { describe, expect, test } from "vitest";

function canApplyPatchFromSource(source: string | null): boolean {
  return source === "chat_confirmed" || source === "system_revert";
}

describe("chat-only edit policy", () => {
  test("rejects non-chat write sources", () => {
    expect(canApplyPatchFromSource(null)).toBe(false);
    expect(canApplyPatchFromSource("direct_form")).toBe(false);
    expect(canApplyPatchFromSource("script")).toBe(false);
  });

  test("accepts confirmed chat and system revert sources", () => {
    expect(canApplyPatchFromSource("chat_confirmed")).toBe(true);
    expect(canApplyPatchFromSource("system_revert")).toBe(true);
  });
});
