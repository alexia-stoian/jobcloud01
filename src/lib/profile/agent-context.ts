import { db } from "@/lib/db";

/**
 * Build a compact, human-readable snapshot of a user's profile for grounding the
 * Application Coach agent (cover letters + interview practice).
 *
 * Loaded strictly by `userId`, so the context is ALWAYS scoped to the signed-in
 * user — it can never leak between accounts. Returns null when there is nothing
 * useful to share yet.
 */

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function rows(draft: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = draft[key];
  return Array.isArray(value) ? value.filter(isObject) : [];
}

export async function buildCandidateContext(userId: string): Promise<string | null> {
  const profile = await db.candidateProfile.findUnique({
    where: { userId },
    select: {
      fullName: true,
      currentJobSituation: true,
      employmentObjective: true,
      primaryRole: true,
      targetRoles: true,
      targetSeniority: true,
      targetIndustries: true,
      preferredLocation: true,
      preferredWorkModel: true,
      contractPreference: true,
      workRate: true,
      salaryExpectation: true,
      relocationWillingness: true,
      editorDraft: true,
      qualifications: { select: { category: true, value: true } }
    }
  });

  if (!profile) {
    return null;
  }

  const draft = isObject(profile.editorDraft) ? profile.editorDraft : {};
  const lines: string[] = [];

  const name =
    str(profile.fullName) || [str(draft.firstName), str(draft.lastName)].filter(Boolean).join(" ").trim();
  if (name) lines.push(`Name: ${name}`);

  const headline = str(draft.profileHeadline);
  if (headline) lines.push(`Headline: ${headline}`);

  const valueProp = str(draft.valueProposition);
  if (valueProp) lines.push(`Value proposition: ${valueProp}`);

  const facts: Array<[string, string]> = [
    ["Current situation", str(profile.currentJobSituation)],
    ["Objective", str(profile.employmentObjective)],
    ["Current/primary role", str(profile.primaryRole)],
    ["Target role(s)", str(profile.targetRoles)],
    ["Target seniority", str(profile.targetSeniority)],
    ["Target industries", str(profile.targetIndustries)],
    ["Preferred location", str(profile.preferredLocation)],
    ["Work model", str(profile.preferredWorkModel)],
    ["Contract preference", str(profile.contractPreference)],
    ["Work rate", str(profile.workRate)],
    ["Salary expectation", str(profile.salaryExpectation)],
    ["Open to relocation", str(profile.relocationWillingness)]
  ];
  for (const [label, value] of facts) {
    if (value) lines.push(`${label}: ${value}`);
  }

  const experience = rows(draft, "workExperienceRows")
    .map((r) => {
      const title = str(r.jobTitle);
      const company = str(r.company);
      if (!title && !company) return "";
      const period = str(r.period);
      const location = str(r.location);
      const details = str(r.details);
      const head = [title, company].filter(Boolean).join(" @ ");
      const meta = [period, location].filter(Boolean).join(", ");
      return `- ${head}${meta ? ` (${meta})` : ""}${details ? `: ${details.slice(0, 300)}` : ""}`;
    })
    .filter(Boolean);
  if (experience.length > 0) lines.push("", "Experience:", ...experience);

  const education = rows(draft, "educationRows")
    .map((r) => {
      const degree = str(r.degree);
      const school = str(r.school);
      if (!degree && !school) return "";
      const years = str(r.years);
      const head = [degree, school].filter(Boolean).join(" @ ");
      return `- ${head}${years ? ` (${years})` : ""}`;
    })
    .filter(Boolean);
  if (education.length > 0) lines.push("", "Education:", ...education);

  const skills = rows(draft, "skillRows")
    .map((r) => {
      const skill = str(r.skill);
      if (!skill) return "";
      const prof = str(r.proficiency);
      return prof ? `${skill} (${prof})` : skill;
    })
    .filter(Boolean);
  if (skills.length > 0) lines.push("", `Skills: ${skills.join(", ")}`);

  const languages = rows(draft, "languageRows")
    .map((r) => {
      const language = str(r.language);
      if (!language) return "";
      const level = str(r.level);
      return level ? `${language} (${level})` : language;
    })
    .filter(Boolean);
  if (languages.length > 0) lines.push(`Languages: ${languages.join(", ")}`);

  const certifications = rows(draft, "certificationRows")
    .map((r) => {
      const cert = str(r.name);
      if (!cert) return "";
      const issuer = str(r.issuer);
      const year = str(r.year);
      const meta = [issuer, year].filter(Boolean).join(", ");
      return `${cert}${meta ? ` (${meta})` : ""}`;
    })
    .filter(Boolean);
  if (certifications.length > 0) lines.push(`Certifications: ${certifications.join(", ")}`);

  // Fall back to stored qualifications (e.g. CV-parsed skills) when the editor
  // draft has none, so a freshly-onboarded user still gets grounded output.
  if (skills.length === 0) {
    const qualSkills = profile.qualifications
      .filter((q) => q.category === "skill")
      .map((q) => str(q.value))
      .filter(Boolean);
    if (qualSkills.length > 0) lines.push("", `Skills: ${qualSkills.join(", ")}`);
  }

  if (lines.length === 0) {
    return null;
  }

  return lines.join("\n");
}
