/**
 * Candidate aggregation across all users.
 *
 * ADMIN-ONLY / INTERNAL. Assembles one `CandidateBundle` per user: full profile
 * fields, qualifications parsed into skills/languages/experience/education,
 * preferences, and the 11 recruiter signals. Signals are read only here inside
 * the admin-gated sourcing path and never surfaced to a job seeker.
 *
 * The qualification-parsing approach mirrors the client helper in
 * `src/components/admin/AdminProfilePanel.tsx` (`parseQualification`) — skill /
 * language / tool categories are plain tag strings; experience / education /
 * degree / diploma / certification values are JSON blobs parsed defensively.
 */

import { db } from "@/lib/db";
import { buildProfileSummary } from "@/lib/profile/summary-builder";
import { loadSignalStateWithMeta } from "@/lib/ai/signals/signal-dal";
import { seedSignals } from "@/lib/ai/signals/signal-definitions";
import type {
  CandidateBundle,
  CandidateEducation,
  CandidateExperience,
  CandidatePreferences
} from "./types";

/** Number of users aggregated concurrently to bound DB/cost on large tables. */
const AGGREGATION_BATCH_SIZE = 8;

type RawQualification = { category: string; value: string };

function parseBlob(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function str(obj: Record<string, unknown>, key: string): string | undefined {
  return typeof obj[key] === "string" ? (obj[key] as string) : undefined;
}

/** Normalize a 2-letter language code to a full English name for display + matching. */
const LANGUAGE_CODE_MAP: Record<string, string> = {
  en: "English",
  fr: "French",
  de: "German",
  it: "Italian",
  es: "Spanish",
  pt: "Portuguese",
  ro: "Romanian",
  nl: "Dutch",
  ru: "Russian",
  zh: "Chinese",
  ar: "Arabic"
};

/**
 * Language qualifications are stored either as a plain string or a JSON blob
 * like `{"language":"EN","proficiency":"expert"}`. Extract the readable language
 * name and expand 2-letter codes so downstream display + matching are clean.
 */
function parseLanguageValue(value: string): string | null {
  const blob = parseBlob(value);
  const raw = blob ? str(blob, "language") ?? str(blob, "name") : value;
  const trimmed = (raw ?? "").trim();
  if (trimmed.length === 0) {
    return null;
  }
  const expanded = LANGUAGE_CODE_MAP[trimmed.toLowerCase()];
  return expanded ?? trimmed;
}

/**
 * Estimate years between an ISO-ish start and end date. Entries with a missing
 * start date contribute 0 (documented gap the report may surface as "missing").
 */
function estimateYears(start: string | undefined, end: string | undefined, isCurrent: boolean): number {
  if (!start) {
    return 0;
  }
  const startTime = Date.parse(start.length === 7 ? `${start}-01` : start);
  if (Number.isNaN(startTime)) {
    return 0;
  }
  let endTime: number;
  if (isCurrent || !end) {
    endTime = Date.now();
  } else {
    const parsed = Date.parse(end.length === 7 ? `${end}-01` : end);
    endTime = Number.isNaN(parsed) ? Date.now() : parsed;
  }
  const years = (endTime - startTime) / (365.25 * 24 * 60 * 60 * 1000);
  return years > 0 ? years : 0;
}

/**
 * Parse a user's qualifications (mirrors the AdminProfilePanel client helper)
 * into typed skills / languages / experience / education and a summed years
 * estimate.
 */
function parseQualifications(qualifications: RawQualification[]): {
  skills: string[];
  languages: string[];
  experience: CandidateExperience[];
  education: CandidateEducation[];
  estimatedYearsExperience: number;
} {
  const skills: string[] = [];
  const languages: string[] = [];
  const experience: CandidateExperience[] = [];
  const education: CandidateEducation[] = [];
  let totalYears = 0;

  for (const qual of qualifications) {
    const cat = qual.category.toLowerCase();

    if (cat === "language") {
      const lang = parseLanguageValue(qual.value);
      if (lang && !languages.some((l) => l.toLowerCase() === lang.toLowerCase())) {
        languages.push(lang);
      }
      continue;
    }
    if (cat === "skill" || cat === "tool") {
      skills.push(qual.value);
      continue;
    }

    const obj = parseBlob(qual.value);

    if (cat === "experience") {
      const startDate = obj ? str(obj, "startDate") : undefined;
      const endDate = obj ? str(obj, "endDate") : undefined;
      const isCurrentRole = obj ? obj.isCurrentRole === true : false;
      experience.push({
        title: (obj && str(obj, "title")) ?? qual.value,
        company: obj ? str(obj, "company") : undefined,
        location: obj ? str(obj, "location") : undefined,
        startDate,
        endDate,
        isCurrentRole,
        description: obj ? str(obj, "description") : undefined
      });
      totalYears += estimateYears(startDate, endDate, isCurrentRole);
      continue;
    }

    if (cat === "diploma" || cat === "education" || cat === "degree") {
      const degree = obj ? str(obj, "degree") : undefined;
      const field = obj ? str(obj, "field") : undefined;
      const title = [degree, field].filter(Boolean).join(", ");
      education.push({
        title: title || (obj && str(obj, "school")) || qual.value,
        school: obj ? str(obj, "school") : undefined,
        field,
        graduationDate: obj ? str(obj, "graduationDate") : undefined
      });
      continue;
    }

    // Certifications and other categories are not used for matching; skip.
  }

  return {
    skills,
    languages,
    experience,
    education,
    estimatedYearsExperience: Math.round(totalYears * 10) / 10
  };
}

async function buildBundle(user: { id: string; email: string }): Promise<CandidateBundle> {
  const profile = await db.candidateProfile.findUnique({
    where: { userId: user.id },
    include: {
      qualifications: true,
      historyEvents: { orderBy: { createdAt: "desc" } }
    }
  });

  const { signals } = await loadSignalStateWithMeta(user.id);

  if (!profile) {
    return {
      userId: user.id,
      name: user.email.split("@")[0],
      primaryRole: null,
      skills: [],
      languages: [],
      experience: [],
      education: [],
      estimatedYearsExperience: 0,
      preferences: {
        preferredLocation: null,
        preferredWorkModel: null,
        contractPreference: null,
        targetRoles: null,
        targetSeniority: null,
        targetIndustries: null,
        salaryExpectation: null
      },
      signals: signals.length > 0 ? signals : seedSignals()
    };
  }

  const summary = buildProfileSummary({
    profile,
    qualifications: profile.qualifications,
    history: profile.historyEvents
  });

  const parsed = parseQualifications(summary.qualifications);

  const preferences: CandidatePreferences = {
    preferredLocation: summary.profile.preferredLocation,
    preferredWorkModel: summary.profile.preferredWorkModel,
    contractPreference: summary.profile.contractPreference,
    targetRoles: summary.profile.targetRoles,
    targetSeniority: summary.profile.targetSeniority,
    targetIndustries: summary.profile.targetIndustries,
    salaryExpectation: summary.profile.salaryExpectation
  };

  return {
    userId: user.id,
    name: summary.profile.fullName?.trim() || user.email.split("@")[0],
    primaryRole: summary.profile.primaryRole,
    skills: parsed.skills,
    languages: parsed.languages,
    experience: parsed.experience,
    education: parsed.education,
    estimatedYearsExperience: parsed.estimatedYearsExperience,
    preferences,
    signals: signals.length > 0 ? signals : seedSignals()
  };
}

/**
 * Aggregate every user into a `CandidateBundle`. Users without a profile still
 * return a bundle (empty arrays, seeded signals). Runs in bounded batches to cap
 * concurrent DB work on large user tables.
 */
export async function aggregateCandidates(): Promise<CandidateBundle[]> {
  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true }
  });

  const bundles: CandidateBundle[] = [];
  for (let i = 0; i < users.length; i += AGGREGATION_BATCH_SIZE) {
    const batch = users.slice(i, i + AGGREGATION_BATCH_SIZE);
    const built = await Promise.all(batch.map((user) => buildBundle(user)));
    bundles.push(...built);
  }

  return bundles;
}
