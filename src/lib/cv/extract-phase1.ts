import { env } from "@/lib/env";

// Enhanced data types with structured metadata
export type WorkExperience = {
  company: string | null;
  title: string;
  location: string | null;
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
  location: string | null;
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

/**
 * Wrapper that handles retries and JSON parsing
 */
async function callAnthropicWithRetry<T>(
  prompt: string,
  parser: (text: string) => T,
  maxRetries: number = 2
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await callAnthropic(prompt);
      if (!result) {
        lastError = new Error("No response from API");
        continue;
      }

      const parsed = parser(result);
      return parsed;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries) {
        // Exponential backoff
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }

  // Return empty on final failure
  console.error("[CV Extraction] Max retries exceeded:", lastError?.message);
  return parser("[]") as T;
}

function extractWorkHistory(cvText: string): Promise<WorkExperience[]> {
  const prompt = `Extract ALL work experience from this CV text. Return ONLY a valid JSON array with NO markdown code blocks.

CRITICAL INSTRUCTIONS:
- Extract EVERY job mentioned, including internships, contracts, side projects, volunteer work
- If dates are missing, set to null but include the role
- If company is missing, use "Unknown Company"
- Achievement examples: increased revenue by X%, managed Y people, launched Z products, reduced costs by X%
- Be specific with technologies - name tools, languages, platforms explicitly
- isCurrentRole should be true ONLY if explicitly stated as current/present

Structure for each entry:
{
  "company": "exact company name or 'Unknown Company'",
  "title": "job title",
  "location": "job location if stated, or null",
  "startDate": "YYYY-MM or null",
  "endDate": "YYYY-MM or null (if current role)",
  "isCurrentRole": true/false,
  "description": "2-3 sentence role description",
  "achievements": ["specific quantified achievement", "another achievement"],
  "technologies": ["specific tool/language/platform"],
  "confidence": 0.0-1.0
}

EXAMPLE OUTPUT (for reference only):
[
  {
    "company": "Google",
    "title": "Senior Product Manager",
    "location": "Zurich, Switzerland",
    "startDate": "2020-03",
    "endDate": null,
    "isCurrentRole": true,
    "description": "Led product strategy for SaaS platform serving 500k+ users. Managed team of 8 engineers and designers.",
    "achievements": ["Increased user retention by 35% through personalization", "Shipped 5 major features", "Grew ARR by 2.5x"],
    "technologies": ["Product analytics", "Python", "SQL", "Figma", "AWS"],
    "confidence": 0.95
  },
  {
    "company": "Startup Inc",
    "title": "Product Manager",
    "location": "Remote",
    "startDate": "2018-06",
    "endDate": "2020-02",
    "isCurrentRole": false,
    "description": "First PM hire. Built product strategy from scratch.",
    "achievements": ["Grew DAU from 0 to 50k", "Raised Series A"],
    "technologies": ["Mixpanel", "JavaScript", "React"],
    "confidence": 0.88
  }
]

CV Text:
${cvText}`;

  return callAnthropicWithRetry(prompt, (text) => {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]) as WorkExperience[];
    return Array.isArray(parsed)
      ? parsed.filter((w) => w && typeof w === "object")
      : [];
  });
}

function extractEducation(cvText: string): Promise<Education[]> {
  const prompt = `Extract ALL education from this CV text. Return ONLY a valid JSON array with NO markdown code blocks.

CRITICAL INSTRUCTIONS:
- Extract EVERY educational entry: primary school, secondary, university, bootcamps, online courses
- Include incomplete degrees (dropped out, in progress)
- For graduation year only, use YYYY format; for full dates use YYYY-MM
- Be generous - include any mention of learning institution

Structure for each entry:
{
  "school": "exact institution name",
  "location": "school/campus location if stated, or null",
  "degree": "degree abbreviation (BS, BA, MBA, MSc, BEng, etc) or null",
  "field": "field of study or major",
  "startDate": "YYYY-MM or null",
  "endDate": "YYYY-MM or null",
  "graduationDate": "YYYY-MM or null (best estimate if unknown)",
  "honors": "honors/distinction (Cum Laude, Dean's List, etc) or null",
  "confidence": 0.0-1.0
}

EXAMPLE OUTPUT:
[
  {
    "school": "Stanford University",
    "location": "Stanford, CA, USA",
    "degree": "BS",
    "field": "Computer Science",
    "startDate": "2016-09",
    "endDate": "2020-05",
    "graduationDate": "2020-05",
    "honors": "Summa Cum Laude, GPA 3.95/4.0",
    "confidence": 0.98
  },
  {
    "school": "General Assembly",
    "location": "Remote",
    "degree": null,
    "field": "Product Management Bootcamp",
    "startDate": "2022-01",
    "endDate": "2022-03",
    "graduationDate": "2022-03",
    "honors": null,
    "confidence": 0.90
  }
]

CV Text:
${cvText}`;

  return callAnthropicWithRetry(prompt, (text) => {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]) as Education[];
    return Array.isArray(parsed)
      ? parsed.filter((e) => e && typeof e === "object" && e.school)
      : [];
  });
}

