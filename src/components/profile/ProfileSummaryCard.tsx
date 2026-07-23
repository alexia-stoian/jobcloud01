"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

type LanguageRow = {
  language: string;
  level: string;
};

type WorkExperienceRow = {
  jobTitle: string;
  company: string;
  location: string;
  period: string;
  details: string;
};

type EducationRow = {
  degree: string;
  school: string;
  location: string;
  years: string;
};

type SkillRow = {
  skill: string;
  proficiency: string;
  lastUsed: string;
};

type CertificationRow = {
  name: string;
  issuer: string;
  year: string;
};

type StructuredQualificationPayload = {
  school?: string | null;
  location?: string | null;
  degree?: string | null;
  field?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  graduationDate?: string | null;
  honors?: string | null;
  name?: string | null;
  issuer?: string | null;
  date?: string | null;
  expiryDate?: string | null;
  credentialId?: string | null;
  language?: string | null;
  proficiency?: string | null;
  yearsOfExperience?: number | null;
  company?: string | null;
  title?: string | null;
  isCurrentRole?: boolean;
  description?: string | null;
  achievements?: string[];
};

type SectionKey =
  | "headline"
  | "personal"
  | "work"
  | "education"
  | "skills"
  | "languages"
  | "certifications"
  | "preferences";

type ProfileDraft = {
  profileHeadline: string;
  valueProposition: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  canton: string;
  birthDate: string;
  workExperienceRows: WorkExperienceRow[];
  educationRows: EducationRow[];
  skillRows: SkillRow[];
  languageRows: LanguageRow[];
  certificationRows: CertificationRow[];
  currentJobSituation: string;
  employmentObjective: string;
  targetRoles: string;
  targetSeniority: string;
  targetIndustries: string;
  preferredWorkModel: string;
  contractPreference: string;
  workRate: string;
  workPermitStatus: string;
  salaryExpectation: string;
  visaSponsorship: string;
  relocationWillingness: string;
  commuteRadius: string;
  sectorPreferences?: { fields: Array<{ key: string; value: string }> };
  /** ISO timestamp of when this draft was last written (freshness for reconciliation). */
  _savedAt?: string;
};

/** One localized MCQ option for a persisted sector field (D-08). */
type SectorFieldOption = { value: string; label: string };

/** One persisted sector preference field read from `sectorPreferences` (D-05). */
type SectorFieldDef = {
  key: string;
  label: string;
  question: string;
  options: SectorFieldOption[];
  value: string;
};

/** Maximum sector-specific fields rendered on Preferences (D-04). */
const MAX_SECTOR_FIELDS = 3;

/**
 * Read the (<=3) persisted sector field definitions from a profile's
 * `sectorPreferences`. Returns an empty array for the engineer/default `{}` store
 * or any malformed shape, so the caller renders NO sector block for those users
 * (Pitfall 5). Labels/questions/options come straight from the store (D-08) and
 * are rendered as plain strings — never dangerouslySetInnerHTML (T-12-14).
 */
function readSectorFieldDefs(sectorPreferences: unknown): SectorFieldDef[] {
  if (!sectorPreferences || typeof sectorPreferences !== "object") return [];
  const rawFields = (sectorPreferences as { fields?: unknown }).fields;
  if (!Array.isArray(rawFields)) return [];
  const defs: SectorFieldDef[] = [];
  for (const raw of rawFields) {
    if (defs.length >= MAX_SECTOR_FIELDS) break;
    const record = (raw ?? {}) as {
      key?: unknown;
      label?: unknown;
      question?: unknown;
      options?: unknown;
      value?: unknown;
    };
    const key = typeof record.key === "string" ? record.key : "";
    const label = typeof record.label === "string" ? record.label : "";
    if (!key || !label) continue;
    const options = Array.isArray(record.options)
      ? record.options
          .map((opt) => {
            // Options may be persisted either as `{ value, label }` objects or as
            // plain strings (the Career Guide agent emits bare strings) — coerce
            // a string into both value and label.
            if (typeof opt === "string") {
              return { value: opt, label: opt };
            }
            const option = (opt ?? {}) as { value?: unknown; label?: unknown };
            const label = typeof option.label === "string" ? option.label : "";
            const value = typeof option.value === "string" ? option.value : label;
            return { value, label };
          })
          .filter((option) => option.label.length > 0)
      : [];
    defs.push({
      key,
      label,
      question: typeof record.question === "string" ? record.question : "",
      options,
      value: typeof record.value === "string" ? record.value : ""
    });
  }
  return defs;
}

const PROFILE_DRAFT_STORAGE_KEY = "jobscout24.profile-summary-draft.v1";

