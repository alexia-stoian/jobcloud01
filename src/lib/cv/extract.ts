import { z } from "zod";
import { env } from "@/lib/env";

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

type AnthropicTextContent = {
  type: "text";
  text: string;
};

type AnthropicResponse = {
  content?: AnthropicTextContent[];
  error?: { message?: string };
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

async function extractWithAnthropic(cvText: string): Promise<ExtractedCvFacts | null> {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim() || env.ANTHROPIC_API_KEY?.trim();
  const anthropicModel = (process.env.ANTHROPIC_MODEL ?? env.ANTHROPIC_MODEL)
    .replace(/["'`\r\n]/g, "")
    .trim();

  if (!anthropicApiKey || !anthropicModel) {
    return null;
  }

  const prompt = `Extract comprehensive CV information from the following text. Return ONLY a valid JSON object with these exact fields (all can be null if not found):
{
  "fullName": "string or null - the person's full name",
  "primaryRole": "string or null - the most recent job title or target role",
  "currentJobSituation": "string or null - employed/unemployed/seeking/freelance/student/self-employed etc",
  "employmentObjective": "string or null - career objective, professional summary, or what they're looking for",
  "preferredLocation": "string or null - city, country, region or area they want to work in",
  "contractPreference": "string or null - permanent/contract/freelance/temporary/internship etc",
  "workRate": "string or null - percentage like 80%, 100%, or part-time/full-time",
  "workPermitStatus": "string or null - Swiss citizen/B permit/C permit/visa status/work authorized etc",
  "salaryExpectation": "string or null - salary range with currency like 120000 CHF or 120k-140k CHF",
  "qualifications": [
    {"category": "skill|diploma|certification|qualification", "value": "string"}
  ]
}

IMPORTANT: Extract ALL skills, certifications, diplomas, languages, tools, programming languages, soft skills, and qualifications mentioned in the CV. Be exhaustive - include everything found.

CV Text:
${cvText}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40000);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: anthropicModel,
        max_tokens: 2500,
        messages: [{ role: "user", content: prompt }]
      }),
      signal: controller.signal,
      cache: "no-store"
    });

    const data = (await response.json()) as AnthropicResponse;
    if (!response.ok) return null;

    const text = data.content?.find((p) => p.type === "text")?.text?.trim();
    if (!text) return null;

    // Extract JSON from response (handle potential markdown fences)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Partial<ExtractedCvFacts>;

    return {
      fullName: parsed.fullName ?? null,
      primaryRole: parsed.primaryRole ?? null,
      currentJobSituation: parsed.currentJobSituation ?? null,
      employmentObjective: parsed.employmentObjective ?? null,
      preferredLocation: parsed.preferredLocation ?? null,
      contractPreference: parsed.contractPreference ?? null,
      workRate: parsed.workRate ?? null,
      workPermitStatus: parsed.workPermitStatus ?? null,
      salaryExpectation: parsed.salaryExpectation ?? null,
      qualifications: Array.isArray(parsed.qualifications)
        ? parsed.qualifications.filter(
            (q): q is { category: "skill" | "diploma" | "certification" | "qualification"; value: string } =>
              q && typeof q === "object" && "category" in q && "value" in q && typeof q.value === "string"
          )
        : []
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function extractCvFacts(cvText: string): Promise<ExtractedCvResult> {
  // Try Anthropic API first for comprehensive extraction
  const aiExtracted = await extractWithAnthropic(cvText);
  if (aiExtracted) {
    const uncertainFacts: Record<string, string> = {};
    if (!aiExtracted.fullName) uncertainFacts.fullName = "Name not extracted from CV.";
    if (!aiExtracted.primaryRole) uncertainFacts.primaryRole = "Current or target role not found in CV.";
    if (!aiExtracted.preferredLocation) uncertainFacts.preferredLocation = "Preferred location not mentioned in CV.";
    if (!aiExtracted.workPermitStatus) uncertainFacts.workPermitStatus = "Work permit status not specified in CV.";
    if (!aiExtracted.salaryExpectation) uncertainFacts.salaryExpectation = "Salary expectation not provided in CV.";

    return {
      facts: aiExtracted,
      uncertainFacts
    };
  }

  // Fallback to regex extraction if API unavailable
  return extractCvFactsFallback(cvText);
}

function extractCvFactsFallback(cvText: string): ExtractedCvResult {
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

  const qualifications = extractQualificationsFallback(text);

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

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return normalizeWhitespace(match[1]);
    }
  }
  return null;
}

function extractQualificationsFallback(text: string): Array<{ category: "skill" | "diploma" | "certification" | "qualification"; value: string }> {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const found: Array<{ category: "skill" | "diploma" | "certification" | "qualification"; value: string }> = [];
  const qualificationKeywords = ["skill", "skills", "certification", "certificate", "diploma", "qualification"];

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

export const cvUploadRequestSchema = z.object({
  cvText: z.string().min(20),
  fileName: z.string().min(1).optional(),
  mimeType: z.string().min(1).optional(),
  locale: z.enum(["en", "de", "fr"]).default("en")
});
