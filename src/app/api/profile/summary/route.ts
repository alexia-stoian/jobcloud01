import { NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import { buildProfileSummary } from "@/lib/profile/summary-builder";
import { computeCompletion } from "@/lib/profile/completion-gate";
import { normalizeProficiency } from "@/lib/languages/proficiency";
import { structuredDatesFromPeriod } from "@/lib/profile/experience-period";

type ProfileDraftPayload = {
  profileHeadline?: string;
  valueProposition?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  city?: string;
  canton?: string;
  birthDate?: string;
  workExperienceRows?: Array<{ jobTitle: string; company: string; location: string; period: string; details: string }>;
  educationRows?: Array<{ degree: string; school: string; location: string; years: string }>;
  skillRows?: Array<{ skill: string; proficiency: string; lastUsed: string }>;
  languageRows?: Array<{ language: string; level: string }>;
  certificationRows?: Array<{ name: string; issuer: string; year: string }>;
  currentJobSituation?: string;
  employmentObjective?: string;
  targetRoles?: string;
  targetSeniority?: string;
  targetIndustries?: string;
  preferredWorkModel?: string;
  contractPreference?: string;
  workRate?: string;
  workPermitStatus?: string;
  salaryExpectation?: string;
  visaSponsorship?: string;
  relocationWillingness?: string;
  commuteRadius?: string;
  // Sector preference VALUES only — labels/questions/options are server-owned
  // field definitions and are NEVER trusted from the client (T-12-13).
  sectorPreferences?: { fields?: Array<{ key?: unknown; value?: unknown }> };
};

/** Untrusted sector VALUES are clamped/trimmed before they persist (V5). */
const SECTOR_VALUE_MAX = 400;

function normalizeString(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Clamp/trim an untrusted sector value and strip control characters (V5). */
function clampSectorValue(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SECTOR_VALUE_MAX);
}

/**
 * Merge client-supplied sector VALUES onto the server-owned, already-persisted
 * field definitions. The client may ONLY set `value` on fields whose `key`
 * already exists in the stored `sectorPreferences` — it can never add, rename, or
 * redefine fields/labels/questions/options (T-12-13). Sector, generatedLocale and
 * every existing field def are spread-preserved. Returns the next
 * `sectorPreferences` object, or `null` when there is nothing safe to update
 * (no incoming values, or the user has no stored sector fields — engineer/`{}`).
 */
function mergeSectorPreferenceValues(
  existing: unknown,
  incoming: ProfileDraftPayload["sectorPreferences"]
): Record<string, unknown> | null {
  const incomingFields = Array.isArray(incoming?.fields) ? incoming!.fields : null;
  if (!incomingFields) return null;

  const store = (existing && typeof existing === "object" ? existing : {}) as { fields?: unknown };
  const storedFields = Array.isArray(store.fields) ? (store.fields as Array<Record<string, unknown>>) : [];
  if (storedFields.length === 0) return null;

  const incomingByKey = new Map<string, string>();
  for (const field of incomingFields) {
    const key = typeof field?.key === "string" ? field.key : "";
    if (!key) continue;
    incomingByKey.set(key, clampSectorValue(field?.value));
  }
  if (incomingByKey.size === 0) return null;

  const nextFields = storedFields.map((raw) => {
    const key = typeof raw?.key === "string" ? raw.key : "";
    // Only touch `value`, and only on keys the server already owns.
    if (!key || !incomingByKey.has(key)) return raw;
    return { ...raw, value: incomingByKey.get(key) ?? "" };
  });

  return { ...store, fields: nextFields };
}

function buildQualificationsFromDraft(draft: ProfileDraftPayload) {
  const qualifications: Array<{ category: string; value: string }> = [];

  for (const row of draft.skillRows ?? []) {
    if (!row.skill?.trim()) continue;
    let value = row.skill.trim();
    if (row.proficiency?.trim()) value += ` (${row.proficiency.trim()})`;
    if (row.lastUsed?.trim()) value += ` - ${row.lastUsed.trim()}`;
    qualifications.push({ category: "skill", value });
  }

  for (const row of draft.languageRows ?? []) {
    if (!row.language?.trim()) continue;
    const level = normalizeString(row.level);
    qualifications.push({
      category: "language",
      value: JSON.stringify({
        language: row.language.trim(),
        proficiency: level,
        cefr: normalizeProficiency(level)
      })
    });
  }

  for (const row of draft.certificationRows ?? []) {
    if (!row.name?.trim()) continue;
    qualifications.push({
      category: "certification",
      value: JSON.stringify({
        name: row.name.trim(),
        issuer: normalizeString(row.issuer),
        date: normalizeString(row.year)
      })
    });
  }

  for (const row of draft.educationRows ?? []) {
    if (!row.school?.trim() && !row.degree?.trim()) continue;
    qualifications.push({
      category: "diploma",
      value: JSON.stringify({
        school: normalizeString(row.school),
        degree: normalizeString(row.degree),
        location: normalizeString(row.location),
        graduationDate: normalizeString(row.years)
      })
    });
  }

  for (const row of draft.workExperienceRows ?? []) {
    if (!row.jobTitle?.trim() && !row.company?.trim()) continue;
    const period = normalizeString(row.period);
    // Preserve structured start/end/current-role alongside the free-text period
    // so the saved shape matches CV-extracted entries and downstream consumers
    // (Admin panel, sourcing aggregation/report) read a consistent date signal
    // instead of the period being the only source of truth.
    const dates = period ? structuredDatesFromPeriod(period) : { isCurrentRole: false };
    qualifications.push({
      category: "experience",
      value: JSON.stringify({
        title: normalizeString(row.jobTitle),
        company: normalizeString(row.company),
        location: normalizeString(row.location),
        description: normalizeString(row.details),
        period,
        startDate: dates.startDate ?? null,
        endDate: dates.endDate ?? null,
        isCurrentRole: dates.isCurrentRole
      })
    });
  }

  return qualifications;
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      qualifications: true,
      historyEvents: {
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!profile) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }

  return NextResponse.json(
    buildProfileSummary({
    profile,
    qualifications: profile.qualifications,
    history: profile.historyEvents
    })
  );
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const draft = (await request.json()) as ProfileDraftPayload;
  const fullName = [normalizeString(draft.firstName), normalizeString(draft.lastName)].filter(Boolean).join(" ").trim();
  const preferredLocation = [normalizeString(draft.city), normalizeString(draft.canton)].filter(Boolean).join(", ").trim();
  const qualifications = buildQualificationsFromDraft(draft);

  const updatedProfile = await db.$transaction(async (tx) => {
    const existing = await tx.candidateProfile.findUnique({ where: { userId: session.user.id } });
    if (!existing) {
      throw new Error("profile_not_found");
    }

    // Map client-supplied sector VALUES onto the server-owned defs (T-12-13).
    const nextSectorPreferences = mergeSectorPreferenceValues(existing.sectorPreferences, draft.sectorPreferences);

    const updated = await tx.candidateProfile.update({
      where: { userId: session.user.id },
      data: {
        fullName: fullName || null,
        preferredLocation: preferredLocation || null,
        currentJobSituation: normalizeString(draft.currentJobSituation),
        employmentObjective: normalizeString(draft.employmentObjective),
        targetRoles: normalizeString(draft.targetRoles),
        targetSeniority: normalizeString(draft.targetSeniority),
        targetIndustries: normalizeString(draft.targetIndustries),
        preferredWorkModel: normalizeString(draft.preferredWorkModel),
        contractPreference: normalizeString(draft.contractPreference),
        workRate: normalizeString(draft.workRate),
        workPermitStatus: normalizeString(draft.workPermitStatus),
        salaryExpectation: normalizeString(draft.salaryExpectation),
        visaSponsorship: normalizeString(draft.visaSponsorship),
        relocationWillingness: normalizeString(draft.relocationWillingness),
        commuteRadius: normalizeString(draft.commuteRadius),
        editorDraft: JSON.parse(JSON.stringify(draft)),
        ...(nextSectorPreferences
          ? { sectorPreferences: JSON.parse(JSON.stringify(nextSectorPreferences)) }
          : {})
      }
    });

    await tx.profileQualification.deleteMany({ where: { profileId: updated.id } });
    if (qualifications.length > 0) {
      await tx.profileQualification.createMany({
        data: qualifications.map((item) => ({
          profileId: updated.id,
          category: item.category,
          value: item.value
        }))
      });
    }

    const completion = computeCompletion(updated);
    return tx.candidateProfile.update({
      where: { id: updated.id },
      data: {
        isMinimallyComplete: completion.isMinimallyComplete,
        missingCriticalFields: completion.missingCriticalFields,
        lastCompletionCheckAt: new Date()
      },
      include: {
        qualifications: true,
        historyEvents: {
          orderBy: { createdAt: "desc" }
        }
      }
    });
  });

  return NextResponse.json(
    buildProfileSummary({
      profile: updatedProfile,
      qualifications: updatedProfile.qualifications,
      history: updatedProfile.historyEvents
    })
  );
}
