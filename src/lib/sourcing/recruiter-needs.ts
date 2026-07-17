/**
 * Recruiter-needs parser + sanitizer.
 *
 * The uploaded JSON is UNTRUSTED input. This module validates its shape, bounds
 * its size, clamps every string/number, drops unknown keys, and keeps only the
 * canonical signal keys — so downstream scoring and the LLM prompt never see raw,
 * unbounded, or unexpected values. Nothing here `eval`s or executes the payload.
 */

import { SIGNAL_REGISTRY } from "@/lib/ai/signals/signal-definitions";
import type { RecruiterNeeds } from "./types";

/** Maximum serialized payload size (32 KB). */
const MAX_PAYLOAD_BYTES = 32 * 1024;
/** Maximum length any single string value is clamped to. */
const MAX_STRING_LENGTH = 200;
/** Maximum number of entries kept in any array field. */
const MAX_ARRAY_ITEMS = 50;
/** Bounds for the years-of-experience criterion. */
const MIN_YEARS = 0;
const MAX_YEARS = 60;

const SIGNAL_KEY_SET = new Set(SIGNAL_REGISTRY.map((definition) => definition.key));

function clampString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return trimmed.slice(0, MAX_STRING_LENGTH);
}

function coerceStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const out: string[] = [];
  for (const item of value) {
    const clamped = clampString(item);
    if (clamped !== undefined) {
      out.push(clamped);
    }
    if (out.length >= MAX_ARRAY_ITEMS) {
      break;
    }
  }
  return out.length > 0 ? out : undefined;
}

function coerceYears(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.min(MAX_YEARS, Math.max(MIN_YEARS, Math.round(value)));
}

