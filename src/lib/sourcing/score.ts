/**
 * Deterministic candidate scoring + ranking.
 *
 * ADMIN-ONLY / INTERNAL. Pure functions — no I/O, no `Date.now()` in the math —
 * so identical inputs always produce identical scores. Each component only
 * contributes when the recruiter specified the corresponding criterion, so
 * missing criteria never penalize a candidate.
 */

import type {
  CandidateBundle,
  MatchChecklistItem,
  MatchStatus,
  RecruiterNeeds,
  ScoreBreakdown,
  ScoredCandidate
} from "./types";
import { PROFICIENCY_RANK, normalizeProficiency, parseLanguageString } from "@/lib/languages/proficiency";

/** Relative weights per component (only active components are normalized over). */
const WEIGHTS = {
  mustHave: 45,
  requiredSkills: 30,
  niceToHaveSkills: 10,
  experience: 15,
  education: 10,
  languages: 10,
  preferences: 10,
  signals: 15
} as const;

/** Signals that count toward the no-preference positive bonus. */
const POSITIVE_BONUS_SIGNALS = new Set([
  "sustained_vs_fading_effort",
  "true_vs_claimed_proficiency"
]);
/** Maximum additive bonus (points) applied when no `preferredSignals` are set. */
const MAX_POSITIVE_BONUS = 5;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Case-insensitive fuzzy token match: equal, or either contains the other. */
function tokenMatches(candidateToken: string, needle: string): boolean {
  const a = normalize(candidateToken);
  const b = normalize(needle);
  if (a.length === 0 || b.length === 0) {
    return false;
  }
  return a === b || a.includes(b) || b.includes(a);
}

function matchSkills(candidateSkills: string[], wanted: string[]): {
  matched: string[];
  missing: string[];
} {
  const matched: string[] = [];
  const missing: string[] = [];
  for (const want of wanted) {
    if (candidateSkills.some((skill) => tokenMatches(skill, want))) {
      matched.push(want);
    } else {
      missing.push(want);
    }
  }
  return { matched, missing };
}

function scoreExperience(bundle: CandidateBundle, minYears: number): number {
  if (minYears <= 0) {
    return 1;
  }
  return Math.min(1, bundle.estimatedYearsExperience / minYears);
}

function scoreEducation(bundle: CandidateBundle, wanted: string[]): number {
  const haystack = normalize(
    bundle.education.map((entry) => `${entry.title} ${entry.field ?? ""} ${entry.school ?? ""}`).join(" ")
  );
  if (haystack.length === 0) {
    return 0;
  }
  let matched = 0;
  for (const want of wanted) {
    const keywords = normalize(want)
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3);
    if (keywords.length === 0) {
      continue;
    }
    if (keywords.some((keyword) => haystack.includes(keyword))) {
      matched += 1;
    }
  }
  return wanted.length > 0 ? matched / wanted.length : 0;
}

/**
 * Score language fit, accounting for the required proficiency LEVEL.
 *
 * Each recruiter requirement (e.g. "English C1", "German B2") is parsed into a
 * language name + a canonical level. A candidate's language is compared by name;
 * when the requirement specifies a level, the candidate's normalized level must
 * meet or exceed it for full credit. A present-but-below-level language earns
 * half credit; a missing language earns none.
 */
function scoreLanguages(bundle: CandidateBundle, wanted: string[]): number {
  if (wanted.length === 0) {
    return 0;
  }
  let total = 0;
  for (const want of wanted) {
    const requirement = parseLanguageString(want);
    const candidate = bundle.languageProficiencies.find((lang) => tokenMatches(lang.name, requirement.name));
    if (!candidate) {
      continue;
    }
    if (!requirement.cefr) {
      // No level required — a name match is full credit.
      total += 1;
      continue;
    }
    const candidateLevel = candidate.cefr ?? normalizeProficiency(candidate.levelText);
    if (candidateLevel && PROFICIENCY_RANK[candidateLevel] >= PROFICIENCY_RANK[requirement.cefr]) {
      total += 1;
    } else {
      // Speaks the language but below (or with an unknown) required level.
      total += 0.5;
    }
  }
  return total / wanted.length;
}

function scorePreferences(needs: RecruiterNeeds, bundle: CandidateBundle): { active: boolean; fraction: number } {
  const checks: Array<{ want?: string; have: string | null }> = [
    { want: needs.location, have: bundle.preferences.preferredLocation },
    { want: needs.workModel, have: bundle.preferences.preferredWorkModel },
    { want: needs.contract, have: bundle.preferences.contractPreference }
  ];
  const specified = checks.filter((check) => typeof check.want === "string" && check.want.length > 0);
  if (specified.length === 0) {
    return { active: false, fraction: 0 };
  }
  let matched = 0;
  for (const check of specified) {
    if (check.have && check.want && tokenMatches(check.have, check.want)) {
      matched += 1;
    }
  }
  return { active: true, fraction: matched / specified.length };
}

