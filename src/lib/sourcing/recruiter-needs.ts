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

/**
 * Parse and sanitize an untrusted recruiter-needs payload into a bounded,
 * typed `RecruiterNeeds`. Returns `{ error }` for non-objects, arrays, `null`,
 * or oversized payloads. Never throws on malformed input.
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

  const notes = clampString(source.notes);
  if (notes !== undefined) needs.notes = notes;

  const preferredSignals = coercePreferredSignals(source.preferredSignals);
  if (preferredSignals !== undefined) needs.preferredSignals = preferredSignals;

  return { needs };
}
