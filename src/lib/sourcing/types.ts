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
import type { CefrLevel } from "@/lib/languages/proficiency";

/**
 * The parsed, sanitized recruiter-needs criteria. Every field is optional; a
 * missing field simply does not contribute to a candidate's score.
 */
export interface RecruiterNeeds {
  role?: string;
  seniority?: string;
  requiredSkills?: string[];
  niceToHaveSkills?: string[];
  /**
   * Critical "cannot be missing" skills the recruiter flags as most important
   * (e.g. knockout criteria). These are weighted more heavily than requiredSkills.
   */
  mustHaveSkills?: string[];
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

/** A parsed language entry with its proficiency normalized to a canonical level. */
export interface CandidateLanguage {
  /** Readable language name (2-letter codes expanded, e.g. "English"). */
  name: string;
  /** The raw proficiency text as stored on the profile, or `null` when absent. */
  levelText: string | null;
  /** The canonical CEFR-scale level, or `null` when unrecognizable / absent. */
  cefr: CefrLevel | null;
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
  /** Structured languages with normalized proficiency, used for level-aware matching. */
  languageProficiencies: CandidateLanguage[];
  experience: CandidateExperience[];
  education: CandidateEducation[];
  estimatedYearsExperience: number;
  preferences: CandidatePreferences;
  signals: SignalRecord[];
}

/** Per-component contribution to a candidate's deterministic fit score. */
export interface ScoreBreakdown {
  mustHave: number;
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

/** Whether a single recruiter requirement is satisfied by a candidate. */
export type MatchStatus = "met" | "partial" | "unmet";

/** One recruiter requirement paired with the candidate's met/unmet status. */
export interface MatchChecklistItem {
  /** The requirement itself (e.g. "Skill: Kubernetes", "Language: German B2"). */
  label: string;
  status: MatchStatus;
}

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
  /** Deterministic met/unmet list of every recruiter requirement from the JSON. */
  checklist: MatchChecklistItem[];
  /** Very concise (<=50 word) verdict on the recruiter's most-wanted skills. */
  summary: string;
}

/** The API response shape for `POST /api/admin/sourcing`. */
export interface SourcingResponse {
  results: SourcingResult[];
  usedLlm: boolean;
  candidateCount: number;
}
