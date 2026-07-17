import { NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import { buildProfileSummary } from "@/lib/profile/summary-builder";
import { computeCompletion } from "@/lib/profile/completion-gate";
import { normalizeProficiency } from "@/lib/languages/proficiency";

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
};

function normalizeString(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
    qualifications.push({
      category: "experience",
      value: JSON.stringify({
        title: normalizeString(row.jobTitle),
        company: normalizeString(row.company),
        location: normalizeString(row.location),
        description: normalizeString(row.details),
        period: normalizeString(row.period)
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
        editorDraft: draft
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
