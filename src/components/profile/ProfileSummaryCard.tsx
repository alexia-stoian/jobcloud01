"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type LanguageRow = {
  language: string;
  proficiencyStandard: string;
  level: string;
  usageContext: string;
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

type SectionKey =
  | "headline"
  | "personal"
  | "work"
  | "education"
  | "skills"
  | "languages"
  | "certifications"
  | "preferences";

type Props = {
  profile: {
    fullName: string | null;
    currentJobSituation: string | null;
    employmentObjective: string | null;
    primaryRole: string | null;
    preferredLocation: string | null;
    contractPreference: string | null;
    workRate: string | null;
    workPermitStatus: string | null;
    salaryExpectation: string | null;
    locale: string;
  };
};

export function ProfileSummaryCard({ profile }: Props): React.ReactElement {
  const t = useTranslations("profile");
  const [firstName = "", ...lastNameParts] = (profile.fullName ?? "").trim().split(/\s+/).filter(Boolean);
  const lastName = lastNameParts.join(" ");
  const [city = "", canton = ""] = (profile.preferredLocation ?? "").split(",").map((item) => item.trim());
  const [profileHeadline, setProfileHeadline] = useState<string>("");
  const [valueProposition, setValueProposition] = useState<string>("");
  const [languageRows, setLanguageRows] = useState<LanguageRow[]>([
    { language: profile.locale.toUpperCase(), proficiencyStandard: "", level: "", usageContext: "" },
  ]);
  const [workExperienceRows, setWorkExperienceRows] = useState<WorkExperienceRow[]>([
    {
      jobTitle: profile.primaryRole ?? "",
      company: "",
      location: profile.preferredLocation ?? "",
      period: "",
      details: "",
    },
  ]);
  const [educationRows, setEducationRows] = useState<EducationRow[]>([
    { degree: "", school: "", location: "", years: "" },
  ]);
  const [skillRows, setSkillRows] = useState<SkillRow[]>([{ skill: "", proficiency: "", lastUsed: "" }]);
  const [certificationRows, setCertificationRows] = useState<CertificationRow[]>([
    { name: "", issuer: "", year: "" },
  ]);
  const [targetRoles, setTargetRoles] = useState<string>("");
  const [targetSeniority, setTargetSeniority] = useState<string>("");
  const [targetIndustries, setTargetIndustries] = useState<string>("");
  const [preferredWorkModel, setPreferredWorkModel] = useState<string>("");
  const [workAuthorization, setWorkAuthorization] = useState<string>("");
  const [visaSponsorship, setVisaSponsorship] = useState<string>("");
  const [relocationWillingness, setRelocationWillingness] = useState<string>("");
  const [commuteRadius, setCommuteRadius] = useState<string>("");

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
      { language: "", proficiencyStandard: "", level: "", usageContext: "" },
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
    collapsedSections[section] ? "Expand section" : "Collapse section";

  return (
    <article className="img3-panel">
      <form className="profile-sections" onSubmit={(event) => event.preventDefault()}>
        <section className="profile-section-card">
          <div className="profile-section-head">
            <h2 className="profile-section-title">Professional headline</h2>
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
            <p className="img3-note profile-field-full">These fields can also be filled automatically by the Career Guide agent.</p>
            <label className="profile-field-full">
              Headline
              <input
                type="text"
                value={profileHeadline}
                onChange={(event) => setProfileHeadline(event.target.value)}
                placeholder="e.g. Senior Product Designer focused on growth"
              />
            </label>
            <label className="profile-field-full">
              Value proposition
              <textarea
                value={valueProposition}
                onChange={(event) => setValueProposition(event.target.value)}
                placeholder="One short statement on what you consistently deliver"
              />
            </label>
          </div>}
        </section>

        <section className="profile-section-card">
          <div className="profile-section-head">
            <h2 className="profile-section-title">Personal information</h2>
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
              First name
              <input type="text" defaultValue={firstName} placeholder="First name" />
            </label>
            <label>
              Last name
              <input type="text" defaultValue={lastName} placeholder="Last name" />
            </label>
            <label>
              Phone
              <input type="text" defaultValue="" placeholder="Phone" />
            </label>
            <label>
              City
              <input type="text" defaultValue={city} placeholder="City" />
            </label>
            <label>
              Canton
              <input type="text" defaultValue={canton} placeholder="Canton" />
            </label>
            <label>
              Birth date
              <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
            </label>
          </div>}
        </section>

        <section className="profile-section-card">
          <div className="profile-section-head">
            <h2 className="profile-section-title">Work experience</h2>
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
                    Job title
                    <input
                      type="text"
                      value={row.jobTitle}
                      onChange={(event) => updateWorkExperienceRow(index, "jobTitle", event.target.value)}
                      placeholder="Job title"
                    />
                  </label>
                  <label>
                    Company
                    <input
                      type="text"
                      value={row.company}
                      onChange={(event) => updateWorkExperienceRow(index, "company", event.target.value)}
                      placeholder="Company"
                    />
                  </label>
                  <label>
                    Location
                    <input
                      type="text"
                      value={row.location}
                      onChange={(event) => updateWorkExperienceRow(index, "location", event.target.value)}
                      placeholder="Location"
                    />
                  </label>
                  <label>
                    Period
                    <input
                      type="text"
                      value={row.period}
                      onChange={(event) => updateWorkExperienceRow(index, "period", event.target.value)}
                      placeholder="e.g. 2022 - Present"
                    />
                  </label>
                  <label className="profile-field-full">
                    Responsibilities / achievements
                    <textarea
                      value={row.details}
                      onChange={(event) => updateWorkExperienceRow(index, "details", event.target.value)}
                      placeholder="Add responsibilities and achievements"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="profile-mini-action"
                  onClick={() => removeWorkExperienceRow(index)}
                  disabled={workExperienceRows.length === 1}
                >
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="profile-add-action" onClick={addWorkExperienceRow}>
              + Add experience
            </button>
          </div>}
        </section>

        <section className="profile-section-card">
          <div className="profile-section-head">
            <h2 className="profile-section-title">Education</h2>
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
                    Degree
                    <input
                      type="text"
                      value={row.degree}
                      onChange={(event) => updateEducationRow(index, "degree", event.target.value)}
                      placeholder="Degree"
                    />
                  </label>
                  <label>
                    School
                    <input
                      type="text"
                      value={row.school}
                      onChange={(event) => updateEducationRow(index, "school", event.target.value)}
                      placeholder="School"
                    />
                  </label>
                  <label>
                    Location
                    <input
                      type="text"
                      value={row.location}
                      onChange={(event) => updateEducationRow(index, "location", event.target.value)}
                      placeholder="Location"
                    />
                  </label>
                  <label>
                    Years
                    <input
                      type="text"
                      value={row.years}
                      onChange={(event) => updateEducationRow(index, "years", event.target.value)}
                      placeholder="e.g. 2018 - 2021"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="profile-mini-action"
                  onClick={() => removeEducationRow(index)}
                  disabled={educationRows.length === 1}
                >
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="profile-add-action" onClick={addEducationRow}>
              + Add education
            </button>
          </div>}
        </section>

        <section className="profile-section-card">
          <div className="profile-section-head">
            <h2 className="profile-section-title">Skills</h2>
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
                    Skill
                    <input
                      type="text"
                      value={row.skill}
                      onChange={(event) => updateSkillRow(index, "skill", event.target.value)}
                      placeholder="Skill"
                    />
                  </label>
                  <label>
                    Proficiency
                    <input
                      type="text"
                      value={row.proficiency}
                      onChange={(event) => updateSkillRow(index, "proficiency", event.target.value)}
                      placeholder="e.g. Beginner, Intermediate, Advanced"
                    />
                  </label>
                  <label>
                    Last used
                    <input
                      type="text"
                      value={row.lastUsed}
                      onChange={(event) => updateSkillRow(index, "lastUsed", event.target.value)}
                      placeholder="e.g. Used in last 12 months"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="profile-mini-action"
                  onClick={() => removeSkillRow(index)}
                  disabled={skillRows.length === 1}
                >
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="profile-add-action" onClick={addSkillRow}>
              + Add skill
            </button>
          </div>}
        </section>

        <section className="profile-section-card">
          <div className="profile-section-head">
            <h2 className="profile-section-title">Languages</h2>
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
                    Language
                    <input
                      type="text"
                      value={row.language}
                      onChange={(event) => updateLanguageRow(index, "language", event.target.value)}
                      placeholder="Language"
                    />
                  </label>
                  <label>
                    Proficiency standard
                    <input
                      type="text"
                      value={row.proficiencyStandard}
                      onChange={(event) => updateLanguageRow(index, "proficiencyStandard", event.target.value)}
                      placeholder="e.g. CEFR"
                    />
                  </label>
                  <label>
                    Level
                    <input
                      type="text"
                      value={row.level}
                      onChange={(event) => updateLanguageRow(index, "level", event.target.value)}
                      placeholder="Level (e.g. Native, C1, B2)"
                    />
                  </label>
                  <label>
                    Usage context
                    <input
                      type="text"
                      value={row.usageContext}
                      onChange={(event) => updateLanguageRow(index, "usageContext", event.target.value)}
                      placeholder="e.g. Daily working language"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="profile-mini-action"
                  onClick={() => removeLanguageRow(index)}
                  disabled={languageRows.length === 1}
                >
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="profile-add-action" onClick={addLanguageRow}>
              + Add language
            </button>
          </div>}
        </section>

        <section className="profile-section-card">
          <div className="profile-section-head">
            <h2 className="profile-section-title">Certifications</h2>
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
                    Certification
                    <input
                      type="text"
                      value={row.name}
                      onChange={(event) => updateCertificationRow(index, "name", event.target.value)}
                      placeholder="Certification"
                    />
                  </label>
                  <label>
                    Issuer
                    <input
                      type="text"
                      value={row.issuer}
                      onChange={(event) => updateCertificationRow(index, "issuer", event.target.value)}
                      placeholder="Issuer"
                    />
                  </label>
                  <label>
                    Year
                    <input
                      type="text"
                      value={row.year}
                      onChange={(event) => updateCertificationRow(index, "year", event.target.value)}
                      placeholder="Year"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="profile-mini-action"
                  onClick={() => removeCertificationRow(index)}
                  disabled={certificationRows.length === 1}
                >
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="profile-add-action" onClick={addCertificationRow}>
              + Add certification
            </button>
          </div>}
        </section>

        <section className="profile-section-card">
          <div className="profile-section-head">
            <h2 className="profile-section-title">Preferences</h2>
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
              <input type="text" defaultValue={profile.currentJobSituation ?? ""} placeholder={t("summaryCurrentSituation")} />
            </label>
            <label>
              {t("summaryEmploymentObjective")}
              <input type="text" defaultValue={profile.employmentObjective ?? ""} placeholder={t("summaryEmploymentObjective")} />
            </label>
            <label>
              Target roles
              <input
                type="text"
                value={targetRoles}
                onChange={(event) => setTargetRoles(event.target.value)}
                placeholder="e.g. Product Manager, Senior Product Manager"
              />
            </label>
            <label>
              Seniority target
              <input
                type="text"
                value={targetSeniority}
                onChange={(event) => setTargetSeniority(event.target.value)}
                placeholder="e.g. Mid, Senior, Lead"
              />
            </label>
            <label>
              Target industries
              <input
                type="text"
                value={targetIndustries}
                onChange={(event) => setTargetIndustries(event.target.value)}
                placeholder="e.g. Fintech, SaaS"
              />
            </label>
            <label>
              Preferred work model
              <input
                type="text"
                value={preferredWorkModel}
                onChange={(event) => setPreferredWorkModel(event.target.value)}
                placeholder="e.g. Hybrid, Remote, On-site"
              />
            </label>
            <label>
              {t("summaryContract")}
              <input type="text" defaultValue={profile.contractPreference ?? ""} placeholder={t("summaryContract")} />
            </label>
            <label>
              {t("summaryWorkRate")}
              <input type="text" defaultValue={profile.workRate ?? ""} placeholder={t("summaryWorkRate")} />
            </label>
            <label>
              {t("summaryPermit")}
              <input type="text" defaultValue={profile.workPermitStatus ?? ""} placeholder={t("summaryPermit")} />
            </label>
            <label>
              {t("summarySalary")}
              <input type="text" defaultValue={profile.salaryExpectation ?? ""} placeholder={t("summaryOptional")} />
            </label>
            <label>
              Work authorization
              <input
                type="text"
                value={workAuthorization}
                onChange={(event) => setWorkAuthorization(event.target.value)}
                placeholder="e.g. Swiss citizen, valid permit B"
              />
            </label>
            <label>
              Visa sponsorship
              <input
                type="text"
                value={visaSponsorship}
                onChange={(event) => setVisaSponsorship(event.target.value)}
                placeholder="e.g. Required / Not required"
              />
            </label>
            <label>
              Relocation willingness
              <input
                type="text"
                value={relocationWillingness}
                onChange={(event) => setRelocationWillingness(event.target.value)}
                placeholder="e.g. Open to relocation within Switzerland"
              />
            </label>
            <label>
              Commute radius
              <input
                type="text"
                value={commuteRadius}
                onChange={(event) => setCommuteRadius(event.target.value)}
                placeholder="e.g. Up to 45 minutes"
              />
            </label>
          </div>}
        </section>
      </form>
    </article>
  );
}
