import { db } from "@/lib/db";

export interface SkillGap {
  skill: string;
  priority: "high" | "medium" | "low";
  reason: string;
  relatedRole?: string;
}

/**
 * Normalize skill names for consistent matching
 */
function normalizeSkillName(skill: string): string {
  return skill
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/programming|skills|knowledge|proficiency/i, "")
    .trim();
}

/**
 * Common skill name mappings to normalize variations
 */
const SKILL_MAPPINGS: Record<string, string> = {
  "python programming": "Python",
  python: "Python",
  "sql database": "SQL",
  "sql queries": "SQL",
  sql: "SQL",
  "data analysis": "Data Analysis",
  analytics: "Data Analysis",
  "business analytics": "Data Analysis",
  javascript: "JavaScript",
  "js development": "JavaScript",
  react: "React",
  "react frontend": "React",
  typescript: "TypeScript",
  "ts development": "TypeScript",
  aws: "AWS",
  "amazon web services": "AWS",
  "cloud computing": "AWS",
  leadership: "Leadership",
  "team leadership": "Leadership",
  "people management": "Leadership",
  communication: "Communication",
  "public speaking": "Communication",
  "business communication": "Communication",
  "project management": "Project Management",
  "agile methodology": "Project Management",
  scrum: "Project Management",
  design: "UX/UI Design",
  "ux design": "UX/UI Design",
  "user experience": "UX/UI Design",
  negotiation: "Negotiation",
  "salary negotiation": "Negotiation",
  "product management": "Product Management",
  "product strategy": "Product Management",
};

/**
 * Extract and normalize skill from raw text
 */
function extractAndNormalizeSkill(skillText: string): string | null {
  const normalized = normalizeSkillName(skillText);

  if (!normalized || normalized.length < 3) {
    return null;
  }

  // Check for exact mapping
  const lowerNormalized = normalized.toLowerCase();
  for (const [key, value] of Object.entries(SKILL_MAPPINGS)) {
    if (lowerNormalized.includes(key.toLowerCase())) {
      return value;
    }
  }

  // Capitalize first letter
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

/**
 * Parse skill gaps from guidance text
 */
function parseSkillGapsFromText(text: string): SkillGap[] {
  if (!text || text.length < 10) {
    return [];
  }

  const gaps: SkillGap[] = [];
  const lines = text.split(/\n|;|\./);

  for (const line of lines) {
    // Skip short lines
    if (line.trim().length < 10) continue;

    // Try to extract skill name and priority
    const skillText = line.trim().toLowerCase();

    // Priority detection
    let priority: "high" | "medium" | "low" = "medium";
    if (
      skillText.includes("critical") ||
      skillText.includes("essential") ||
      skillText.includes("must")
    ) {
      priority = "high";
    } else if (skillText.includes("helpful") || skillText.includes("nice")) {
      priority = "low";
    }

    // Extract skill name
    let skill: string | null = null;

    // Try numbered format: "1. Python - ..."
    const numberedMatch = line.match(
      /^\s*\d+\.\s*([a-zA-Z\s&-]+?)\s*[-–]?\s*(.*)/
    );
    if (numberedMatch) {
      skill = extractAndNormalizeSkill(numberedMatch[1]);
      const reason = numberedMatch[2] || "";

      if (skill && reason.trim()) {
        gaps.push({
          skill,
          priority,
          reason: reason.substring(0, 150),
        });
        continue;
      }
    }

    // Try bullet format: "- Python: ..."
    const bulletMatch = line.match(/^[\s-•*]*([a-zA-Z\s&-]+?)\s*[:–-]\s*(.*)/);
    if (bulletMatch) {
      skill = extractAndNormalizeSkill(bulletMatch[1]);
      const reason = bulletMatch[2] || "";

      if (skill && reason.trim()) {
        gaps.push({
          skill,
          priority,
          reason: reason.substring(0, 150),
        });
        continue;
      }
    }

    // Try looking for known skills in the line
    for (const skillName of Object.values(SKILL_MAPPINGS)) {
      if (line.toLowerCase().includes(skillName.toLowerCase())) {
        skill = skillName;
        gaps.push({
          skill,
          priority,
          reason: line.substring(0, 150),
        });
        break;
      }
    }
  }

  // Deduplicate by skill name (case-insensitive)
  const deduped: Record<string, SkillGap> = {};
  for (const gap of gaps) {
    const key = gap.skill.toLowerCase();
    if (!deduped[key]) {
      deduped[key] = gap;
    }
  }

  return Object.values(deduped).slice(0, 8); // Max 8 skill gaps
}

/**
 * Extract skill gaps from user's profile based on target role
 * Uses profile info to identify skill gaps
 */
export async function extractSkillGapsFromLatestGuidance(
  userId: string
): Promise<SkillGap[]> {
  try {
    // 1. Fetch user profile
    const profile = await db.candidateProfile.findUnique({
      where: { userId },
      include: { qualifications: true },
    });

    if (!profile) {
      return [];
    }

    // 2. Get gaps based on role and current qualifications
    const gaps = getGapsFromQualifications(
      profile.qualifications.map((q) => q.value),
      profile.targetRoles || profile.primaryRole || null
    );

    return gaps;
  } catch (error) {
    console.error("Error extracting skill gaps:", error);
    return [];
  }
}

/**
 * Get skill gaps from profile qualifications
 * Identify what's missing based on target role
 */
export function getGapsFromQualifications(
  currentSkills: string[],
  targetRole: string | null
): SkillGap[] {
  const commonSkillsByRole: Record<string, string[]> = {
    "Software Engineer": [
      "Python",
      "JavaScript",
      "TypeScript",
      "System Design",
      "SQL",
      "AWS",
    ],
    "Data Analyst": [
      "SQL",
      "Python",
      "Tableau",
      "Statistics",
      "Excel",
      "Power BI",
    ],
    "Product Manager": [
      "Product Strategy",
      "Analytics",
      "Communication",
      "Leadership",
      "SQL",
    ],
    "Project Manager": [
      "Project Management",
      "Agile",
      "Communication",
      "Leadership",
      "Risk Management",
    ],
    Manager: [
      "Leadership",
      "Communication",
      "Strategic Planning",
      "Conflict Resolution",
      "Coaching",
    ],
  };

  const requiredSkills = targetRole
    ? commonSkillsByRole[targetRole] || []
    : [];
  const currentLower = currentSkills.map((s) => s.toLowerCase());

  const gaps: SkillGap[] = [];
  for (const skill of requiredSkills) {
    if (!currentLower.some((s) => s.includes(skill.toLowerCase()))) {
      gaps.push({
        skill,
        priority: gaps.length < 3 ? "high" : "medium",
        reason: `Important for ${targetRole} role`,
        relatedRole: targetRole || undefined,
      });
    }
  }

  return gaps.slice(0, 8);
}