function scorePreferredSignals(
  needs: RecruiterNeeds,
  bundle: CandidateBundle
): { active: boolean; fraction: number } {
  const preferred = needs.preferredSignals;
  if (!preferred || Object.keys(preferred).length === 0) {
    return { active: false, fraction: 0 };
  }
  const signalByKey = new Map(bundle.signals.map((signal) => [signal.key, signal]));
  let total = 0;
  let count = 0;
  for (const [key, direction] of Object.entries(preferred)) {
    const signal = signalByKey.get(key);
    count += 1;
    if (!signal) {
      continue;
    }
    const confidence = Math.min(100, Math.max(0, signal.confidence)) / 100;
    // "high" rewards a strongly-inferred trait; "low" rewards its absence.
    total += direction === "high" ? confidence : 1 - confidence;
  }
  return { active: count > 0, fraction: count > 0 ? total / count : 0 };
}

/** Additive bonus (points) when no `preferredSignals` are specified. */
function positiveSignalBonus(bundle: CandidateBundle): number {
  let sum = 0;
  let count = 0;
  for (const signal of bundle.signals) {
    if (!POSITIVE_BONUS_SIGNALS.has(signal.key)) {
      continue;
    }
    count += 1;
    if (signal.inferredValue) {
      sum += Math.min(100, Math.max(0, signal.confidence)) / 100;
    }
  }
  if (count === 0) {
    return 0;
  }
  return (sum / count) * MAX_POSITIVE_BONUS;
}

/**
 * Score a single candidate against the recruiter's needs. Produces a stable
 * 0–100 fit, a per-component breakdown, and matched/missing skill lists.
 */
export function scoreCandidate(needs: RecruiterNeeds, bundle: CandidateBundle): ScoredCandidate {
  const breakdown: ScoreBreakdown = {
    mustHave: 0,
    requiredSkills: 0,
    niceToHaveSkills: 0,
    experience: 0,
    education: 0,
    languages: 0,
    preferences: 0,
    signals: 0
  };

  let weightedSum = 0;
  let activeWeight = 0;

  // Must-have ("cannot be missing") skills the recruiter flagged as most
  // important — weighted highest so missing them heavily lowers the fit.
  const mustHaveSkills = needs.mustHaveSkills ?? [];
  if (mustHaveSkills.length > 0) {
    const mustMatch = matchSkills(bundle.skills, mustHaveSkills);
    const fraction = mustMatch.matched.length / mustHaveSkills.length;
    breakdown.mustHave = fraction;
    weightedSum += fraction * WEIGHTS.mustHave;
    activeWeight += WEIGHTS.mustHave;
  }

  const requiredSkills = needs.requiredSkills ?? [];
  const requiredMatch = matchSkills(bundle.skills, requiredSkills);
  if (requiredSkills.length > 0) {
    const fraction = requiredMatch.matched.length / requiredSkills.length;
    breakdown.requiredSkills = fraction;
    weightedSum += fraction * WEIGHTS.requiredSkills;
    activeWeight += WEIGHTS.requiredSkills;
  }

  const niceToHaveSkills = needs.niceToHaveSkills ?? [];
  const niceMatch = matchSkills(bundle.skills, niceToHaveSkills);
  if (niceToHaveSkills.length > 0) {
    const fraction = niceMatch.matched.length / niceToHaveSkills.length;
    breakdown.niceToHaveSkills = fraction;
    weightedSum += fraction * WEIGHTS.niceToHaveSkills;
    activeWeight += WEIGHTS.niceToHaveSkills;
  }

  if (typeof needs.minYearsExperience === "number") {
    const fraction = scoreExperience(bundle, needs.minYearsExperience);
    breakdown.experience = fraction;
    weightedSum += fraction * WEIGHTS.experience;
    activeWeight += WEIGHTS.experience;
  }

  if ((needs.education ?? []).length > 0) {
    const fraction = scoreEducation(bundle, needs.education ?? []);
    breakdown.education = fraction;
    weightedSum += fraction * WEIGHTS.education;
    activeWeight += WEIGHTS.education;
  }

  if ((needs.languages ?? []).length > 0) {
    const fraction = scoreLanguages(bundle, needs.languages ?? []);
    breakdown.languages = fraction;
    weightedSum += fraction * WEIGHTS.languages;
    activeWeight += WEIGHTS.languages;
  }

  const prefResult = scorePreferences(needs, bundle);
  if (prefResult.active) {
    breakdown.preferences = prefResult.fraction;
    weightedSum += prefResult.fraction * WEIGHTS.preferences;
    activeWeight += WEIGHTS.preferences;
  }

  const signalResult = scorePreferredSignals(needs, bundle);
  let bonus = 0;
  if (signalResult.active) {
    breakdown.signals = signalResult.fraction;
    weightedSum += signalResult.fraction * WEIGHTS.signals;
    activeWeight += WEIGHTS.signals;
  } else {
    bonus = positiveSignalBonus(bundle);
    breakdown.signals = bonus / MAX_POSITIVE_BONUS;
  }

  const base = activeWeight > 0 ? (weightedSum / activeWeight) * 100 : 0;
  const score = Math.round(Math.min(100, Math.max(0, base + bonus)));

  return {
    bundle,
    score,
    breakdown,
    matchedRequiredSkills: requiredMatch.matched,
    matchedNiceToHaveSkills: niceMatch.matched,
    missingRequiredSkills: requiredMatch.missing
  };
}

