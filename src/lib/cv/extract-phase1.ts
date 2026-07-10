import { env } from "@/lib/env";

// Enhanced data types with structured metadata
export type WorkExperience = {
  company: string | null;
  title: string;
  startDate: string | null;
  endDate: string | null;
  isCurrentRole: boolean;
  description: string | null;
  achievements: string[];
  technologies: string[];
  confidence: number;
};

export type Education = {
  school: string;
  degree: string | null;
  field: string | null;
  startDate: string | null;
  endDate: string | null;
  graduationDate: string | null;
  honors: string | null;
  confidence: number;
};

export type Skill = {
  name: string;
  category: "technical" | "soft" | "language" | "tool" | "framework" | "methodology";
  proficiency: "beginner" | "intermediate" | "advanced" | "expert" | null;
  yearsOfExperience: number | null;
  confidence: number;
};

export type Certification = {
  name: string;
  issuer: string | null;
  date: string | null;
  expiryDate: string | null;
  credentialId: string | null;
  confidence: number;
};

export type ExtractedCvPhase1 = {
  // Profile fields
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  preferredLocation: string | null;
  currentJobSituation: string | null;
  employmentObjective: string | null;
  summary: string | null;

  // Work history
  workExperience: WorkExperience[];

  // Education
  education: Education[];

  // Skills
  skills: Skill[];

  // Certifications
  certifications: Certification[];

  // Additional profile fields
  contractPreference: string | null;
  workRate: string | null;
  workPermitStatus: string | null;
  salaryExpectation: string | null;

  // Metadata
  rawText: string;
  extractedAt: string;
};

type AnthropicTextContent = {
  type: "text";
  text: string;
};

type AnthropicResponse = {
  content?: AnthropicTextContent[];
  error?: { message?: string };
};

async function callAnthropic(prompt: string): Promise<string | null> {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim() || env.ANTHROPIC_API_KEY?.trim();
  const anthropicModel = (process.env.ANTHROPIC_MODEL ?? env.ANTHROPIC_MODEL)
    .replace(/["'`\r\n]/g, "")
    .trim();

  if (!anthropicApiKey || !anthropicModel) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50000);

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
        max_tokens: 3500,
        messages: [{ role: "user", content: prompt }]
      }),
      signal: controller.signal,
      cache: "no-store"
    });

    const data = (await response.json()) as AnthropicResponse;
    if (!response.ok) return null;

    const text = data.content?.find((p) => p.type === "text")?.text?.trim();
    return text ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractWorkHistory(cvText: string): Promise<WorkExperience[]> {
  const prompt = `Extract ALL work experience from this CV text. Return ONLY a valid JSON array.

For each position, extract:
- company: company name
- title: job title
- startDate: YYYY-MM format (e.g., "2020-03")
- endDate: YYYY-MM format or null if current
- isCurrentRole: true if still employed there
- description: 1-2 sentence role description
- achievements: array of 2-4 key accomplishments (quantified if possible, e.g., "Increased sales by 40%")
- technologies: array of specific tools, languages, frameworks used (e.g., "React", "Python", "AWS")
- confidence: 0-1 score for how confident the extraction is

Example output for reference:
[
  {
    "company": "Acme Corp",
    "title": "Senior Product Manager",
    "startDate": "2021-06",
    "endDate": null,
    "isCurrentRole": true,
    "description": "Led product strategy for SaaS platform with 500k+ users. Managed cross-functional team of 8.",
    "achievements": ["Increased user retention by 35%", "Launched 3 major features", "Grew revenue by 2.5x"],
    "technologies": ["Product analytics", "SQL", "Figma", "Jira"],
    "confidence": 0.95
  }
]

Extract everything, even incomplete or older positions. Return ONLY the JSON array, no other text.

CV Text:
${cvText}`;

  return new Promise((resolve) => {
    callAnthropic(prompt).then((result) => {
      if (!result) {
        resolve([]);
        return;
      }
      try {
        const jsonMatch = result.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as WorkExperience[];
          resolve(Array.isArray(parsed) ? parsed : []);
        } else {
          resolve([]);
        }
      } catch {
        resolve([]);
      }
    });
  });
}

