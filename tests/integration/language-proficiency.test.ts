import { describe, expect, test } from "vitest";
import {
  formatProficiency,
  meetsRequirement,
  normalizeProficiency,
  parseLanguageString,
  translateProficiency
} from "@/lib/languages/proficiency";

describe("language proficiency normalization", () => {
  test("recognizes direct CEFR tokens in various shapes", () => {
    expect(normalizeProficiency("C1")).toBe("C1");
    expect(normalizeProficiency("b2")).toBe("B2");
    expect(normalizeProficiency("Level: C1")).toBe("C1");
    expect(normalizeProficiency("B2.1")).toBe("B2");
    expect(normalizeProficiency("A 2")).toBe("A2");
  });

  test("recognizes native / bilingual labels across languages", () => {
    expect(normalizeProficiency("Native")).toBe("Native");
    expect(normalizeProficiency("mother tongue")).toBe("Native");
    expect(normalizeProficiency("Bilingual")).toBe("Native");
    expect(normalizeProficiency("Muttersprache")).toBe("Native");
    expect(normalizeProficiency("langue maternelle")).toBe("Native");
  });

  test("recognizes descriptive labels", () => {
    expect(normalizeProficiency("Fluent")).toBe("C1");
    expect(normalizeProficiency("Advanced")).toBe("C1");
    expect(normalizeProficiency("Upper-intermediate")).toBe("B2");
    expect(normalizeProficiency("Intermediate")).toBe("B1");
    expect(normalizeProficiency("Conversational")).toBe("B1");
    expect(normalizeProficiency("Elementary")).toBe("A2");
    expect(normalizeProficiency("Beginner")).toBe("A1");
    expect(normalizeProficiency("Expert")).toBe("C2");
  });

  test("recognizes the LinkedIn proficiency scale", () => {
    expect(normalizeProficiency("Native or bilingual proficiency")).toBe("Native");
    expect(normalizeProficiency("Full professional proficiency")).toBe("C1");
    expect(normalizeProficiency("Professional working proficiency")).toBe("B2");
    expect(normalizeProficiency("Limited working proficiency")).toBe("B1");
    expect(normalizeProficiency("Elementary proficiency")).toBe("A2");
  });

  test("recognizes standardized test scores", () => {
    expect(normalizeProficiency("IELTS 7.5")).toBe("C1");
    expect(normalizeProficiency("IELTS 6.0")).toBe("B2");
    expect(normalizeProficiency("TOEFL 105")).toBe("C1");
    expect(normalizeProficiency("TOEIC 800")).toBe("B2");
    expect(normalizeProficiency("Cambridge CAE")).toBe("C1");
    expect(normalizeProficiency("TestDaF TDN 4")).toBe("B2");
  });

  test("recognizes exam names that embed a CEFR level", () => {
    expect(normalizeProficiency("DELF B2")).toBe("B2");
    expect(normalizeProficiency("Goethe-Zertifikat C1")).toBe("C1");
    expect(normalizeProficiency("DALF C1")).toBe("C1");
  });

  test("returns null for unrecognizable input", () => {
    expect(normalizeProficiency("")).toBeNull();
    expect(normalizeProficiency("banana")).toBeNull();
    expect(normalizeProficiency(null)).toBeNull();
  });
});

describe("proficiency translation + formatting", () => {
  test("translates a canonical level into the three common notations", () => {
    const t = translateProficiency("B2");
    expect(t.cefr).toBe("B2");
    expect(t.descriptive).toBe("Upper-intermediate");
    expect(t.linkedin).toBe("Professional working proficiency");
  });

  test("formats a recognized level and preserves unknown input", () => {
    expect(formatProficiency("fluent")).toBe("C1 (Advanced / Fluent)");
    expect(formatProficiency("Native")).toBe("Native");
    expect(formatProficiency("banana")).toBe("banana");
  });
});

describe("requirement comparison", () => {
  test("candidate meets or exceeds required level", () => {
    expect(meetsRequirement("C1", "B2")).toBe(true);
    expect(meetsRequirement("Native", "C2")).toBe(true);
    expect(meetsRequirement("Fluent", "Professional working proficiency")).toBe(true);
  });

  test("candidate below required level fails", () => {
    expect(meetsRequirement("B1", "C1")).toBe(false);
    expect(meetsRequirement("Intermediate", "Fluent")).toBe(false);
  });

  test("no required level only needs the language present", () => {
    expect(meetsRequirement("A1", "")).toBe(true);
    expect(meetsRequirement(null, null)).toBe(true);
  });

  test("required level with unknown candidate level cannot be confirmed", () => {
    expect(meetsRequirement(null, "C1")).toBe(false);
    expect(meetsRequirement("banana", "B2")).toBe(false);
  });
});

describe("parseLanguageString", () => {
  test("splits combined name + level notations", () => {
    expect(parseLanguageString("English C1")).toMatchObject({ name: "English", cefr: "C1" });
    expect(parseLanguageString("German — Fluent")).toMatchObject({ name: "German", cefr: "C1" });
    expect(parseLanguageString("French (native)")).toMatchObject({ name: "French", cefr: "Native" });
    expect(parseLanguageString("Spanish: B2")).toMatchObject({ name: "Spanish", cefr: "B2" });
  });

  test("returns name only when no level is present", () => {
    expect(parseLanguageString("Italian")).toMatchObject({ name: "Italian", cefr: null });
  });
});
