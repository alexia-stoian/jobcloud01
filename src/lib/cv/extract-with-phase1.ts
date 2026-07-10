import { extractCvPhase1, type ExtractedCvPhase1 } from "./extract-phase1";
import { z } from "zod";

/**
 * Bridge between Phase 1 comprehensive extraction and existing profile structure
 * Maps Phase 1 detailed extraction back to CandidateProfile fields
 */

export type ExtractedCvFacts = {
  fullName: string | null;
  primaryRole: string | null;
  currentJobSituation: string | null;
  employmentObjective: string | null;
  preferredLocation: string | null;
  contractPreference: string | null;
  workRate: string | null;
  workPermitStatus: string | null;
  salaryExpectation: string | null;
  qualifications: Array<{
    category: "skill" | "language" | "diploma" | "certification" | "experience" | "qualification";
    value: string;
  }>;
};

export type ExtractedCvResult = {
  facts: ExtractedCvFacts;
  uncertainFacts: Record<string, string>;
  phase1: ExtractedCvPhase1; // Include full Phase 1 data for future use
};

/**
 * Convert Phase 1 detailed extraction to legacy format
 * Preserves all data while maintaining backward compatibility
 */
function bridgePhase1ToLegacy(phase1: ExtractedCvPhase1): ExtractedCvFacts {
  // Determine primary role: use most recent work experience title
  const primaryRole = phase1.workExperience.length > 0 ? phase1.workExperience[0].title : null;

  // Convert all skills, certs, education to qualifications
  const qualifications: Array<{
    category: "skill" | "language" | "diploma" | "certification" | "experience" | "qualification";
    value: string;
  }> = [];

  // Add skills
  for (const skill of phase1.skills) {
    if (skill.category === "language") {
      qualifications.push({
        category: "language",
        value: JSON.stringify({
          language: skill.name,
          proficiency: skill.proficiency,
          yearsOfExperience: skill.yearsOfExperience
        })
      });
      continue;
    }

    let value = skill.name;
    if (skill.proficiency) value += ` (${skill.proficiency})`;
    if (skill.yearsOfExperience !== null) value += ` - ${skill.yearsOfExperience} yrs`;

    qualifications.push({
      category: "skill",
      value
    });
  }

  // Add certifications
  for (const cert of phase1.certifications) {
    qualifications.push({
      category: "certification",
      value: JSON.stringify({
        name: cert.name,
        issuer: cert.issuer,
        date: cert.date,
        expiryDate: cert.expiryDate,
        credentialId: cert.credentialId
      })
    });
  }

  // Add education
  for (const edu of phase1.education) {
    qualifications.push({
      category: "diploma",
      value: JSON.stringify({
        school: edu.school,
        location: edu.location,
        degree: edu.degree,
        field: edu.field,
        startDate: edu.startDate,
        endDate: edu.endDate,
        graduationDate: edu.graduationDate,
        honors: edu.honors
      })
    });
  }

  for (const work of phase1.workExperience) {
    qualifications.push({
      category: "experience",
      value: JSON.stringify({
        company: work.company,
        title: work.title,
        location: work.location,
        startDate: work.startDate,
        endDate: work.endDate,
        isCurrentRole: work.isCurrentRole,
        description: work.description,
        achievements: work.achievements
      })
    });
  }

  return {
    fullName: phase1.fullName,
    primaryRole,
    currentJobSituation: phase1.currentJobSituation,
    employmentObjective: phase1.employmentObjective,
    preferredLocation: phase1.preferredLocation,
    contractPreference: phase1.contractPreference,
    workRate: phase1.workRate,
    workPermitStatus: phase1.workPermitStatus,
    salaryExpectation: phase1.salaryExpectation,
    qualifications
  };
}

/**
 * Analyze extraction confidence and identify gaps
 */
function analyzeConfidenceAndGaps(phase1: ExtractedCvPhase1): Record<string, string> {
  const uncertainFacts: Record<string, string> = {};

  // Profile gaps
  if (!phase1.fullName) uncertainFacts.fullName = "Name not found in CV.";
  if (!phase1.email) uncertainFacts.email = "Email address not found.";
  if (!phase1.phone) uncertainFacts.phone = "Phone number not found.";

  // Work history
  if (phase1.workExperience.length === 0) {
    uncertainFacts.workHistory = "No work experience found.";
  } else {
    const lowConfidence = phase1.workExperience.filter((w) => w.confidence < 0.7);
    if (lowConfidence.length > 0) {
      uncertainFacts.workHistoryConfidence = `${lowConfidence.length} work experience entries have low confidence.`;
    }
  }

  // Education
  if (phase1.education.length === 0) {
    uncertainFacts.education = "No education history found.";
  }

  // Skills
  if (phase1.skills.length === 0) {
    uncertainFacts.skills = "No skills found. CV may lack a skills section.";
  } else {
    const noProf = phase1.skills.filter((s) => !s.proficiency);
    if (noProf.length > phase1.skills.length * 0.5) {
      uncertainFacts.skillProficiency = `${noProf.length} skills lack proficiency levels.`;
    }
  }

  // Certifications
  if (phase1.certifications.length === 0) {
    uncertainFacts.certifications = "No certifications found.";
  }

  // Profile preferences
  if (!phase1.currentJobSituation) uncertainFacts.currentJobSituation = "Employment situation not stated.";
  if (!phase1.preferredLocation) uncertainFacts.preferredLocation = "Preferred work location not specified.";
  if (!phase1.workRate) uncertainFacts.workRate = "Work rate/availability not mentioned.";
  if (!phase1.workPermitStatus) uncertainFacts.workPermitStatus = "Work permit status not provided.";
  if (!phase1.salaryExpectation) uncertainFacts.salaryExpectation = "Salary expectation not mentioned.";

  return uncertainFacts;
}

/**
 * Main extraction function using Phase 1 multi-section approach
 */
export async function extractCvFacts(cvText: string): Promise<ExtractedCvResult> {
  console.log("[CV Extraction] Starting Phase 1 comprehensive extraction");
  console.log("[CV Extraction] CV text length:", cvText.length);

  const phase1 = await extractCvPhase1(cvText);

  console.log("[CV Extraction] Phase 1 completed");
  console.log("[CV Extraction] Work experience count:", phase1.workExperience.length);
  console.log("[CV Extraction] Education count:", phase1.education.length);
  console.log("[CV Extraction] Skills count:", phase1.skills.length);
  console.log("[CV Extraction] Certifications count:", phase1.certifications.length);

  const facts = bridgePhase1ToLegacy(phase1);
  const uncertainFacts = analyzeConfidenceAndGaps(phase1);

  console.log("[CV Extraction] Bridge to legacy complete");
  console.log("[CV Extraction] Full name extracted:", facts.fullName);
  console.log("[CV Extraction] Primary role extracted:", facts.primaryRole);
  console.log("[CV Extraction] Total qualifications extracted:", facts.qualifications.length);

  return {
    facts,
    uncertainFacts,
    phase1
  };
}

export const cvUploadRequestSchema = z.object({
  cvText: z.string().min(20),
  fileName: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional(),
  locale: z.enum(["en", "de", "fr"]).default("en")
});
