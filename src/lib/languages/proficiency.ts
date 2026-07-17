/**
 * Language proficiency normalization + translation.
 *
 * A single language level can be written many ways on a CV: CEFR (A1–C2),
 * descriptive labels (native, fluent, intermediate…), the LinkedIn scale,
 * or standardized test scores (IELTS, TOEFL, TOEIC, Cambridge, TestDaF…).
 *
 * This module recognizes all of those notations and maps them onto ONE
 * canonical scale (CEFR + Native), so the Profile can store a single level and
 * Sourcing can compare a candidate's level against a recruiter's required level
 * regardless of which notation either side used.
 *
 * Pure functions — no I/O — so matching stays deterministic.
 */

/** Canonical proficiency scale. CEFR A1–C2 plus a top "Native" rank. */
export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2" | "Native";

/** Ordinal rank per canonical level (higher = more proficient). */
export const PROFICIENCY_RANK: Record<CefrLevel, number> = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6,
  Native: 7
};

/** All canonical levels, weakest → strongest. */
export const CEFR_LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2", "C1", "C2", "Native"];

/**
 * Ordered descriptive / LinkedIn / multilingual phrases → canonical level.
 * More specific phrases MUST come before the generic ones they contain
 * (e.g. "upper intermediate" before "intermediate").
 */
const PHRASE_TO_LEVEL: Array<{ pattern: RegExp; level: CefrLevel }> = [
  // Native / bilingual (EN / DE / FR / IT / ES).
  { pattern: /native\s*or\s*bilingual|bilingual|native\s*speaker|native|mother\s*tongue|first\s*language|muttersprache|langue\s*maternelle|madrelingua|lengua\s*materna/i, level: "Native" },
  // LinkedIn scale (check before bare descriptive words).
  { pattern: /full\s*professional(\s*proficiency)?/i, level: "C1" },
  { pattern: /professional\s*working(\s*proficiency)?/i, level: "B2" },
  { pattern: /limited\s*working(\s*proficiency)?/i, level: "B1" },
  { pattern: /elementary(\s*proficiency)?/i, level: "A2" },
  // Descriptive labels.
  { pattern: /mastery|proficient|proficiency/i, level: "C2" },
  { pattern: /fluent|fluency|courant|flie(ß|ss)end|corrente/i, level: "C1" },
  { pattern: /advanced|fortgeschritten|avanc(é|e)/i, level: "C1" },
  { pattern: /upper[\s-]*intermediate/i, level: "B2" },
  { pattern: /pre[\s-]*intermediate/i, level: "A2" },
  { pattern: /intermediate|conversational|independent|mittelstufe|interm(é|e)diaire/i, level: "B1" },
  { pattern: /basic|beginner|elementary|d(é|e)butant|grundstufe|grundkenntnisse|anf(ä|ae)nger/i, level: "A1" },
  { pattern: /working\s*knowledge|good\s*command/i, level: "B2" },
  { pattern: /notions|schulkenntnisse/i, level: "A2" }
];

/** Cambridge English exam names → canonical level. */
const CAMBRIDGE_TO_LEVEL: Array<{ pattern: RegExp; level: CefrLevel }> = [
  { pattern: /\bcpe\b|certificate\s*of\s*proficiency/i, level: "C2" },
  { pattern: /\b(cae|advanced)\b/i, level: "C1" },
  { pattern: /\b(fce|first)\b/i, level: "B2" },
  { pattern: /\b(pet|preliminary)\b/i, level: "B1" },
  { pattern: /\b(ket|key)\b/i, level: "A2" }
];

/** Clamp an IELTS overall band (0–9) to a canonical level. */
function ieltsToLevel(band: number): CefrLevel {
  if (band >= 8.5) return "C2";
  if (band >= 7) return "C1";
  if (band >= 5.5) return "B2";
  if (band >= 4) return "B1";
  if (band >= 3) return "A2";
  return "A1";
}

/** Clamp a TOEFL iBT score (0–120) to a canonical level. */
function toeflToLevel(score: number): CefrLevel {
  if (score >= 110) return "C2";
  if (score >= 95) return "C1";
  if (score >= 72) return "B2";
  if (score >= 42) return "B1";
  return "A2";
}

/** Clamp a TOEIC listening+reading score (0–990) to a canonical level. */
function toeicToLevel(score: number): CefrLevel {
  if (score >= 945) return "C1";
  if (score >= 785) return "B2";
  if (score >= 550) return "B1";
  if (score >= 225) return "A2";
  return "A1";
}

/** Map a TestDaF TDN level (3–5) to a canonical level. */
function testDafToLevel(tdn: number): CefrLevel {
  if (tdn >= 5) return "C1";
  if (tdn >= 4) return "B2";
  return "B1";
}

/**
 * Recognize a proficiency expressed in ANY supported notation and return the
 * canonical level, or `null` when nothing recognizable is present.
 */