function extractSkills(cvText: string): Promise<Skill[]> {
  const prompt = `Extract ALL skills from this CV text comprehensively. Return ONLY a valid JSON array with NO markdown code blocks.

CRITICAL INSTRUCTIONS:
- Extract EVERY skill mentioned: languages, tools, frameworks, soft skills, certifications, methodologies
- Include skills from work experience descriptions, not just skills section
- Be extremely thorough - capture everything
- Languages include: programming languages, spoken languages, markup languages
- Category definitions:
  * technical: programming languages, APIs, libraries
  * language: spoken/written languages (English, Spanish, German, etc)
  * tool: software tools and platforms (Figma, Jira, Salesforce, Excel, etc)
  * framework: tech frameworks (React, Vue, Django, Spring, etc)
  * methodology: Agile, Scrum, Design Thinking, Kanban, etc
  * soft: leadership, communication, project management, etc

Structure for each skill:
{
  "name": "exact skill name",
  "category": "technical|soft|language|tool|framework|methodology",
  "proficiency": "beginner|intermediate|advanced|expert|null",
  "yearsOfExperience": number or null,
  "confidence": 0.0-1.0
}

EXAMPLE OUTPUT:
[
  {"name": "Python", "category": "technical", "proficiency": "expert", "yearsOfExperience": 5, "confidence": 0.95},
  {"name": "React", "category": "framework", "proficiency": "advanced", "yearsOfExperience": 3, "confidence": 0.90},
  {"name": "AWS", "category": "tool", "proficiency": "advanced", "yearsOfExperience": 2, "confidence": 0.88},
  {"name": "Spanish", "category": "language", "proficiency": "intermediate", "yearsOfExperience": null, "confidence": 0.75},
  {"name": "Leadership", "category": "soft", "proficiency": "advanced", "yearsOfExperience": 4, "confidence": 0.85},
  {"name": "Agile", "category": "methodology", "proficiency": "advanced", "yearsOfExperience": 5, "confidence": 0.88}
]

CV Text:
${cvText}`;

  return callAnthropicWithRetry(prompt, (text) => {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]) as Skill[];
    return Array.isArray(parsed)
      ? parsed.filter(
          (s) =>
            s &&
            typeof s === "object" &&
            s.name &&
            ["technical", "soft", "language", "tool", "framework", "methodology"].includes(s.category)
        )
      : [];
  });
}

function extractCertifications(cvText: string): Promise<Certification[]> {
  const prompt = `Extract ALL certifications, licenses, professional credentials from this CV text. Return ONLY a valid JSON array with NO markdown code blocks.

CRITICAL INSTRUCTIONS:
- Extract EVERY certification, license, and credential mentioned
- Include expired certifications with expiryDate
- Include certifications from work history descriptions
- Look for: professional certifications, licenses, training certificates, awards, credentials

Structure for each certification:
{
  "name": "exact certification or license name",
  "issuer": "organization that issued it or null",
  "date": "YYYY-MM format when earned or null",
  "expiryDate": "YYYY-MM format when it expires, or null if no expiry",
  "credentialId": "certificate ID, license number, or null",
  "confidence": 0.0-1.0
}

EXAMPLE OUTPUT:
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
  },
  {
    "name": "PMP - Project Management Professional",
    "issuer": "PMI",
    "date": "2020-03",
    "expiryDate": "2023-03",
    "credentialId": "PMI-789",
    "confidence": 0.92
  }
]

CV Text:
${cvText}`;

  return callAnthropicWithRetry(prompt, (text) => {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]) as Certification[];
    return Array.isArray(parsed)
      ? parsed.filter((c) => c && typeof c === "object" && c.name)
      : [];
  });
}

