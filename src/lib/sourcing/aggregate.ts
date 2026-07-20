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
import { loadAdminUserBundle } from "@/lib/admin/user-bundle";
import { seedSignals } from "@/lib/ai/signals/signal-definitions";
import { formatProficiency, normalizeProficiency } from "@/lib/languages/proficiency";
import { parseExperiencePeriod } from "@/lib/profile/experience-period";
import type {
  CandidateBundle,
  CandidateEducation,
  CandidateExperience,
  CandidateLanguage,
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
 * like `{"language":"EN","proficiency":"C1","cefr":"C1"}`. Extract the readable
 * language name (expanding 2-letter codes) and the proficiency, normalizing the
 * level onto the canonical CEFR scale so downstream matching is level-aware.
 */
function parseLanguageValue(value: string): CandidateLanguage | null {
  const blob = parseBlob(value);
  const rawName = blob ? str(blob, "language") ?? str(blob, "name") : value;
  const trimmed = (rawName ?? "").trim();
  if (trimmed.length === 0) {
    return null;
  }
  const expanded = LANGUAGE_CODE_MAP[trimmed.toLowerCase()] ?? trimmed;

  // Prefer an already-canonical `cefr` field; otherwise normalize `proficiency`.
  const cefrField = blob ? str(blob, "cefr") : undefined;
  const levelText = blob ? str(blob, "proficiency") ?? cefrField ?? null : null;
  const cefr = normalizeProficiency(cefrField ?? levelText);

  return { name: expanded, levelText: levelText ?? null, cefr };
}

/**
 * Estimate years between an ISO-ish start and end date. Entries with a missing
 * start date contribute 0 (documented gap the report may surface as "missing").
 */
function estimateYears(start: string | undefined, end: string | undefined, isCurrent: boolean): number {
  if (!start) {
    return 0;
  }
  const normalize = (value: string): string =>
    value.length === 4 ? `${value}-01-01` : value.length === 7 ? `${value}-01` : value;
  const startTime = Date.parse(normalize(start));
  if (Number.isNaN(startTime)) {
    return 0;
  }
  let endTime: number;
  if (isCurrent || !end) {
    endTime = Date.now();
  } else {
    const parsed = Date.parse(normalize(end));
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
  languageProficiencies: CandidateLanguage[];
  experience: CandidateExperience[];
  education: CandidateEducation[];
  estimatedYearsExperience: number;
} {
  const skills: string[] = [];
  const languages: string[] = [];
  const languageProficiencies: CandidateLanguage[] = [];
  const experience: CandidateExperience[] = [];
  const education: CandidateEducation[] = [];
  let totalYears = 0;

  for (const qual of qualifications) {
    const cat = qual.category.toLowerCase();

    if (cat === "language") {
      const lang = parseLanguageValue(qual.value);
      if (lang && !languageProficiencies.some((l) => l.name.toLowerCase() === lang.name.toLowerCase())) {
        languageProficiencies.push(lang);
        // Display string carries the normalized level, e.g. "English — C1 (Advanced)".
        const label = formatProficiency(lang.cefr ?? lang.levelText);
        languages.push(label ? `${lang.name} — ${label}` : lang.name);
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
      const period = obj ? str(obj, "period") : undefined;
      experience.push({
        title: (obj && str(obj, "title")) ?? qual.value,
        company: obj ? str(obj, "company") : undefined,
        location: obj ? str(obj, "location") : undefined,
        startDate,
        endDate,
        isCurrentRole,
        period,
        description: obj ? str(obj, "description") : undefined
      });
      if (startDate) {
        totalYears += estimateYears(startDate, endDate, isCurrentRole);
      } else if (period) {
        // Profiles saved via the editor store only a free-text "period" (dates
        // are dropped) — parse it so the years estimate stays accurate.
        const p = parseExperiencePeriod(period);
        if (p.start) {
          totalYears += estimateYears(p.start, p.end, p.isCurrentRole || isCurrentRole);
        }
      }
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
    languageProficiencies,
    experience,
    education,
    estimatedYearsExperience: Math.round(totalYears * 10) / 10
  };
}

async function buildBundle(user: { id: string; email: string }): Promise<CandidateBundle> {
  // Sourcing reads each candidate through the SAME loader the Admin "Profile"
  // button uses, so it always reflects exactly what the Admin page extracts from
  // the completed Profile page.
  const admin = await loadAdminUserBundle(user.id);

  const signals = admin && admin.signals.length > 0 ? admin.signals : seedSignals();

  if (!admin || !admin.profile) {
    return {
      userId: user.id,
      name: admin?.user.name ?? user.email.split("@")[0],
      primaryRole: null,
      skills: [],
      languages: [],
      languageProficiencies: [],
      experience: [],
      education: [],
      estimatedYearsExperience: 0,
      preferences: {
        preferredLocation: null,
        currentJobSituation: null,
        employmentObjective: null,
        targetRoles: null,
        targetSeniority: null,
        targetIndustries: null,
        preferredWorkModel: null,
        contractPreference: null,
        workRate: null,
        workPermitStatus: null,
        salaryExpectation: null,
        visaSponsorship: null,
        relocationWillingness: null,
        commuteRadius: null
      },
      signals
    };
  }

  const profile = admin.profile;
  const parsed = parseQualifications(admin.qualifications);

  const preferences: CandidatePreferences = {
    preferredLocation: profile.preferredLocation,
    currentJobSituation: profile.currentJobSituation,
    employmentObjective: profile.employmentObjective,
    targetRoles: profile.targetRoles,
    targetSeniority: profile.targetSeniority,
    targetIndustries: profile.targetIndustries,
    preferredWorkModel: profile.preferredWorkModel,
    contractPreference: profile.contractPreference,
    workRate: profile.workRate,
    workPermitStatus: profile.workPermitStatus,
    salaryExpectation: profile.salaryExpectation,
    visaSponsorship: profile.visaSponsorship,
    relocationWillingness: profile.relocationWillingness,
    commuteRadius: profile.commuteRadius
  };

  return {
    userId: user.id,
    name: admin.user.name,
    primaryRole: profile.primaryRole,
    skills: parsed.skills,
    languages: parsed.languages,
    languageProficiencies: parsed.languageProficiencies,
    experience: parsed.experience,
    education: parsed.education,
    estimatedYearsExperience: parsed.estimatedYearsExperience,
    preferences,
    signals
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