function buildProfileDraftStorageKey(scopeId: string): string {
  return `${PROFILE_DRAFT_STORAGE_KEY}:${scopeId}`;
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseStructuredQualification(value: string): StructuredQualificationPayload | null {
  try {
    const parsed = JSON.parse(value) as StructuredQualificationPayload;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function formatDateRange(startDate: string | null | undefined, endDate: string | null | undefined, isCurrentRole?: boolean): string {
  const start = hasText(startDate) ? startDate : "";
  const end = isCurrentRole ? "Present" : hasText(endDate) ? endDate : "";

  if (start && end) return `${start} - ${end}`;
  if (start) return start;
  if (end) return end;
  return "";
}

function hasMeaningfulWorkRows(rows: WorkExperienceRow[]): boolean {
  return rows.some((row) => [row.jobTitle, row.company, row.location, row.period, row.details].some(hasText));
}

function hasMeaningfulEducationRows(rows: EducationRow[]): boolean {
  return rows.some((row) => [row.degree, row.school, row.location, row.years].some(hasText));
}

function hasMeaningfulSkillRows(rows: SkillRow[]): boolean {
  return rows.some((row) => [row.skill, row.proficiency, row.lastUsed].some(hasText));
}

function hasMeaningfulLanguageRows(rows: LanguageRow[]): boolean {
  return rows.some((row) => [row.language, row.level].some(hasText));
}

function hasMeaningfulCertificationRows(rows: CertificationRow[]): boolean {
  return rows.some((row) => [row.name, row.issuer, row.year].some(hasText));
}

/**
 * Parse qualifications by category and extract relevant data
 */
function parseQualifications(qualifications: Array<{ category: string; value: string }>) {
  const skills: SkillRow[] = [];
  const certifications: CertificationRow[] = [];
  const education: EducationRow[] = [];
  const languages: LanguageRow[] = [];
  const workExperience: WorkExperienceRow[] = [];

  for (const qual of qualifications) {
    if (qual.category === "skill") {
      // Format: "React (expert) - 8 yrs"
      const match = qual.value.match(/^(.+?)(?:\s*\((.+?)\))?(?:\s*-\s*(\d+)\s*yrs?)?$/);
      if (match) {
        skills.push({
          skill: match[1]?.trim() || qual.value,
          proficiency: match[2]?.trim() || "",
          lastUsed: match[3] ? `${match[3]} years` : "",
        });
      } else {
        skills.push({ skill: qual.value, proficiency: "", lastUsed: "" });
      }
    } else if (qual.category === "language") {
      const parsed = parseStructuredQualification(qual.value);
      if (parsed && hasText(parsed.language)) {
        languages.push({
          language: parsed.language,
          level: parsed.proficiency ?? ""
        });
      } else {
        languages.push({
          language: qual.value,
          level: ""
        });
      }
    } else if (qual.category === "certification") {
      const parsed = parseStructuredQualification(qual.value);
      if (parsed && hasText(parsed.name)) {
        certifications.push({
          name: parsed.name,
          issuer: parsed.issuer ?? "",
          year: parsed.date ?? parsed.expiryDate ?? ""
        });
        continue;
      }

      // Format: "AWS Certified - Amazon (2023)"
      const match = qual.value.match(/^(.+?)(?:\s*-\s*(.+?))?(?:\s*\((.+?)\))?$/);
      if (match) {
        certifications.push({
          name: match[1]?.trim() || qual.value,
          issuer: match[2]?.trim() || "",
          year: match[3]?.trim() || "",
        });
      } else {
        certifications.push({ name: qual.value, issuer: "", year: "" });
      }
    } else if (qual.category === "diploma") {
      const parsed = parseStructuredQualification(qual.value);
      if (parsed && hasText(parsed.school)) {
        const degreeParts = [parsed.degree, parsed.field ? `in ${parsed.field}` : null].filter(hasText);
        // Use graduationDate as the range end when endDate is missing — otherwise
        // an entry with startDate + graduationDate would render the start year
        // only (formatDateRange returns just the start and the graduationDate
        // fallback never fires), dropping the end year.
        const endForRange = hasText(parsed.endDate) ? parsed.endDate : parsed.graduationDate;
        const dateText = formatDateRange(parsed.startDate, endForRange) || (parsed.graduationDate ?? "");
        education.push({
          school: parsed.school,
          degree: degreeParts.join(" "),
          location: parsed.location ?? "",
          years: parsed.honors ? [dateText, parsed.honors].filter(hasText).join(" · ") : dateText
        });
        continue;
      }

      // Format: "MIT - Master of Science in Computer Science (2018)"
      const match = qual.value.match(/^(.+?)(?:\s*-\s*(.+?))?(?:\s*\((.+?)\))?$/);
      if (match) {
        education.push({
          school: match[1]?.trim() || qual.value,
          degree: match[2]?.trim() || "",
          location: "",
          years: match[3]?.trim() || "",
        });
      } else {
        education.push({ school: qual.value, degree: "", location: "", years: "" });
      }
    } else if (qual.category === "experience") {
      const parsed = parseStructuredQualification(qual.value);
      if (parsed && hasText(parsed.title)) {
        const detailParts = [parsed.description, ...(parsed.achievements ?? [])].filter(hasText);
        workExperience.push({
          jobTitle: parsed.title,
          company: parsed.company ?? "",
          location: parsed.location ?? "",
          period: formatDateRange(parsed.startDate, parsed.endDate, parsed.isCurrentRole),
          details: detailParts.join("\n")
        });
      }
    }
  }

  return { skills, certifications, education, languages, workExperience };
}

type Props = {
  profile: {
    fullName: string | null;
    currentJobSituation: string | null;
    employmentObjective: string | null;
    primaryRole: string | null;
    preferredLocation: string | null;
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
    locale: string;
    editorDraft: Record<string, unknown> | null;
    sectorPreferences?: unknown;
    updatedAt: string;
  };
  qualifications?: Array<{ category: string; value: string }>;
  draftScopeId: string;
};

export function ProfileSummaryCard({ profile, qualifications = [], draftScopeId }: Props): React.ReactElement {
  const t = useTranslations("profile");
  const profileDraftStorageKey = buildProfileDraftStorageKey(draftScopeId);
  const didHydrateRef = useRef(false);
  // Set true right after hydration so the debounced server PATCH below skips the
  // save that hydration itself triggers — otherwise the freshly-loaded (or
  // agent-updated) draft would be written straight back, risking overwriting
  // server-side values with masked/empty ones. Only real user edits should PATCH.
  const skipNextServerSaveRef = useRef(false);
  const [initialFirstName = "", ...lastNameParts] = (profile.fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const initialLastName = lastNameParts.join(" ");
  const [initialCity = "", initialCanton = ""] = (profile.preferredLocation ?? "").split(",").map((item) => item.trim());

  // Parse extracted qualifications
  const {
    skills: extractedSkills,
    certifications: extractedCerts,
    education: extractedEducation,
    languages: extractedLanguages,
    workExperience: extractedWorkExperience
  } = parseQualifications(qualifications);

  const [firstName, setFirstName] = useState<string>(initialFirstName);
  const [lastName, setLastName] = useState<string>(initialLastName);
  const [phone, setPhone] = useState<string>("");
  const [city, setCity] = useState<string>(initialCity);
  const [canton, setCanton] = useState<string>(initialCanton);

  const [profileHeadline, setProfileHeadline] = useState<string>("");
  const [valueProposition, setValueProposition] = useState<string>("");
  const [languageRows, setLanguageRows] = useState<LanguageRow[]>(
    extractedLanguages.length > 0
      ? extractedLanguages
      : [{ language: profile.locale.toUpperCase(), level: "" }]
  );
  const [workExperienceRows, setWorkExperienceRows] = useState<WorkExperienceRow[]>(
    extractedWorkExperience.length > 0
      ? extractedWorkExperience
      : [
          {
            jobTitle: profile.primaryRole ?? "",
            company: "",
            location: profile.preferredLocation ?? "",
            period: "",
            details: ""
          }
        ]
  );
  // Initialize education with extracted data, or empty if none
  const [educationRows, setEducationRows] = useState<EducationRow[]>(
    extractedEducation.length > 0 ? extractedEducation : [{ degree: "", school: "", location: "", years: "" }]
  );
  // Initialize skills with extracted data, or empty if none
  const [skillRows, setSkillRows] = useState<SkillRow[]>(
    extractedSkills.length > 0 ? extractedSkills : [{ skill: "", proficiency: "", lastUsed: "" }]
  );
  // Initialize certifications with extracted data, or empty if none
  const [certificationRows, setCertificationRows] = useState<CertificationRow[]>(
    extractedCerts.length > 0 ? extractedCerts : [{ name: "", issuer: "", year: "" }]
  );
  const [currentJobSituation, setCurrentJobSituation] = useState<string>(profile.currentJobSituation ?? "");
  const [employmentObjective, setEmploymentObjective] = useState<string>(profile.employmentObjective ?? "");

  const [targetRoles, setTargetRoles] = useState<string>(profile.targetRoles ?? "");
  const [targetSeniority, setTargetSeniority] = useState<string>(profile.targetSeniority ?? "");
  const [targetIndustries, setTargetIndustries] = useState<string>(profile.targetIndustries ?? "");
  const [preferredWorkModel, setPreferredWorkModel] = useState<string>(profile.preferredWorkModel ?? "");

  const [contractPreference, setContractPreference] = useState<string>(profile.contractPreference ?? "");
  const [workRate, setWorkRate] = useState<string>(profile.workRate ?? "");
  const [workPermitStatus, setWorkPermitStatus] = useState<string>(profile.workPermitStatus ?? "");
  const [salaryExpectation, setSalaryExpectation] = useState<string>(profile.salaryExpectation ?? "");

  const [visaSponsorship, setVisaSponsorship] = useState<string>(profile.visaSponsorship ?? "");
  const [relocationWillingness, setRelocationWillingness] = useState<string>(profile.relocationWillingness ?? "");
  const [commuteRadius, setCommuteRadius] = useState<string>(profile.commuteRadius ?? "");

  // Dynamic sector-specific fields (D-05): the server-owned defs are read from the
  // persisted store and are stable across renders; only their VALUES are editable.
  const sectorFieldDefs = useMemo(() => readSectorFieldDefs(profile.sectorPreferences), [profile.sectorPreferences]);
  // A non-engineer sector is resolved when there are generated sector fields. For
  // those users the engineer-oriented preference fields (seniority / industries /
  // work model) are hidden; engineer/default keeps the full set.
  const isSectorTailored = sectorFieldDefs.length > 0;
  const [sectorValues, setSectorValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(sectorFieldDefs.map((field) => [field.key, field.value]))
  );

  const updateSectorValue = (key: string, value: string): void => {
    setSectorValues((current) => ({ ...current, [key]: value }));
  };

  const [birthDate, setBirthDate] = useState<string>("");
  const [collapsedSections, setCollapsedSections] = useState<Record<SectionKey, boolean>>({
    headline: false,
    personal: false,
    work: false,
    education: false,
    skills: false,
    languages: false,
    certifications: false,
    preferences: false,
  });

  const addLanguageRow = (): void => {
    setLanguageRows((current) => [
      ...current,
      { language: "", level: "" },
    ]);
  };

  const removeLanguageRow = (index: number): void => {
    setLanguageRows((current) => (current.length > 1 ? current.filter((_, idx) => idx !== index) : current));
  };

  const updateLanguageRow = (index: number, field: keyof LanguageRow, value: string): void => {
    setLanguageRows((current) => current.map((row, idx) => (idx === index ? { ...row, [field]: value } : row)));
  };

  const addWorkExperienceRow = (): void => {
    setWorkExperienceRows((current) => [
      ...current,
      { jobTitle: "", company: "", location: "", period: "", details: "" },
    ]);
  };

  const removeWorkExperienceRow = (index: number): void => {
    setWorkExperienceRows((current) => (current.length > 1 ? current.filter((_, idx) => idx !== index) : current));
  };

  const updateWorkExperienceRow = (
    index: number,
    field: keyof WorkExperienceRow,
    value: string,
  ): void => {
    setWorkExperienceRows((current) => current.map((row, idx) => (idx === index ? { ...row, [field]: value } : row)));
  };

  const addEducationRow = (): void => {
    setEducationRows((current) => [...current, { degree: "", school: "", location: "", years: "" }]);
  };

  const removeEducationRow = (index: number): void => {
    setEducationRows((current) => (current.length > 1 ? current.filter((_, idx) => idx !== index) : current));
  };

  const updateEducationRow = (index: number, field: keyof EducationRow, value: string): void => {
    setEducationRows((current) => current.map((row, idx) => (idx === index ? { ...row, [field]: value } : row)));
  };

  const addSkillRow = (): void => {
    setSkillRows((current) => [...current, { skill: "", proficiency: "", lastUsed: "" }]);
  };

  const removeSkillRow = (index: number): void => {
    setSkillRows((current) => (current.length > 1 ? current.filter((_, idx) => idx !== index) : current));
  };

  const updateSkillRow = (index: number, field: keyof SkillRow, value: string): void => {
    setSkillRows((current) => current.map((row, idx) => (idx === index ? { ...row, [field]: value } : row)));
  };

  const addCertificationRow = (): void => {
    setCertificationRows((current) => [...current, { name: "", issuer: "", year: "" }]);
  };

  const removeCertificationRow = (index: number): void => {
    setCertificationRows((current) => (current.length > 1 ? current.filter((_, idx) => idx !== index) : current));
  };

  const updateCertificationRow = (index: number, field: keyof CertificationRow, value: string): void => {
    setCertificationRows((current) => current.map((row, idx) => (idx === index ? { ...row, [field]: value } : row)));
  };

  const toggleSection = (section: SectionKey): void => {
    setCollapsedSections((current) => ({ ...current, [section]: !current[section] }));
  };

  const sectionToggleArrow = (section: SectionKey): string => (collapsedSections[section] ? "v" : "^");
  const sectionToggleLabel = (section: SectionKey): string =>
    collapsedSections[section] ? t("summaryExpandSection") : t("summaryCollapseSection");

  useEffect(() => {
    try {
      const localDraftRaw = window.localStorage.getItem(profileDraftStorageKey);
      const localDraft = localDraftRaw
        ? (JSON.parse(localDraftRaw) as Partial<ProfileDraft>)
        : ({} as Partial<ProfileDraft>);
      const serverDraft = (profile.editorDraft ?? {}) as Partial<ProfileDraft>;
      const draft = { ...serverDraft, ...localDraft };

      // Freshness reconciliation: if the canonical profile columns were updated
      // more recently than BOTH saved drafts, they were changed out-of-band
      // (e.g. by the Career Guide agent). In that case keep the server-seeded
      // column state and only restore draft-only fields (headline, value prop,
      // phone, birth date) that have no backing column — so agent updates become
      // visible while unsaved contact/headline edits are preserved. (Pitfall:
      // stale local draft masking fresh agent-persisted profile data.)
      const localSavedAt = typeof localDraft._savedAt === "string" ? Date.parse(localDraft._savedAt) : 0;
      const serverSavedAt = typeof serverDraft._savedAt === "string" ? Date.parse(serverDraft._savedAt) : 0;
      const columnsUpdatedAt = Date.parse(profile.updatedAt);
      const preferServerColumns =
        Number.isFinite(columnsUpdatedAt) &&
        columnsUpdatedAt > localSavedAt &&
        columnsUpdatedAt > serverSavedAt;

      // Draft-only fields (no backing column) are restored with this priority:
      // when the agent changed the profile out-of-band (preferServerColumns) the
      // server draft wins; otherwise the most-recently-saved draft wins. In both
      // cases a BLANK value never masks a real one — the client re-stamps its
      // local draft on every visit with empty headline/value-proposition, which
      // would otherwise hide the values the agent just wrote to the server.
      const resolveDraftOnly = (key: keyof ProfileDraft): string | undefined => {
        const localVal = typeof localDraft[key] === "string" ? (localDraft[key] as string) : undefined;
        const serverVal = typeof serverDraft[key] === "string" ? (serverDraft[key] as string) : undefined;
        const [primary, secondary] = preferServerColumns
          ? [serverVal, localVal]
          : localSavedAt >= serverSavedAt
            ? [localVal, serverVal]
            : [serverVal, localVal];
        if (typeof primary === "string" && primary.trim().length > 0) return primary;
        if (typeof secondary === "string" && secondary.trim().length > 0) return secondary;
        return primary ?? secondary;
      };
      const restoredHeadline = resolveDraftOnly("profileHeadline");
      if (typeof restoredHeadline === "string") setProfileHeadline(restoredHeadline);
      const restoredValueProp = resolveDraftOnly("valueProposition");
      if (typeof restoredValueProp === "string") setValueProposition(restoredValueProp);
      const restoredPhone = resolveDraftOnly("phone");
      if (typeof restoredPhone === "string") setPhone(restoredPhone);
      const restoredBirthDate = resolveDraftOnly("birthDate");
      if (typeof restoredBirthDate === "string") setBirthDate(restoredBirthDate);

      if (!preferServerColumns) {
        if (typeof draft.firstName === "string") setFirstName(draft.firstName);
        if (typeof draft.lastName === "string") setLastName(draft.lastName);
        if (typeof draft.city === "string") setCity(draft.city);
        if (typeof draft.canton === "string") setCanton(draft.canton);

        if (Array.isArray(draft.workExperienceRows) && hasMeaningfulWorkRows(draft.workExperienceRows)) setWorkExperienceRows(draft.workExperienceRows);
        if (Array.isArray(draft.educationRows) && hasMeaningfulEducationRows(draft.educationRows)) setEducationRows(draft.educationRows);
        if (Array.isArray(draft.skillRows) && hasMeaningfulSkillRows(draft.skillRows)) setSkillRows(draft.skillRows);
        if (Array.isArray(draft.languageRows) && hasMeaningfulLanguageRows(draft.languageRows)) setLanguageRows(draft.languageRows);
        if (Array.isArray(draft.certificationRows) && hasMeaningfulCertificationRows(draft.certificationRows)) setCertificationRows(draft.certificationRows);

        if (typeof draft.currentJobSituation === "string") setCurrentJobSituation(draft.currentJobSituation);
        if (typeof draft.employmentObjective === "string") setEmploymentObjective(draft.employmentObjective);
        if (typeof draft.targetRoles === "string") setTargetRoles(draft.targetRoles);
        if (typeof draft.targetSeniority === "string") setTargetSeniority(draft.targetSeniority);
        if (typeof draft.targetIndustries === "string") setTargetIndustries(draft.targetIndustries);
        if (typeof draft.preferredWorkModel === "string") setPreferredWorkModel(draft.preferredWorkModel);
        if (typeof draft.contractPreference === "string") setContractPreference(draft.contractPreference);
        if (typeof draft.workRate === "string") setWorkRate(draft.workRate);
        if (typeof draft.workPermitStatus === "string") setWorkPermitStatus(draft.workPermitStatus);
        if (typeof draft.salaryExpectation === "string") setSalaryExpectation(draft.salaryExpectation);
        if (typeof draft.visaSponsorship === "string") setVisaSponsorship(draft.visaSponsorship);
        if (typeof draft.relocationWillingness === "string") setRelocationWillingness(draft.relocationWillingness);
        if (typeof draft.commuteRadius === "string") setCommuteRadius(draft.commuteRadius);
        if (draft.sectorPreferences && Array.isArray(draft.sectorPreferences.fields)) {
          const restored: Record<string, string> = {};
          for (const field of draft.sectorPreferences.fields) {
            if (field && typeof field.key === "string" && typeof field.value === "string") {
              restored[field.key] = field.value;
            }
          }
          if (Object.keys(restored).length > 0) {
            setSectorValues((current) => ({ ...current, ...restored }));
          }
        }
      }
      didHydrateRef.current = true;
      skipNextServerSaveRef.current = true;
    } catch {
      // Ignore malformed local drafts and continue with defaults.
      didHydrateRef.current = true;
    }
  }, [profile.editorDraft, profile.updatedAt, profileDraftStorageKey]);

  useEffect(() => {
    const draft: ProfileDraft = {
      profileHeadline,
      valueProposition,
      firstName,
      lastName,
      phone,
      city,
      canton,
      birthDate,
      workExperienceRows,
      educationRows,
      skillRows,
      languageRows,
      certificationRows,
      currentJobSituation,
      employmentObjective,
      targetRoles,
      targetSeniority,
      targetIndustries,
      preferredWorkModel,
      contractPreference,
      workRate,
      workPermitStatus,
      salaryExpectation,
      visaSponsorship,
      relocationWillingness,
      commuteRadius,
      sectorPreferences:
        sectorFieldDefs.length > 0
          ? { fields: sectorFieldDefs.map((field) => ({ key: field.key, value: sectorValues[field.key] ?? "" })) }
          : undefined,
      _savedAt: new Date().toISOString()
    };

    window.localStorage.setItem(profileDraftStorageKey, JSON.stringify(draft));
  }, [
    profileDraftStorageKey,
    profileHeadline,
    valueProposition,
    firstName,
    lastName,
    phone,
    city,
    canton,
    birthDate,
    workExperienceRows,
    educationRows,
    skillRows,
    languageRows,
    certificationRows,
    currentJobSituation,
    employmentObjective,
    targetRoles,
    targetSeniority,
    targetIndustries,
    preferredWorkModel,
    contractPreference,
    workRate,
    workPermitStatus,
    salaryExpectation,
    visaSponsorship,
    relocationWillingness,
    commuteRadius,
    sectorFieldDefs,
    sectorValues,
  ]);

  useEffect(() => {
    if (!didHydrateRef.current) {
      return;
    }
    // Don't persist the state changes produced by hydration itself — only real
    // user edits. This prevents a masked/empty draft from clobbering the values
    // the Career Guide agent wrote to the server.
    if (skipNextServerSaveRef.current) {
      skipNextServerSaveRef.current = false;
      return;
    }

    const draft: ProfileDraft = {
      profileHeadline,
      valueProposition,
      firstName,
      lastName,
      phone,
      city,
      canton,
      birthDate,
      workExperienceRows,
      educationRows,
      skillRows,
      languageRows,
      certificationRows,
      currentJobSituation,
      employmentObjective,
      targetRoles,
      targetSeniority,
      targetIndustries,
      preferredWorkModel,
      contractPreference,
      workRate,
      workPermitStatus,
      salaryExpectation,
      visaSponsorship,
      relocationWillingness,
      commuteRadius,
      sectorPreferences:
        sectorFieldDefs.length > 0
          ? { fields: sectorFieldDefs.map((field) => ({ key: field.key, value: sectorValues[field.key] ?? "" })) }
          : undefined
    };

    const timeoutId = window.setTimeout(() => {
      void fetch("/api/profile/summary", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(draft)
      }).catch(() => {
        // Keep local editing responsive even if background persistence fails.
      });
    }, 600);

    return () => window.clearTimeout(timeoutId);
  }, [
    profileHeadline,
    valueProposition,
    firstName,
    lastName,
    phone,
    city,
    canton,
    birthDate,
    workExperienceRows,
    educationRows,
    skillRows,
    languageRows,
    certificationRows,
    currentJobSituation,
    employmentObjective,
    targetRoles,
    targetSeniority,
    targetIndustries,
    preferredWorkModel,
    contractPreference,
    workRate,
    workPermitStatus,
    salaryExpectation,
    visaSponsorship,
    relocationWillingness,
    commuteRadius,
    sectorFieldDefs,
    sectorValues
  ]);

  return (
    <article className="img3-panel">
      <form className="profile-sections" onSubmit={(event) => event.preventDefault()}>
        <section className="profile-section-card">
          <div className="profile-section-head">
            <h2 className="profile-section-title">{t("summarySectionHeadline")}</h2>
            <button
              type="button"
              className="profile-section-toggle"
              onClick={() => toggleSection("headline")}
              aria-label={sectionToggleLabel("headline")}
              title={sectionToggleLabel("headline")}
            >
              {sectionToggleArrow("headline")}
            </button>
          </div>
          {!collapsedSections.headline && <div className="profile-fields-grid">
            <p className="img3-note profile-field-full">{t("summaryHeadlineNote")}</p>
            <label className="profile-field-full">
              {t("summaryHeadline")}
              <input
                type="text"
                value={profileHeadline}
                onChange={(event) => setProfileHeadline(event.target.value)}
                placeholder={t("summaryHeadlinePlaceholder")}
              />
            </label>
            <label className="profile-field-full">
              {t("summaryValueProposition")}
              <textarea
                value={valueProposition}
                onChange={(event) => setValueProposition(event.target.value)}
                placeholder={t("summaryValuePropositionPlaceholder")}
              />
            </label>
          </div>}
        </section>

        <section className="profile-section-card">
          <div className="profile-section-head">
            <h2 className="profile-section-title">{t("summarySectionPersonal")}</h2>
            <button
              type="button"
              className="profile-section-toggle"
              onClick={() => toggleSection("personal")}
              aria-label={sectionToggleLabel("personal")}
              title={sectionToggleLabel("personal")}
            >
              {sectionToggleArrow("personal")}
            </button>
          </div>
          {!collapsedSections.personal && <div className="profile-fields-grid">
            <label>
              {t("summaryFirstName")}
              <input type="text" value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder={t("summaryFirstName")} />
            </label>
            <label>
              {t("summaryLastName")}
              <input type="text" value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder={t("summaryLastName")} />
            </label>
            <label>
              {t("summaryPhone")}
              <input type="text" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder={t("summaryPhone")} />
            </label>
            <label>
              {t("summaryCity")}
              <input type="text" value={city} onChange={(event) => setCity(event.target.value)} placeholder={t("summaryCity")} />
            </label>
            <label>
              {t("summaryCanton")}
              <input type="text" value={canton} onChange={(event) => setCanton(event.target.value)} placeholder={t("summaryCanton")} />
            </label>
            <label>
              {t("summaryBirthDate")}
              <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
            </label>
          </div>}
        </section>

        <section className="profile-section-card">
          <div className="profile-section-head">
            <h2 className="profile-section-title">{t("summarySectionWork")}</h2>
            <button
              type="button"
              className="profile-section-toggle"
              onClick={() => toggleSection("work")}
              aria-label={sectionToggleLabel("work")}
              title={sectionToggleLabel("work")}
            >
              {sectionToggleArrow("work")}
            </button>
          </div>
          {!collapsedSections.work && <div className="profile-repeatable-list">
            {workExperienceRows.map((row, index) => (
              <div className="profile-repeatable-item" key={`work-experience-row-${index}`}>
                <div className="profile-repeatable-grid">
                  <label>
                    {t("summaryJobTitle")}
                    <input
                      type="text"
                      value={row.jobTitle}
                      onChange={(event) => updateWorkExperienceRow(index, "jobTitle", event.target.value)}
                      placeholder={t("summaryJobTitle")}
                    />
                  </label>
                  <label>
                    {t("summaryCompany")}
                    <input
                      type="text"
                      value={row.company}
                      onChange={(event) => updateWorkExperienceRow(index, "company", event.target.value)}
                      placeholder={t("summaryCompany")}
                    />
                  </label>
                  <label>
                    {t("summaryLocation")}
                    <input
                      type="text"
                      value={row.location}
                      onChange={(event) => updateWorkExperienceRow(index, "location", event.target.value)}
                      placeholder={t("summaryLocation")}
                    />
                  </label>
                  <label>
                    {t("summaryPeriod")}
                    <input
                      type="text"
                      value={row.period}
                      onChange={(event) => updateWorkExperienceRow(index, "period", event.target.value)}
                      placeholder={t("summaryPeriodPlaceholder")}
                    />
                  </label>
                  <label className="profile-field-full">
                    {t("summaryResponsibilities")}
                    <textarea
                      value={row.details}
                      onChange={(event) => updateWorkExperienceRow(index, "details", event.target.value)}
                      placeholder={t("summaryResponsibilitiesPlaceholder")}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="profile-mini-action"
                  onClick={() => removeWorkExperienceRow(index)}
                  disabled={workExperienceRows.length === 1}
                >
                  {t("summaryRemove")}
                </button>
              </div>
            ))}
            <button type="button" className="profile-add-action" onClick={addWorkExperienceRow}>
              {t("summaryAddExperience")}
            </button>
          </div>}
        </section>

        <section className="profile-section-card">
          <div className="profile-section-head">
            <h2 className="profile-section-title">{t("summarySectionEducation")}</h2>
            <button
              type="button"
              className="profile-section-toggle"
              onClick={() => toggleSection("education")}
              aria-label={sectionToggleLabel("education")}
              title={sectionToggleLabel("education")}
            >
              {sectionToggleArrow("education")}
            </button>
          </div>
          {!collapsedSections.education && <div className="profile-repeatable-list">
            {educationRows.map((row, index) => (
              <div className="profile-repeatable-item" key={`education-row-${index}`}>
                <div className="profile-repeatable-grid">
                  <label>
                    {t("summaryDegree")}
                    <input
                      type="text"
                      value={row.degree}
                      onChange={(event) => updateEducationRow(index, "degree", event.target.value)}
                      placeholder={t("summaryDegree")}
                    />
                  </label>
                  <label>
                    {t("summarySchool")}
                    <input
                      type="text"
                      value={row.school}
                      onChange={(event) => updateEducationRow(index, "school", event.target.value)}
                      placeholder={t("summarySchool")}
                    />
                  </label>
                  <label>
                    {t("summaryLocation")}
                    <input
                      type="text"
                      value={row.location}
                      onChange={(event) => updateEducationRow(index, "location", event.target.value)}
                      placeholder={t("summaryLocation")}
                    />
                  </label>
                  <label>
                    {t("summaryYears")}
                    <input
                      type="text"
                      value={row.years}
                      onChange={(event) => updateEducationRow(index, "years", event.target.value)}
                      placeholder={t("summaryYearsPlaceholder")}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="profile-mini-action"
                  onClick={() => removeEducationRow(index)}
                  disabled={educationRows.length === 1}
                >
                  {t("summaryRemove")}
                </button>
              </div>
            ))}
            <button type="button" className="profile-add-action" onClick={addEducationRow}>
              {t("summaryAddEducation")}
            </button>
          </div>}
        </section>

        <section className="profile-section-card">
          <div className="profile-section-head">
            <h2 className="profile-section-title">{t("summarySectionSkills")}</h2>
            <button
              type="button"
              className="profile-section-toggle"
              onClick={() => toggleSection("skills")}
              aria-label={sectionToggleLabel("skills")}
              title={sectionToggleLabel("skills")}
            >
              {sectionToggleArrow("skills")}
            </button>
          </div>
          {!collapsedSections.skills && <div className="profile-repeatable-list">
            {skillRows.map((row, index) => (
              <div className="profile-repeatable-item" key={`skill-row-${index}`}>
                <div className="profile-repeatable-grid">
                  <label className="profile-field-full">
                    {t("summarySkill")}
                    <input
                      type="text"
                      value={row.skill}
                      onChange={(event) => updateSkillRow(index, "skill", event.target.value)}
                      placeholder={t("summarySkill")}
                    />
                  </label>
                  <label>
                    {t("summaryProficiency")}
                    <input
                      type="text"
                      value={row.proficiency}
                      onChange={(event) => updateSkillRow(index, "proficiency", event.target.value)}
                      placeholder={t("summaryProficiencyPlaceholder")}
                    />
                  </label>
                  <label>
                    {t("summaryLastUsed")}
                    <input
                      type="text"
                      value={row.lastUsed}
                      onChange={(event) => updateSkillRow(index, "lastUsed", event.target.value)}
                      placeholder={t("summaryLastUsedPlaceholder")}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="profile-mini-action"
                  onClick={() => removeSkillRow(index)}
                  disabled={skillRows.length === 1}
                >
                  {t("summaryRemove")}
                </button>
              </div>
            ))}
            <button type="button" className="profile-add-action" onClick={addSkillRow}>
              {t("summaryAddSkill")}
            </button>
          </div>}
        </section>

        <section className="profile-section-card">
          <div className="profile-section-head">
            <h2 className="profile-section-title">{t("summarySectionLanguages")}</h2>
            <button
              type="button"
              className="profile-section-toggle"
              onClick={() => toggleSection("languages")}
              aria-label={sectionToggleLabel("languages")}
              title={sectionToggleLabel("languages")}
            >
              {sectionToggleArrow("languages")}
            </button>
          </div>
          {!collapsedSections.languages && <div className="profile-repeatable-list">
            {languageRows.map((row, index) => (
              <div className="profile-repeatable-item" key={`language-row-${index}`}>
                <div className="profile-repeatable-grid">
                  <label>
                    {t("summaryLanguage")}
                    <input
                      type="text"
                      value={row.language}
                      onChange={(event) => updateLanguageRow(index, "language", event.target.value)}
                      placeholder={t("summaryLanguage")}
                    />
                  </label>
                  <label>
                    {t("summaryLevel")}
                    <input
                      type="text"
                      value={row.level}
                      onChange={(event) => updateLanguageRow(index, "level", event.target.value)}
                      placeholder={t("summaryLevelPlaceholder")}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="profile-mini-action"
                  onClick={() => removeLanguageRow(index)}
                  disabled={languageRows.length === 1}
                >
                  {t("summaryRemove")}
                </button>
              </div>
            ))}
            <button type="button" className="profile-add-action" onClick={addLanguageRow}>
              {t("summaryAddLanguage")}
            </button>
          </div>}
        </section>

        <section className="profile-section-card">
          <div className="profile-section-head">
            <h2 className="profile-section-title">{t("summarySectionCertifications")}</h2>
            <button
              type="button"
              className="profile-section-toggle"
              onClick={() => toggleSection("certifications")}
              aria-label={sectionToggleLabel("certifications")}
              title={sectionToggleLabel("certifications")}
            >
              {sectionToggleArrow("certifications")}
            </button>
          </div>
          {!collapsedSections.certifications && <div className="profile-repeatable-list">
            {certificationRows.map((row, index) => (
              <div className="profile-repeatable-item" key={`certification-row-${index}`}>
                <div className="profile-repeatable-grid">
                  <label>
                    {t("summaryCertification")}
                    <input
                      type="text"
                      value={row.name}
                      onChange={(event) => updateCertificationRow(index, "name", event.target.value)}
                      placeholder={t("summaryCertification")}
                    />
                  </label>
                  <label>
                    {t("summaryIssuer")}
                    <input
                      type="text"
                      value={row.issuer}
                      onChange={(event) => updateCertificationRow(index, "issuer", event.target.value)}
                      placeholder={t("summaryIssuer")}
                    />
                  </label>
                  <label>
                    {t("summaryYear")}
                    <input
                      type="text"
                      value={row.year}
                      onChange={(event) => updateCertificationRow(index, "year", event.target.value)}
                      placeholder={t("summaryYear")}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="profile-mini-action"
                  onClick={() => removeCertificationRow(index)}
                  disabled={certificationRows.length === 1}
                >
                  {t("summaryRemove")}
                </button>
              </div>
            ))}
            <button type="button" className="profile-add-action" onClick={addCertificationRow}>
              {t("summaryAddCertification")}
            </button>
          </div>}
        </section>

        <section className="profile-section-card">
          <div className="profile-section-head">
            <h2 className="profile-section-title">{t("summarySectionPreferences")}</h2>
            <button
              type="button"
              className="profile-section-toggle"
              onClick={() => toggleSection("preferences")}
              aria-label={sectionToggleLabel("preferences")}
              title={sectionToggleLabel("preferences")}
            >
              {sectionToggleArrow("preferences")}
            </button>
          </div>
          {!collapsedSections.preferences && <div className="profile-fields-grid">
            <label>
              {t("summaryCurrentSituation")}
              <input type="text" value={currentJobSituation} onChange={(event) => setCurrentJobSituation(event.target.value)} placeholder={t("summaryCurrentSituation")} />
            </label>
            <label>
              {t("summaryEmploymentObjective")}
              <input type="text" value={employmentObjective} onChange={(event) => setEmploymentObjective(event.target.value)} placeholder={t("summaryEmploymentObjective")} />
            </label>
            <label>
              {t("summaryTargetRoles")}
              <input
                type="text"
                value={targetRoles}
                onChange={(event) => setTargetRoles(event.target.value)}
                placeholder={t("summaryTargetRolesPlaceholder")}
              />
            </label>
            {!isSectorTailored && (
              <>
                <label>
                  {t("summaryTargetSeniority")}
                  <input
                    type="text"
                    value={targetSeniority}
                    onChange={(event) => setTargetSeniority(event.target.value)}
                    placeholder={t("summaryTargetSeniorityPlaceholder")}
                  />
                </label>
                <label>
                  {t("summaryTargetIndustries")}
                  <input
                    type="text"
                    value={targetIndustries}
                    onChange={(event) => setTargetIndustries(event.target.value)}
                    placeholder={t("summaryTargetIndustriesPlaceholder")}
                  />
                </label>
                <label>
                  {t("summaryPreferredWorkModel")}
                  <input
                    type="text"
                    value={preferredWorkModel}
                    onChange={(event) => setPreferredWorkModel(event.target.value)}
                    placeholder={t("summaryPreferredWorkModelPlaceholder")}
                  />
                </label>
              </>
            )}
            <label>
              {t("summaryContract")}
              <input type="text" value={contractPreference} onChange={(event) => setContractPreference(event.target.value)} placeholder={t("summaryContract")} />
            </label>
            <label>
              {t("summaryWorkRate")}
              <input type="text" value={workRate} onChange={(event) => setWorkRate(event.target.value)} placeholder={t("summaryWorkRate")} />
            </label>
            <label>
              {t("summaryPermit")}
              <input type="text" value={workPermitStatus} onChange={(event) => setWorkPermitStatus(event.target.value)} placeholder={t("summaryPermit")} />
            </label>
            <label>
              {t("summarySalary")}
              <input type="text" value={salaryExpectation} onChange={(event) => setSalaryExpectation(event.target.value)} placeholder={t("summaryOptional")} />
            </label>
            <label>
              {t("summaryCommuteRadius")}
              <input
                type="text"
                value={commuteRadius}
                onChange={(event) => setCommuteRadius(event.target.value)}
                placeholder={t("summaryCommuteRadiusPlaceholder")}
              />
            </label>
          </div>}
          {!collapsedSections.preferences && sectorFieldDefs.length > 0 && (
            <div className="profile-fields-grid">
              {sectorFieldDefs.map((field) => {
                const currentValue = sectorValues[field.key] ?? "";
                const isCustom = currentValue.length > 0 && !field.options.some((option) => option.value === currentValue);
                return (
                  <label key={field.key}>
                    {field.label}
                    <select value={currentValue} onChange={(event) => updateSectorValue(field.key, event.target.value)}>
                      <option value="">{t("summaryOptional")}</option>
                      {field.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                      {isCustom && <option value={currentValue}>{currentValue}</option>}
                    </select>
                    <input
                      type="text"
                      value={isCustom ? currentValue : ""}
                      onChange={(event) => updateSectorValue(field.key, event.target.value)}
                      placeholder={t("summaryOptional")}
                    />
                  </label>
                );
              })}
            </div>
          )}
        </section>
      </form>
    </article>
  );
}
