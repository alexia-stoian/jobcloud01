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
  RecruiterNeeds,
  ScoreBreakdown,
  ScoredCandidate
} from "./types";

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

function scoreLanguages(bundle: CandidateBundle, wanted: string[]): number {
  if (wanted.length === 0) {
    return 0;
  }
  let matched = 0;
  for (const want of wanted) {
    if (bundle.languages.some((lang) => tokenMatches(lang, want))) {
      matched += 1;
    }
  }
  return matched / wanted.length;
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
