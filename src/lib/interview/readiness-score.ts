import { getRoleProfile, RoleProfile } from "./roles";
import { db } from "@/lib/db";

export interface ReadinessBreakdown {
  experience: number; // 0-100
  skills: number; // 0-100
  education: number; // 0-100
  workPermit: number; // 0-100
  location: number; // 0-100
}

export interface ReadinessScore {
  roleId: string;
  roleName: string;
  overallReadiness: number; // 0-100
  breakdown: ReadinessBreakdown;
  strengths: string[];
  gaps: string[];
  timeToReady: string; // "Immediate", "3 months", "6 months", "1 year+"
}

/**
 * Calculate readiness score for a user against a role
 */
export async function calculateReadiness(
  userId: string,
  roleId: string
): Promise<ReadinessScore> {
  // 1. Get role profile
  const roleProfile = getRoleProfile(roleId);
  if (!roleProfile) {
    throw new Error(`Role not found: ${roleId}`);
  }

  // 2. Get user profile and qualifications
  const userProfile = await db.candidateProfile.findUnique({
    where: { userId },
    include: { qualifications: true },
  });

  if (!userProfile) {
    throw new Error("User profile not found");
  }

  // 3. Calculate each dimension
  const breakdown: ReadinessBreakdown = {
    experience: calculateExperienceScore(userProfile.primaryRole || "", roleProfile),
    skills: calculateSkillsScore(
      userProfile.qualifications.map((q) => q.value),
      roleProfile
    ),
    education: calculateEducationScore(userProfile.primaryRole || "", roleProfile),
    workPermit: calculateWorkPermitScore(userProfile.workPermitStatus || ""),
    location: calculateLocationScore(
      userProfile.preferredLocation || "",
      roleProfile.typicalLocations
    ),
  };

  // 4. Calculate weighted overall score
  const weights = {
    experience: 0.3,
    skills: 0.35,
    education: 0.15,
    workPermit: 0.1,
    location: 0.1,
  };

  const overallReadiness = Math.round(
    breakdown.experience * weights.experience +
      breakdown.skills * weights.skills +
      breakdown.education * weights.education +
      breakdown.workPermit * weights.workPermit +
      breakdown.location * weights.location
  );

  // 5. Identify strengths and gaps
  const strengths = identifyStrengths(breakdown, roleProfile, userProfile);
  const gaps = identifyGaps(breakdown, roleProfile);

  // 6. Estimate time to readiness
  const timeToReady = estimateTimeToReady(overallReadiness, gaps);

  return {
    roleId,
    roleName: roleProfile.title,
    overallReadiness: Math.min(100, Math.max(0, overallReadiness)),
    breakdown,
    strengths,
    gaps,
    timeToReady,
  };
}

/**
 * Calculate experience score (0-100)
 */
function calculateExperienceScore(
  currentRole: string,
  roleProfile: RoleProfile
): number {
  const roleMatches =
    currentRole.toLowerCase().includes("engineer") &&
    roleProfile.title.toLowerCase().includes("engineer");
  const relatedRoles =
    (currentRole.toLowerCase().includes("developer") &&
      roleProfile.title.toLowerCase().includes("software")) ||
    (currentRole.toLowerCase().includes("analyst") &&
      roleProfile.title.toLowerCase().includes("analyst"));

  if (relatedRoles) return 85;
  if (roleMatches) return 90;
  if (currentRole) return 50; // Some relevant experience
  return 20; // No relevant experience
}

/**
 * Calculate skills score (0-100)
 */
function calculateSkillsScore(
  userSkills: string[],
  roleProfile: RoleProfile
): number {
  const requiredSkills = roleProfile.requiredSkills || [];
  const userSkillsLower = userSkills.map((s) => s.toLowerCase());

  let matchedCount = 0;
  for (const reqSkill of requiredSkills) {
    if (userSkillsLower.some((s) => s.includes(reqSkill.toLowerCase()))) {
      matchedCount++;
    }
  }

  const matchPercentage = (matchedCount / Math.max(requiredSkills.length, 1)) * 100;

  // Scale: 0 skills = 0, all skills = 100, partial = partial
  return Math.round(matchPercentage * 0.8 + 20); // Minimum 20 for having some relevance
}

/**
 * Calculate education score (0-100)
 */