function coercePreferredSignals(value: unknown): Record<string, "high" | "low"> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const out: Record<string, "high" | "low"> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!SIGNAL_KEY_SET.has(key)) {
      continue;
    }
    if (raw === "high" || raw === "low") {
      out[key] = raw;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// ---------------------------------------------------------------------------
// Nested ATS-schema support
//
// Real intake tools export a nested structure (job_basics, hard_requirements,
// conditions, …) rather than the flat contract. `normalizeNestedNeeds` maps that
// shape onto the flat `RecruiterNeeds` fields so the SAME scoring path works for
// both. Every read is defensive — unknown/missing keys are simply skipped.
// ---------------------------------------------------------------------------

function obj(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Human-readable label for the ATS `education_minimum` enum. */
function mapEducationMinimum(value: unknown): string | undefined {
  const s = clampString(value);
  if (!s) return undefined;
  const map: Record<string, string> = {
    university_degree_master_bachelor: "University degree (Bachelor or Master)",
    university_degree_master: "University degree (Master)",
    university_degree_bachelor: "University degree (Bachelor)",
    apprenticeship: "Apprenticeship / vocational",
    high_school: "High school"
  };
  return map[s] ?? s.replace(/_/g, " ");
}

/** Keyword → signal-key mapping so culture/personality hints drive signal matching. */
const SIGNAL_HINTS: Array<{ match: RegExp; key: string; direction: "high" | "low" }> = [
  { match: /learning_agility|growth|curious|learn/i, key: "personal_growth_driven", direction: "high" },
  { match: /technical|engineering|craft|hands_on/i, key: "technical_growth_driven", direction: "high" },
  { match: /detail_oriented|quality_first|structured_planner|rigor|thorough/i, key: "true_vs_claimed_proficiency", direction: "high" },
  { match: /reliable|committed|persever|sustained|ownership|result_driven/i, key: "sustained_vs_fading_effort", direction: "high" },
  { match: /autonom|independent|self_starter|self-starter/i, key: "independent_vs_supervised", direction: "high" },
  { match: /calm|resilien|pressure|stress/i, key: "stress_behavior", direction: "high" },
  { match: /stable|stability|long_term|long-term/i, key: "stability_driven", direction: "high" }
];

/** Derive preferred signals from free-text culture/personality/task hints. */
function deriveSignalsFromHints(hints: string[]): Record<string, "high" | "low"> {
  const out: Record<string, "high" | "low"> = {};
  const blob = hints.join(" ");
  for (const { match, key, direction } of SIGNAL_HINTS) {
    if (SIGNAL_KEY_SET.has(key) && match.test(blob)) {
      out[key] = direction;
    }
  }
  return out;
}

/** Detect whether a payload looks like the nested ATS schema. */
function isNestedSchema(source: Record<string, unknown>): boolean {
  return (
    "job_basics" in source ||
    "hard_requirements" in source ||
    "tasks_responsibilities" in source ||
    "company_context" in source
  );
}

/** Map the nested ATS schema onto flat `RecruiterNeeds`. */
function normalizeNestedNeeds(source: Record<string, unknown>): RecruiterNeeds {
  const needs: RecruiterNeeds = {};
  const hints: string[] = [];

  const jobBasics = obj(source.job_basics);
  if (jobBasics) {
    const role = clampString(jobBasics.title);
    if (role) needs.role = role;
    const seniority = clampString(jobBasics.hierarchical_level);
    if (seniority) needs.seniority = seniority.replace(/_/g, " ");
    const contract = clampString(jobBasics.contract_type);
    if (contract) needs.contract = contract.replace(/_/g, " ");
    const workplace = obj(jobBasics.workplace);
    if (workplace) {
      const loc = [clampString(workplace.city), clampString(workplace.country)].filter(Boolean).join(", ");
      if (loc) needs.location = loc.slice(0, MAX_STRING_LENGTH);
    }
  }

  const hard = obj(source.hard_requirements);
  if (hard) {
    const skills = [
      ...(coerceStringArray(hard.skills_required) ?? []),
      ...(coerceStringArray(hard.tools_software_machinery) ?? [])
    ];
    const dedupSkills = Array.from(new Set(skills)).slice(0, MAX_ARRAY_ITEMS);
    if (dedupSkills.length > 0) needs.requiredSkills = dedupSkills;

    const years = coerceYears(hard.experience_years);
    if (years !== undefined) needs.minYearsExperience = years;

    const edu = mapEducationMinimum(hard.education_minimum);
    if (edu) needs.education = [edu];

    // languages: array of { language, level, importance } — extract + dedupe.
    if (Array.isArray(hard.languages)) {
      const langs: string[] = [];
      for (const entry of hard.languages) {
        const e = obj(entry);
        const lang = e ? clampString(e.language) : clampString(entry);
        if (lang && !langs.some((l) => l.toLowerCase() === lang.toLowerCase())) {
          langs.push(lang);
        }
      }
      if (langs.length > 0) needs.languages = langs.slice(0, MAX_ARRAY_ITEMS);
    }
  }

  const conditions = obj(source.conditions);
  if (conditions) {
    const remote = clampString(conditions.remote_policy);
    if (remote) needs.workModel = remote.replace(/_/g, " ");
  }

  // Recruiter salary band (nested { annual_min, annual_max, currency, type }).
  const salary = obj(source.salary);
  if (salary) {
    const num = (v: unknown): number | undefined =>
      typeof v === "number" && Number.isFinite(v) ? v : undefined;
    const min = num(salary.annual_min);
    const max = num(salary.annual_max);
    const currency = clampString(salary.currency) ?? "";
    const type = clampString(salary.type) ?? "annual";
    if (min !== undefined || max !== undefined) {
      const range = [min, max].filter((v) => v !== undefined).join("–");
      needs.salary = `${range} ${currency} (${type})`.replace(/\s+/g, " ").trim().slice(0, MAX_STRING_LENGTH);
    }
  }

  // Assemble notes + signal hints from tasks, intake notes, and company context.
  const noteParts: string[] = [];
  const tasks = obj(source.tasks_responsibilities);
  if (tasks) {
    const main = coerceStringArray(tasks.main_tasks);
    if (main) {
      noteParts.push(`Tasks: ${main.join("; ")}`);
      hints.push(...main);
    }
    const autonomy = clampString(tasks.autonomy_level);
    if (autonomy) hints.push(`autonomy_${autonomy}`);
  }
  const intakeNotes = coerceStringArray(source.intake_notes);
  if (intakeNotes) {
    noteParts.push(...intakeNotes);
    hints.push(...intakeNotes);
  }
  const company = obj(source.company_context);
  if (company) {
    const industry = clampString(company.industry);
    if (industry) noteParts.push(`Industry: ${industry}`);
    const culture = coerceStringArray(company.team_culture_tags);
    if (culture) {
      noteParts.push(`Culture: ${culture.join(", ")}`);
      hints.push(...culture);
    }
    const leadership = clampString(company.leadership_style);
    if (leadership) hints.push(leadership);
  }
  if (noteParts.length > 0) {
    needs.notes = noteParts.join(" | ").slice(0, MAX_STRING_LENGTH * 4);
  }

  const derived = deriveSignalsFromHints(hints);
  // Explicit preferredSignals (if the payload also carries them) win.
  const explicit = coercePreferredSignals(source.preferredSignals);
  const merged = { ...derived, ...(explicit ?? {}) };
  if (Object.keys(merged).length > 0) needs.preferredSignals = merged;

  return needs;
}

/** Parse the flat contract shape. */
function normalizeFlatNeeds(source: Record<string, unknown>): RecruiterNeeds {
  const needs: RecruiterNeeds = {};

  const role = clampString(source.role);
  if (role !== undefined) needs.role = role;

  const seniority = clampString(source.seniority);
  if (seniority !== undefined) needs.seniority = seniority;

  const requiredSkills = coerceStringArray(source.requiredSkills);
  if (requiredSkills !== undefined) needs.requiredSkills = requiredSkills;

  const niceToHaveSkills = coerceStringArray(source.niceToHaveSkills);
  if (niceToHaveSkills !== undefined) needs.niceToHaveSkills = niceToHaveSkills;

  const minYearsExperience = coerceYears(source.minYearsExperience);
  if (minYearsExperience !== undefined) needs.minYearsExperience = minYearsExperience;

  const education = coerceStringArray(source.education);
  if (education !== undefined) needs.education = education;

  const languages = coerceStringArray(source.languages);
  if (languages !== undefined) needs.languages = languages;

  const location = clampString(source.location);
  if (location !== undefined) needs.location = location;

  const workModel = clampString(source.workModel);
  if (workModel !== undefined) needs.workModel = workModel;

  const contract = clampString(source.contract);
  if (contract !== undefined) needs.contract = contract;

  const salary = clampString(source.salary);
  if (salary !== undefined) needs.salary = salary;

  const notes = clampString(source.notes);
  if (notes !== undefined) needs.notes = notes;

  const preferredSignals = coercePreferredSignals(source.preferredSignals);
  if (preferredSignals !== undefined) needs.preferredSignals = preferredSignals;

  return needs;
}

/**
 * Parse and sanitize an untrusted recruiter-needs payload into a bounded,
 * typed `RecruiterNeeds`. Supports BOTH the flat contract and the nested ATS
 * schema (job_basics / hard_requirements / …). Returns `{ error }` for
 * non-objects, arrays, `null`, or oversized payloads. Never throws.
 */
export function parseRecruiterNeeds(
  raw: unknown
): { needs: RecruiterNeeds } | { error: string } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { error: "invalid_payload" };
  }

  let serializedLength: number;
  try {
    serializedLength = JSON.stringify(raw).length;
  } catch {
    return { error: "invalid_payload" };
  }
  if (serializedLength > MAX_PAYLOAD_BYTES) {
    return { error: "payload_too_large" };
  }

  const source = raw as Record<string, unknown>;

  // Merge flat + nested so a payload carrying both is fully captured; nested
  // (ATS) values fill any gaps the flat pass left.
  const flat = normalizeFlatNeeds(source);
  const needs = isNestedSchema(source)
    ? { ...normalizeNestedNeeds(source), ...flat }
    : flat;

  // Drop empty-string/empty-array leftovers from the merge.
  if (needs.requiredSkills && needs.requiredSkills.length === 0) delete needs.requiredSkills;

  return { needs };
}