function extractEducation(cvText: string): Promise<Education[]> {
  const prompt = `Extract ALL education from this CV text. Return ONLY a valid JSON array.

For each education entry, extract:
- school: institution name
- degree: degree type (e.g., "BS", "BA", "MBA", "MSc")
- field: field of study (e.g., "Computer Science", "Business Administration")
- startDate: YYYY-MM format (optional)
- endDate: YYYY-MM format (optional)
- graduationDate: YYYY-MM format when graduation occurred
- honors: honors/distinction (e.g., "Cum Laude", "Dean's List", "GPA 3.8/4.0")
- confidence: 0-1 score for how confident the extraction is

Example output for reference:
[
  {
    "school": "Stanford University",
    "degree": "BS",
    "field": "Computer Science",
    "startDate": "2016-09",
    "endDate": "2020-05",
    "graduationDate": "2020-05",
    "honors": "Summa Cum Laude, GPA 3.95/4.0",
    "confidence": 0.98
  }
]

Extract ALL education entries including secondary, online courses, bootcamps. Return ONLY the JSON array.

CV Text:
${cvText}`;

  return new Promise((resolve) => {
    callAnthropic(prompt).then((result) => {
      if (!result) {
        resolve([]);
        return;
      }
      try {
        const jsonMatch = result.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as Education[];
          resolve(Array.isArray(parsed) ? parsed : []);
        } else {
          resolve([]);
        }
      } catch {
        resolve([]);
      }
    });
  });
}

function extractSkills(cvText: string): Promise<Skill[]> {
  const prompt = `Extract ALL skills from this CV text. Return ONLY a valid JSON array.

For each skill, extract:
- name: skill name
- category: one of "technical" (programming languages, tools), "soft" (leadership, communication), "language" (spoken language), "tool" (software), "framework" (tech framework), "methodology" (agile, scrum)
- proficiency: "beginner", "intermediate", "advanced", "expert", or null if not specified
- yearsOfExperience: number or null if not specified
- confidence: 0-1 score for confidence

Example output for reference:
[
  {"name": "Python", "category": "technical", "proficiency": "expert", "yearsOfExperience": 5, "confidence": 0.95},
  {"name": "React", "category": "framework", "proficiency": "advanced", "yearsOfExperience": 3, "confidence": 0.90},
  {"name": "Leadership", "category": "soft", "proficiency": "advanced", "yearsOfExperience": 4, "confidence": 0.85},
  {"name": "Spanish", "category": "language", "proficiency": "intermediate", "yearsOfExperience": null, "confidence": 0.80},
  {"name": "Agile", "category": "methodology", "proficiency": "advanced", "yearsOfExperience": 5, "confidence": 0.88}
]

Extract EVERYTHING: programming languages, frameworks, tools, soft skills, languages spoken, methodologies, etc. Be comprehensive.
Return ONLY the JSON array.

CV Text:
${cvText}`;

  return new Promise((resolve) => {
    callAnthropic(prompt).then((result) => {
      if (!result) {
        resolve([]);
        return;
      }
      try {
        const jsonMatch = result.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as Skill[];
          resolve(Array.isArray(parsed) ? parsed : []);
        } else {
          resolve([]);
        }
      } catch {
        resolve([]);
      }
    });
  });
}

function extractCertifications(cvText: string): Promise<Certification[]> {
  const prompt = `Extract ALL certifications, licenses, and credentials from this CV text. Return ONLY a valid JSON array.

For each certification, extract:
- name: certification or license name
- issuer: organization that issued it
- date: YYYY-MM format when earned
- expiryDate: YYYY-MM format when it expires, or null if no expiry
- credentialId: certificate ID or number if provided
- confidence: 0-1 score for confidence

Example output for reference:
[
  {
    "name": "AWS Certified Solutions Architect - Professional",
    "issuer": "Amazon Web Services",
    "date": "2023-05",
    "expiryDate": "2026-05",
    "credentialId": "CERT-123456",
    "confidence": 0.98
  },
  {
    "name": "Google Cloud Associate Cloud Engineer",
    "issuer": "Google Cloud",
    "date": "2022-11",
    "expiryDate": null,
    "credentialId": null,
    "confidence": 0.95
  }
]

Extract ALL certifications, professional licenses, training certificates. Return ONLY the JSON array.

CV Text:
${cvText}`;

  return new Promise((resolve) => {
    callAnthropic(prompt).then((result) => {
      if (!result) {
        resolve([]);
        return;
      }
      try {
        const jsonMatch = result.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as Certification[];
          resolve(Array.isArray(parsed) ? parsed : []);
        } else {
          resolve([]);
        }
      } catch {
        resolve([]);
      }
    });
  });
}