function calculateEducationScore(
  currentRole: string,
  roleProfile: RoleProfile
): number {
  const preferredEd = roleProfile.preferredEducation || "Any";

  if (preferredEd === "Any") return 80;
  if (preferredEd === "High School") return 90;
  if (preferredEd === "Bachelor's") {
    // Assume most professionals have Bachelor's
    return 75;
  }
  if (preferredEd === "Master's") {
    // Check for advanced titles suggesting higher education
    if (currentRole.toLowerCase().includes("senior")) return 85;
    return 60;
  }

  return 70; // Default
}

/**
 * Calculate work permit score (0-100)
 */
function calculateWorkPermitScore(workPermitStatus: string): number {
  if (!workPermitStatus) return 70;

  const status = workPermitStatus.toLowerCase();
  if (status.includes("authorized") || status.includes("citizen") || status.includes("permit"))
    return 100;
  if (status.includes("sponsorship") || status.includes("visa")) return 80;

  return 70; // Default - assume can work
}

/**
 * Calculate location score (0-100)
 */
function calculateLocationScore(preferred: string, typical: string[]): number {
  if (!preferred) return 80;

  const normalized = preferred.toLowerCase();
  if (typical.some((t) => t.toLowerCase() === normalized)) {
    return 100; // Perfect match
  }

  // Check for proximity or flexibility
  if (
    (normalized.includes("zurich") || normalized.includes("flexible") ||
      normalized.includes("remote")) &&
    typical.some((t) => t.toLowerCase().includes("zurich"))
  ) {
    return 90;
  }

  if (normalized.includes("flexible") || normalized.includes("remote")) {
    return 80; // Flexible candidates still good
  }

  return 50; // Different location
}

/**
 * Identify strengths from scores
 */
function identifyStrengths(
  breakdown: ReadinessBreakdown,
  roleProfile: RoleProfile,
  _userProfile: unknown
): string[] {
  const strengths: string[] = [];

  if (breakdown.skills >= 80) {
    strengths.push(
      `Strong match in required skills for ${roleProfile.title}`
    );
  }
  if (breakdown.experience >= 75) {
    strengths.push(
      `Relevant professional experience for this role`
    );
  }
  if (breakdown.workPermit === 100) {
    strengths.push("Work permit and legal status fully aligned");
  }
  if (breakdown.location === 100) {
    strengths.push("Location preference matches typical positions");
  }

  // Generic strengths if no specific ones
  if (strengths.length === 0) {
    strengths.push("Foundation for career transition");
  }

  return strengths.slice(0, 3); // Max 3 strengths
}

/**
 * Identify gaps from scores
 */
function identifyGaps(breakdown: ReadinessBreakdown, roleProfile: RoleProfile): string[] {
  const gaps: string[] = [];

  if (breakdown.skills < 60) {
    gaps.push(
      `Need to develop: ${roleProfile.requiredSkills.slice(0, 2).join(", ")}`
    );
  }
  if (breakdown.experience < 50) {
    gaps.push(
      `Consider gaining experience in ${roleProfile.title} or adjacent roles`
    );
  }
  if (breakdown.location < 70) {
    gaps.push("Location may require relocation or remote flexibility");
  }

  return gaps;
}

/**
 * Estimate time to readiness
 */
function estimateTimeToReady(overallScore: number, _gaps: string[]): string {
  if (overallScore >= 85) return "Immediate - Apply now";
  if (overallScore >= 70) return "Ready within 1-2 months";
  if (overallScore >= 50) return "Ready within 3-6 months";
  if (overallScore >= 30) return "Ready within 6-12 months";
  return "1+ year of focused development needed";
}

/**
 * Compare readiness across multiple roles
 */
export async function compareReadiness(
  userId: string,
  roleIds: string[]
): Promise<ReadinessScore[]> {
  const scores: ReadinessScore[] = [];

  for (const roleId of roleIds.slice(0, 5)) {
    // Max 5 roles
    try {
      const score = await calculateReadiness(userId, roleId);
      scores.push(score);
    } catch (e) {
      console.error(`Error calculating readiness for role ${roleId}:`, e);
    }
  }

  // Sort by overall readiness (descending)
  return scores.sort((a, b) => b.overallReadiness - a.overallReadiness);
}
