import { describe, expect, test } from "vitest";
import { isSupportedLocale } from "@/i18n/config";

describe("locale config", () => {
  test("supports en/de/fr only", () => {
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("de")).toBe(true);
    expect(isSupportedLocale("fr")).toBe(true);
    expect(isSupportedLocale("it")).toBe(false);
  });
});
