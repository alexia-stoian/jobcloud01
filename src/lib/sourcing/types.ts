/**
 * Recruiter Sourcing — shared types.
 *
 * ADMIN-ONLY / INTERNAL. These types describe the recruiter-needs contract, the
 * aggregated per-user candidate bundle (including the 11 invisible recruiter
 * signals), the deterministic scoring result, and the fact-grounded report.
 *
 * Signals never leave the admin-gated sourcing path — nothing here may be
 * surfaced on any job-seeker screen.
 */

import type { SignalRecord } from "@/lib/ai/signals/signal-definitions";

/**
 * The parsed, sanitized recruiter-needs criteria. Every field is optional; a
 * missing field simply does not contribute to a candidate's score.
 */
export interface RecruiterNeeds {
  role?: string;
  seniority?: string;
  requiredSkills?: string[];
  niceToHaveSkills?: string[];
  minYearsExperience?: number;
  education?: string[];
  languages?: string[];
  location?: string;
  workModel?: string;
  contract?: string;
  /** Recruiter's salary band, human-readable (e.g. "60000–80000 CHF (annual)"). */
  salary?: string;
  notes?: string;
  /**
   * Optional preferences over the canonical 11 signal keys. Only keys present in
   * `SIGNAL_REGISTRY` survive parsing; values are constrained to "high" | "low".
   */
  preferredSignals?: Record<string, "high" | "low">;
}

/** A parsed experience entry derived from a candidate's qualifications. */
export interface CandidateExperience {
  title: string;
  company?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  isCurrentRole?: boolean;
  /** Free-text tenure (e.g. "2020-01 - Present") when explicit dates are absent. */
  period?: string;
  description?: string;
}

/** A parsed education entry derived from a candidate's qualifications. */
export interface CandidateEducation {
  title: string;
  school?: string;
  field?: string;
  graduationDate?: string;
}

/** The subset of profile preference fields used for matching. */
export interface CandidatePreferences {
  preferredLocation: string | null;
  currentJobSituation: string | null;
  employmentObjective: string | null;
  targetRoles: string | null;
  targetSeniority: string | null;
  targetIndustries: string | null;
  preferredWorkModel: string | null;
  contractPreference: string | null;
  workRate: string | null;
  workPermitStatus: string | null;
  salaryExpectation: string | null;
  visaSponsorship: string | null;
  relocationWillingness: string | null;
  commuteRadius: string | null;
}

/**
 * The full Admin-profile bundle for a single user, assembled by the aggregator.
 * Contains parsed qualifications, preferences, and the 11 recruiter signals.
 */
export interface CandidateBundle {
  userId: string;
  name: string;
  primaryRole: string | null;
  skills: string[];
  languages: string[];
  experience: CandidateExperience[];
  education: CandidateEducation[];
  estimatedYearsExperience: number;
  preferences: CandidatePreferences;
  signals: SignalRecord[];
}

/** Per-component contribution to a candidate's deterministic fit score. */
export interface ScoreBreakdown {
  requiredSkills: number;
  niceToHaveSkills: number;
  experience: number;
  education: number;
  languages: number;
  preferences: number;
  signals: number;
}

/** A candidate with a deterministic 0–100 fit score and explainable breakdown. */
export interface ScoredCandidate {
  bundle: CandidateBundle;
  score: number;
  breakdown: ScoreBreakdown;
  matchedRequiredSkills: string[];
  matchedNiceToHaveSkills: string[];
  missingRequiredSkills: string[];
}

/** Hiring recommendation verdict for a candidate. */
export type SourcingVerdict = "recommended" | "consider" | "not_recommended";

/** The fact-grounded report rendered for a top candidate. */
export interface CandidateReport {
  fitPercent: number;
  whyFit: string;
  bestSkills: string[];
  pros: string[];
  cons: string[];
  /** Overall hiring verdict. */
  verdict: SourcingVerdict;
  /** Long, detailed accept/reject narrative shown in the full-report panel. */
  recommendation: string;
  /** `true` when produced by the LLM; `false` when the deterministic fallback ran. */
  grounded: boolean;
}

/** A single top-3 result returned by the sourcing API. */
export interface SourcingResult {
  userId: string;
  name: string;
  fitPercent: number;
  whyFit: string;
  bestSkills: string[];
  pros: string[];
  cons: string[];
  verdict: SourcingVerdict;
  recommendation: string;
}

/** The API response shape for `POST /api/admin/sourcing`. */
export interface SourcingResponse {
  results: SourcingResult[];
  usedLlm: boolean;
  candidateCount: number;
}