function extractProfileFields(cvText: string): Promise<Partial<ExtractedCvPhase1>> {
  const prompt = `Extract profile and preference fields from this CV comprehensively. Return ONLY a valid JSON object with NO markdown code blocks.

CRITICAL INSTRUCTIONS:
- Extract contact info from any location in CV (header, footer, contact section)
- Look for multiple languages mentioned - list all of them
- Extract summary: professional headline, objective, or summary paragraph (up to 3 sentences)
- Be comprehensive with preferences and work situation

Extract fields:
- fullName: person's full legal name
- email: email address(es) - if multiple, list primary
- phone: phone number with country code if available
- location: current city/country or "Based in"
- preferredLocation: desired work location(s) if stated
- currentJobSituation: employed/unemployed/freelance/student/between jobs/sabbatical/retired
- employmentObjective: what role they're seeking (if explicitly stated)
- summary: professional summary, headline, or key description (2-3 sentences max)
- contractPreference: permanent/contract/freelance/temporary/open to any
- workRate: 100%, 80%, part-time, full-time, flexible, or specific hours
- workPermitStatus: Swiss citizen/C permit/B permit/L permit/visa/work-authorized/open
- salaryExpectation: exact range with currency (e.g., "120000-140000 CHF" or "100k-120k EUR")

EXAMPLE OUTPUT:
{
  "fullName": "John Michael Smith",
  "email": "john.smith@example.com",
  "phone": "+41 79 123 4567",
  "location": "Zurich, Switzerland",
  "preferredLocation": "Zurich or Basel, Switzerland",
  "currentJobSituation": "employed",
  "employmentObjective": "Senior Product Manager role at growth-stage tech company",
  "summary": "Experienced product leader with 8+ years driving user-centric innovation at top tech companies. Led teams to 3x growth. Strong background in B2B SaaS.",
  "contractPreference": "permanent",
  "workRate": "100%",
  "workPermitStatus": "C permit",
  "salaryExpectation": "150000-180000 CHF"
}

CV Text:
${cvText}`;

  return callAnthropicWithRetry(prompt, (text) => {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    return JSON.parse(jsonMatch[0]) as Partial<ExtractedCvPhase1>;
  });
}

export async function extractCvPhase1(cvText: string): Promise<ExtractedCvPhase1> {
  console.log("[CV Phase1] 📄 Starting comprehensive CV extraction");
  console.log(`[CV Phase1] 📊 CV text length: ${cvText.length} characters`);

  const startTime = Date.now();

  try {
    // Execute all extractions in parallel
    console.log("[CV Phase1] 🔄 Extracting: work history, education, skills, certifications, profile");
    const [workExperience, education, skills, certifications, profileFields] = await Promise.all([
      extractWorkHistory(cvText),
      extractEducation(cvText),
      extractSkills(cvText),
      extractCertifications(cvText),
      extractProfileFields(cvText)
    ]);

    console.log("[CV Phase1] ✅ Work experience:", workExperience.length, "entries");
    if (workExperience.length > 0) {
      workExperience.forEach((w, i) => {
        console.log(
          `  [${i + 1}] ${w.title} @ ${w.company} (${w.startDate}-${w.endDate || "present"}) - confidence: ${w.confidence}`
        );
      });
    }

    console.log("[CV Phase1] ✅ Education:", education.length, "entries");
    if (education.length > 0) {
      education.forEach((e, i) => {
        console.log(
          `  [${i + 1}] ${e.degree ? e.degree + " " : ""}${e.field || ""} from ${e.school} (${e.graduationDate || "?"}) - confidence: ${e.confidence}`
        );
      });
    }

    console.log("[CV Phase1] ✅ Skills:", skills.length, "total");
    const skillsByCategory = skills.reduce(
      (acc, s) => {
        acc[s.category] = (acc[s.category] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    Object.entries(skillsByCategory).forEach(([cat, count]) => {
      console.log(`  ${cat}: ${count}`);
    });

    console.log("[CV Phase1] ✅ Certifications:", certifications.length, "total");
    if (certifications.length > 0) {
      certifications.slice(0, 3).forEach((c, i) => {
        console.log(`  [${i + 1}] ${c.name} (${c.date || "?"}) - confidence: ${c.confidence}`);
      });
      if (certifications.length > 3) {
        console.log(`  ... and ${certifications.length - 3} more`);
      }
    }

    console.log("[CV Phase1] ✅ Profile:", {
      name: profileFields.fullName || "❌ missing",
      email: profileFields.email || "❌ missing",
      phone: profileFields.phone || "❌ missing",
      location: profileFields.location || "❌ missing",
      situation: profileFields.currentJobSituation || "❌ missing",
      workRate: profileFields.workRate || "❌ missing",
      permit: profileFields.workPermitStatus || "❌ missing",
      salary: profileFields.salaryExpectation || "❌ missing"
    });

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

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[CV Phase1] ⏱️  Extraction complete in ${duration}s`);
    return result;
  } catch (error) {
    console.error("[CV Phase1] ❌ Extraction failed:", error instanceof Error ? error.message : String(error));
    throw error;
  }
}
