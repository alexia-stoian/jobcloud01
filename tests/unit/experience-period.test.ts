import { describe, expect, test } from "vitest";
import { parseExperiencePeriod, structuredDatesFromPeriod } from "@/lib/profile/experience-period";

describe("parseExperiencePeriod", () => {
  test("splits a closed ISO-ish range and preserves internal dashes", () => {
    expect(parseExperiencePeriod("2017-09 - 2019-06")).toEqual({
      start: "2017-09",
      end: "2019-06",
      isCurrentRole: false
    });
  });

  test("detects an open-ended (present) current role and drops the end token", () => {
    expect(parseExperiencePeriod("2020-01 - Present")).toEqual({
      start: "2020-01",
      end: undefined,
      isCurrentRole: true
    });
  });

  test("handles year-only ranges with an en-dash", () => {
    expect(parseExperiencePeriod("2018 – 2021")).toEqual({
      start: "2018",
      end: "2021",
      isCurrentRole: false
    });
  });

  test("recognises localized/current markers ('to Present', 'en cours')", () => {
    expect(parseExperiencePeriod("2020 to Present").isCurrentRole).toBe(true);
    expect(parseExperiencePeriod("2019 - en cours").isCurrentRole).toBe(true);
  });

  test("an empty period yields no tokens", () => {
    expect(parseExperiencePeriod("")).toEqual({ isCurrentRole: false });
  });
});

describe("structuredDatesFromPeriod", () => {
  test("emits structured start/end dates when years are present", () => {
    expect(structuredDatesFromPeriod("2020-01 - 2023-05")).toEqual({
      startDate: "2020-01",
      endDate: "2023-05",
      isCurrentRole: false
    });
  });

  test("current role keeps the start year and flags isCurrentRole", () => {
    expect(structuredDatesFromPeriod("2022-03 - Present")).toEqual({
      startDate: "2022-03",
      endDate: undefined,
      isCurrentRole: true
    });
  });

  test("year-less free text does not pollute structured date fields", () => {
    expect(structuredDatesFromPeriod("Summer internship")).toEqual({
      startDate: undefined,
      endDate: undefined,
      isCurrentRole: false
    });
  });

  test("a bare 'Present' marks current role without a fabricated start date", () => {
    expect(structuredDatesFromPeriod("Present")).toEqual({
      startDate: undefined,
      endDate: undefined,
      isCurrentRole: true
    });
  });
});
