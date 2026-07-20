/**
 * Shared onboarding test fixtures (Phase 12, Plan 12-4 — review concern B).
 *
 * Keeping these helpers in a NON-test module means importing them from a
 * `*.test.ts` file never re-executes another suite's `describe` blocks. Both
 * `sector-fields.test.ts` and `sector-flow.integration.test.ts` import from here.
 */

/** One raw (pre-persist) sector field, as the model would emit it. */
export type RawSectorField = {
  key: string;
  label: string;
  question: string;
  options: Array<{ value: string; label: string }>;
};

/** One persisted sector field (post-normalization), including its answer value. */
export type StoredSectorField = RawSectorField & { value: string };

/** The persisted `sectorPreferences` shape written by Plan 12-1/12-2. */
export type StoredSectorPreferences = {
  sector: string;
  generatedLocale: string;
  generatedForRole: string;
  fields: StoredSectorField[];
};

/**
 * Build a raw model response STRING for a non-engineer sector (default: a French
 * teacher fixture). Optionally wrap in a ```json fence to prove fence tolerance.
 * This is the exact fixture Plan 12-1's unit tests rely on — do not change the
 * default shape without updating `sector-fields.test.ts`.
 */
export function makeSectorFixture(
  overrides?: Partial<{
    sector: string;
    usesDefaultFields: boolean;
    fields: RawSectorField[];
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

/**
 * Build a fully-localized, non-engineer sector fixture for a given locale as a
 * raw model response string. Used by the full-loop locale matrix (EN/DE/FR) so
 * each locale round-trips a distinct, recognizable label.
 */
export function makeLocalizedSectorFixture(locale: "en" | "de" | "fr"): string {
  const byLocale: Record<"en" | "de" | "fr", RawSectorField> = {
    en: {
      key: "teaching_level",
      label: "Teaching level",
      question: "Which level do you love teaching? 🍎",
      options: [
        { value: "primary", label: "Primary school 🎒" },
        { value: "secondary", label: "High school 📚" }
      ]
    },
    de: {
      key: "teaching_level",
      label: "Unterrichtsstufe",
      question: "Auf welcher Stufe unterrichtest du am liebsten? 🍎",
      options: [
        { value: "primary", label: "Grundschule 🎒" },
        { value: "secondary", label: "Gymnasium 📚" }
      ]
    },
    fr: {
      key: "teaching_level",
      label: "Niveau d'enseignement",
      question: "À quel niveau aimes-tu enseigner ? 🍎",
      options: [
        { value: "primary", label: "École primaire 🎒" },
        { value: "secondary", label: "Lycée 📚" }
      ]
    }
  };
  return makeSectorFixture({ sector: "education", fields: [byLocale[locale]] });
}

/** Build a raw model response for the engineer/default short-circuit. */
export function makeEngineerFixture(): string {
  return JSON.stringify({ sector: "software", usesDefaultFields: true, fields: [] });
}

/** Build a CV-tailored target-role MCQ model response (used by steps 1–2). */
export function makeRoleOptionsFixture(): string {
  return JSON.stringify({
    prompt: "Which teaching role are you targeting? 🎯",
    options: [
      { value: "high_school_teacher", label: "High school teacher" },
      { value: "university_lecturer", label: "University lecturer" }
    ]
  });
}
