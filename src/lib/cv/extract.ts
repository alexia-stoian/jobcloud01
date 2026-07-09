import { z } from "zod";

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
  qualifications: Array<{ category: "skill" | "diploma" | "certification" | "qualification"; value: string }>;
};

export type ExtractedCvResult = {
  facts: ExtractedCvFacts;
  uncertainFacts: Record<string, string>;
};

const qualificationKeywords = ["skill", "skills", "certification", "certificate", "diploma", "qualification"];

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return normalizeWhitespace(match[1]);
    }
  }
  return null;
}

function extractQualifications(text: string): Array<{ category: "skill" | "diploma" | "certification" | "qualification"; value: string }> {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const found: Array<{ category: "skill" | "diploma" | "certification" | "qualification"; value: string }> = [];

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    const hasKeyword = qualificationKeywords.some((keyword) => lowerLine.includes(keyword));
    if (!hasKeyword) {
      continue;
    }

    const category = lowerLine.includes("cert")
      ? "certification"
      : lowerLine.includes("diploma")
        ? "diploma"
        : lowerLine.includes("qualif")
          ? "qualification"
          : "skill";
    found.push({ category, value: line.replace(/^[-•*]\s*/, "") });
  }

  return found.slice(0, 8);
}

export function extractCvFacts(cvText: string): ExtractedCvResult {
  const text = normalizeWhitespace(cvText);
  const lowerText = text.toLowerCase();

  const fullName = firstMatch(text, [
    /^name[:\s]+(.+?)(?:\s{2,}|$)/im,
    /^full name[:\s]+(.+?)(?:\s{2,}|$)/im
  ]);

  const primaryRole = firstMatch(text, [
    /^title[:\s]+(.+?)(?:\s{2,}|$)/im,
    /^role[:\s]+(.+?)(?:\s{2,}|$)/im,
    /^current role[:\s]+(.+?)(?:\s{2,}|$)/im,
    /^position[:\s]+(.+?)(?:\s{2,}|$)/im
  ]);

  const currentJobSituation = firstMatch(text, [
    /(employed|unemployed|seeking|open to work|freelance|self[- ]employed|student)/i
  ]);

  const employmentObjective = firstMatch(text, [
    /^objective[:\s]+(.+?)(?:\s{2,}|$)/im,
    /^summary[:\s]+(.+?)(?:\s{2,}|$)/im
  ]);

  const preferredLocation = firstMatch(text, [
    /^location[:\s]+(.+?)(?:\s{2,}|$)/im,
    /^based in[:\s]+(.+?)(?:\s{2,}|$)/im
  ]);

  const contractPreference = firstMatch(text, [
    /(permanent|fixed[- ]term|contract|temporary|internship)/i
  ]);

  const workRate = firstMatch(text, [
    /(100%|[0-9]{1,3}%|full[- ]time|part[- ]time)/i
  ]);

  const workPermitStatus = firstMatch(text, [
    /(swiss citizen|c permit|b permit|l permit|work permit|authorized to work|eligible to work)/i
  ]);

  const salaryExpectation = firstMatch(text, [
    /(\d{2,3}[\'’\d\s]{0,4}(?:chf|eur|usd)|salary expectation[:\s]+.+?)(?:\s{2,}|$)/i
  ]);

  const qualifications = extractQualifications(text);

  const uncertainFacts: Record<string, string> = {};
  if (!fullName) uncertainFacts.fullName = "No explicit name field found.";
  if (!primaryRole) uncertainFacts.primaryRole = "No clear role title found.";
  if (!preferredLocation) uncertainFacts.preferredLocation = "No location field found.";
  if (!workPermitStatus && /permit|work|visa/i.test(lowerText)) {
    uncertainFacts.workPermitStatus = "Permit mentioned, but status is unclear.";
  }

  return {
    facts: {
      fullName,
      primaryRole,
      currentJobSituation,
      employmentObjective,
      preferredLocation,
      contractPreference,
      workRate,
      workPermitStatus,
      salaryExpectation,
      qualifications
    },
    uncertainFacts
  };
}

export const cvUploadRequestSchema = z.object({
  cvText: z.string().min(20),
  fileName: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional(),
  locale: z.enum(["en", "de", "fr"]).default("en")
});