/**
 * Score and rank every candidate. Sorts descending by score with a stable
 * tiebreak by name; returns ALL candidates.
 */
export function rankCandidates(needs: RecruiterNeeds, bundles: CandidateBundle[]): ScoredCandidate[] {
  return bundles
    .map((bundle) => scoreCandidate(needs, bundle))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.bundle.name.localeCompare(b.bundle.name);
    });
}

/** Does the candidate's education satisfy one wanted education requirement? */
function educationMatches(bundle: CandidateBundle, want: string): boolean {
  const haystack = normalize(
    bundle.education.map((entry) => `${entry.title} ${entry.field ?? ""} ${entry.school ?? ""}`).join(" ")
  );
  if (haystack.length === 0) {
    return false;
  }
  const keywords = normalize(want)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3);
  if (keywords.length === 0) {
    return false;
  }
  return keywords.some((keyword) => haystack.includes(keyword));
}

/** Met/partial/unmet status for one required language against the candidate. */
function languageStatus(bundle: CandidateBundle, wanted: string): MatchStatus {
  const requirement = parseLanguageString(wanted);
  const candidate = bundle.languageProficiencies.find((lang) => tokenMatches(lang.name, requirement.name));
  if (!candidate) {
    return "unmet";
  }
  if (!requirement.cefr) {
    return "met";
  }
  const candidateLevel = candidate.cefr ?? normalizeProficiency(candidate.levelText);
  if (candidateLevel && PROFICIENCY_RANK[candidateLevel] >= PROFICIENCY_RANK[requirement.cefr]) {
    return "met";
  }
  return "partial";
}

/**
 * Build a deterministic met/unmet checklist covering EVERY requirement the
 * recruiter specified in the JSON. Pure facts only — one line per requirement,
 * no commentary. Requirements the recruiter omitted are not listed.
 */
export function buildMatchChecklist(needs: RecruiterNeeds, scored: ScoredCandidate): MatchChecklistItem[] {
  const bundle = scored.bundle;
  const items: MatchChecklistItem[] = [];
  const skillMet = (skill: string): MatchStatus =>
    bundle.skills.some((have) => tokenMatches(have, skill)) ? "met" : "unmet";

  for (const skill of needs.mustHaveSkills ?? []) {
    items.push({ label: `Must-have: ${skill}`, status: skillMet(skill) });
  }
  for (const skill of needs.requiredSkills ?? []) {
    items.push({ label: `Skill: ${skill}`, status: skillMet(skill) });
  }
  for (const skill of needs.niceToHaveSkills ?? []) {
    items.push({ label: `Nice-to-have: ${skill}`, status: skillMet(skill) });
  }

  if (typeof needs.minYearsExperience === "number") {
    items.push({
      label: `Experience: ${needs.minYearsExperience}+ yrs`,
      status: bundle.estimatedYearsExperience >= needs.minYearsExperience ? "met" : "unmet"
    });
  }

  for (const education of needs.education ?? []) {
    items.push({ label: `Education: ${education}`, status: educationMatches(bundle, education) ? "met" : "unmet" });
  }

  for (const language of needs.languages ?? []) {
    items.push({ label: `Language: ${language}`, status: languageStatus(bundle, language) });
  }

  const prefStatus = (need: string | undefined, have: string | null): MatchStatus =>
    need && have && tokenMatches(have, need) ? "met" : "unmet";
  if (needs.location) {
    items.push({ label: `Location: ${needs.location}`, status: prefStatus(needs.location, bundle.preferences.preferredLocation) });
  }
  if (needs.workModel) {
    items.push({ label: `Work model: ${needs.workModel}`, status: prefStatus(needs.workModel, bundle.preferences.preferredWorkModel) });
  }
  if (needs.contract) {
    items.push({ label: `Contract: ${needs.contract}`, status: prefStatus(needs.contract, bundle.preferences.contractPreference) });
  }

  return items;
}
