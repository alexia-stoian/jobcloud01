import { describe, expect, test } from "vitest";

describe("onboarding translations", () => {
  test("contains onboarding keys in all locales", async () => {
    const en = (await import("../../messages/en.json")).default;
    const de = (await import("../../messages/de.json")).default;
    const fr = (await import("../../messages/fr.json")).default;

    expect(en.onboarding.title).toBeTruthy();
    expect(de.onboarding.title).toBeTruthy();
    expect(fr.onboarding.title).toBeTruthy();
  });
});