export function normalizeProficiency(input: string | null | undefined): CefrLevel | null {
  if (typeof input !== "string") {
    return null;
  }
  const text = input.trim();
  if (text.length === 0) {
    return null;
  }

  // 1. Standardized test scores (checked first so a number isn't mis-read).
  const ielts = text.match(/ielts[^\d]*(\d(?:\.\d)?)/i);
  if (ielts) {
    return ieltsToLevel(parseFloat(ielts[1]));
  }
  const toefl = text.match(/toefl[^\d]*(\d{2,3})/i);
  if (toefl) {
    return toeflToLevel(parseInt(toefl[1], 10));
  }
  const toeic = text.match(/toeic[^\d]*(\d{2,3})/i);
  if (toeic) {
    return toeicToLevel(parseInt(toeic[1], 10));
  }
  const testDaf = text.match(/testdaf[^\d]*(?:tdn)?[^\d]*([3-5])/i);
  if (testDaf) {
    return testDafToLevel(parseInt(testDaf[1], 10));
  }

  // 2. Direct CEFR token (also handles "B2.1", "C1+", "Level: C1").
  const cefr = text.match(/\b([ABC])\s*([12])\b/i);
  if (cefr) {
    const level = `${cefr[1].toUpperCase()}${cefr[2]}` as CefrLevel;
    if (level in PROFICIENCY_RANK) {
      return level;
    }
  }

  // 3. Descriptive / LinkedIn / multilingual phrases (before exam names so a
  //    LinkedIn "...proficiency" label isn't mistaken for the Cambridge exam).
  for (const { pattern, level } of PHRASE_TO_LEVEL) {
    if (pattern.test(text)) {
      return level;
    }
  }

  // 4. Cambridge English exam names.
  for (const { pattern, level } of CAMBRIDGE_TO_LEVEL) {
    if (pattern.test(text)) {
      return level;
    }
  }

  return null;
}

/** A canonical level rendered in the three most common notations. */
export interface ProficiencyTranslation {
  cefr: CefrLevel;
  /** Plain-language descriptive label (US/UK style). */
  descriptive: string;
  /** LinkedIn proficiency-scale label. */
  linkedin: string;
}

const DESCRIPTIVE_LABEL: Record<CefrLevel, string> = {
  A1: "Beginner",
  A2: "Elementary",
  B1: "Intermediate",
  B2: "Upper-intermediate",
  C1: "Advanced / Fluent",
  C2: "Proficient",
  Native: "Native"
};

const LINKEDIN_LABEL: Record<CefrLevel, string> = {
  A1: "Elementary proficiency",
  A2: "Elementary proficiency",
  B1: "Limited working proficiency",
  B2: "Professional working proficiency",
  C1: "Full professional proficiency",
  C2: "Full professional proficiency",
  Native: "Native or bilingual proficiency"
};

/** Translate a canonical level into CEFR + descriptive + LinkedIn notations. */
export function translateProficiency(level: CefrLevel): ProficiencyTranslation {
  return {
    cefr: level,
    descriptive: DESCRIPTIVE_LABEL[level],
    linkedin: LINKEDIN_LABEL[level]
  };
}

/**
 * Human-readable label for a raw proficiency string. When it maps to a canonical
 * level, returns e.g. `"C1 (Advanced / Fluent)"`; otherwise returns the trimmed
 * original so nothing the candidate typed is silently lost.
 */
export function formatProficiency(input: string | null | undefined): string {
  const level = normalizeProficiency(input);
  if (level) {
    return level === "Native" ? "Native" : `${level} (${DESCRIPTIVE_LABEL[level]})`;
  }
  return typeof input === "string" ? input.trim() : "";
}

/**
 * Whether a candidate's proficiency meets (>=) a required proficiency.
 *
 * - If the requirement has no recognizable level, only the language name needs
 *   to match (handled by the caller) — this returns `true`.
 * - If the candidate has no recognizable level but the requirement does, the
 *   candidate cannot be confirmed to meet it → `false`.
 */
export function meetsRequirement(
  candidate: string | null | undefined,
  required: string | null | undefined
): boolean {
  const requiredLevel = normalizeProficiency(required);
  if (!requiredLevel) {
    return true;
  }
  const candidateLevel = normalizeProficiency(candidate);
  if (!candidateLevel) {
    return false;
  }
  return PROFICIENCY_RANK[candidateLevel] >= PROFICIENCY_RANK[requiredLevel];
}

/** A language split into its name and (optional) proficiency parts. */
export interface ParsedLanguage {
  name: string;
  /** The raw level text as written, or `null` when none was present. */
  levelText: string | null;
  /** The canonical level, or `null` when unrecognizable / absent. */
  cefr: CefrLevel | null;
}

/**
 * Split a combined language string (e.g. `"English C1"`, `"German — Fluent"`,
 * `"French (native)"`, `"Spanish: B2"`) into a clean language name and its
 * proficiency. Used to parse recruiter requirements written as free text.
 */
export function parseLanguageString(raw: string): ParsedLanguage {
  const input = raw.trim();

  // Pull any parenthesized level out first: "French (native)".
  let levelText = "";
  const paren = input.match(/\(([^)]*)\)/);
  let base = input;
  if (paren) {
    levelText = paren[1].trim();
    base = input.replace(/\([^)]*\)/g, " ").trim();
  }

  // Split on an explicit separator: "German — Fluent", "Spanish: B2".
  const separated = base.split(/\s*[—–:|/]\s*|\s+[-]\s+/);
  if (separated.length > 1) {
    const name = separated[0].trim();
    levelText = [separated.slice(1).join(" ").trim(), levelText].filter(Boolean).join(" ").trim();
    return { name, levelText: levelText || null, cefr: normalizeProficiency(levelText) };
  }

  // No explicit separator — look for a trailing level token: "English C1".
  if (!levelText) {
    const tokens = base.split(/\s+/);
    for (let i = 1; i < tokens.length; i += 1) {
      const tail = tokens.slice(i).join(" ");
      if (normalizeProficiency(tail)) {
        return {
          name: tokens.slice(0, i).join(" ").trim(),
          levelText: tail,
          cefr: normalizeProficiency(tail)
        };
      }
    }
    return { name: base, levelText: null, cefr: null };
  }

  return { name: base, levelText: levelText || null, cefr: normalizeProficiency(levelText) };
}