function extractProfileFields(cvText: string): Promise<Partial<ExtractedCvPhase1>> {
  const prompt = `Extract profile and preference fields from this CV. Return ONLY a valid JSON object.

Extract:
- fullName: person's full name
- email: email address
- phone: phone number (with country code if provided)
- location: current location/city
- preferredLocation: desired work location
- currentJobSituation: "employed", "unemployed", "freelance", "student", "in-between" etc
- employmentObjective: what they're looking for (if stated)
- summary: professional summary/headline (2-3 sentences)
- contractPreference: "permanent", "contract", "freelance", "temporary"
- workRate: "100%", "80%", "part-time", "flexible"
- workPermitStatus: "Swiss citizen", "B permit", "C permit", "work-authorized" etc
- salaryExpectation: salary range with currency (e.g., "120000-140000 CHF")

Example output:
{
  "fullName": "John Smith",
  "email": "john@example.com",
  "phone": "+41 79 123 4567",
  "location": "Zurich, Switzerland",
  "preferredLocation": "Zurich, Switzerland",
  "currentJobSituation": "employed",
  "employmentObjective": "Senior Product Manager role at growth-stage tech company",
  "summary": "Experienced product leader with 8+ years driving user-centric innovation. Led cross-functional teams to 3x growth.",
  "contractPreference": "permanent",
  "workRate": "100%",
  "workPermitStatus": "C permit",
  "salaryExpectation": "150000-180000 CHF"
}

All fields can be null if not found. Return ONLY the JSON object, no other text.

CV Text:
${cvText}`;

  return new Promise((resolve) => {
    callAnthropic(prompt).then((result) => {
      if (!result) {
        resolve({});
        return;
      }
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as Partial<ExtractedCvPhase1>;
          resolve(parsed);
        } else {
          resolve({});
        }
      } catch {
        resolve({});
      }
    });
  });
}

export async function extractCvPhase1(cvText: string): Promise<ExtractedCvPhase1> {
  console.log("[CV Extraction Phase 1] Starting comprehensive extraction");
  
  // Execute all extractions in parallel
  const [workExperience, education, skills, certifications, profileFields] = await Promise.all([
    extractWorkHistory(cvText),
    extractEducation(cvText),
    extractSkills(cvText),
    extractCertifications(cvText),
    extractProfileFields(cvText)
  ]);

  console.log("[CV Extraction Phase 1] Work experience entries:", workExperience.length);
  console.log("[CV Extraction Phase 1] Education entries:", education.length);
  console.log("[CV Extraction Phase 1] Skills extracted:", skills.length);
  console.log("[CV Extraction Phase 1] Certifications:", certifications.length);

  const result: ExtractedCvPhase1 = {
    fullName: profileFields.fullName ?? null,
    email: profileFields.email ?? null,
    phone: profileFields.phone ?? null,
    location: profileFields.location ?? null,
    preferredLocation: profileFields.preferredLocation ?? null,
    currentJobSituation: profileFields.currentJobSituation ?? null,
    employmentObjective: profileFields.employmentObjective ?? null,
    summary: profileFields.summary ?? null,
    workExperience,
    education,
    skills,
    certifications,
    contractPreference: profileFields.contractPreference ?? null,
    workRate: profileFields.workRate ?? null,
    workPermitStatus: profileFields.workPermitStatus ?? null,
    salaryExpectation: profileFields.salaryExpectation ?? null,
    rawText: cvText,
    extractedAt: new Date().toISOString()
  };

  console.log("[CV Extraction Phase 1] Extraction complete");
  return result;
}
