/**
 * CV Enhancement Service
 * 
 * Analyzes user CV and provides prioritized improvement suggestions
 * Covers: missing info, suggestions, structure, skills
 */

import type { ExtractedCvFacts } from "@/lib/cv/extract";

export interface CVSuggestion {
  category: "missing-info" | "weak-verbs" | "no-metrics" | "structure" | "skills" | "formatting";
  priority: "critical" | "high" | "medium" | "nice-to-have";
  section?: string;
  current?: string;
  suggested?: string;
  explanation: string;
  example?: string;
}

export interface CVAnalysis {
  overall_score: number; // 0-100
  findings: CVSuggestion[];
  priorityAreas: string[];
  industrySpecificTips?: string[];
  summary: string;
}

/**
 * Analyze CV and generate improvement suggestions
 */
export function analyzeCv(cv: ExtractedCvFacts, industry?: string, role?: string): CVAnalysis {
  const findings: CVSuggestion[] = [];

  // Basic completeness checks
  if (!cv.fullName) {
    findings.push({
      category: "missing-info",
      priority: "critical",
      section: "Contact Information",
      suggested: "Add your full name",
      explanation: "Your name is the first thing recruiters see. Make sure it's clearly visible.",
      example: "Jane Smith"
    });
  }

  if (!cv.primaryRole) {
    findings.push({
      category: "missing-info",
      priority: "high",
      section: "Professional Summary",
      suggested: "Add your primary role or job title",
      explanation: "A clear job title helps recruiters understand your experience level and fit.",
      example: "Senior Product Manager with 8 years of SaaS experience"
    });
  }

  if (!cv.employmentObjective) {
    findings.push({
      category: "missing-info",
      priority: "high",
      section: "Career Objectives",
      suggested: "Specify your employment objective",
      explanation: "This helps recruiters understand your goals and whether they align with open roles.",
      example: "Seeking a leadership role in Product Management at a growth-stage startup"
    });
  }

  if (!cv.qualifications || cv.qualifications.length === 0) {
    findings.push({
      category: "missing-info",
      priority: "high",
      section: "Skills & Qualifications",
      suggested: "Add your skills, languages, and certifications",
      explanation: "Highlight both technical and soft skills. Include languages you speak.",
      example: "Skills: Product Strategy, User Research, Python | Languages: English, German"
    });
  }

  // Calculate score based on completeness
  const completeFields = [
    cv.fullName,
    cv.primaryRole,
    cv.employmentObjective,
    cv.qualifications && cv.qualifications.length > 0,
    cv.preferredLocation,
    cv.currentJobSituation
  ].filter(Boolean).length;

  const score = Math.round((completeFields / 6) * 100);

  const analysis: CVAnalysis = {
    overall_score: score,
    findings,
    priorityAreas: findings.map((f) => f.section).filter((v) => v) as string[],
    industrySpecificTips: getIndustrySpecificTips(industry, role),
    summary: generateSummary(score, findings.length)
  };

  return analysis;
}

/**
 * Get industry-specific tips
 */
function getIndustrySpecificTips(industry?: string, role?: string): string[] {
  const tips: string[] = [];

  // Tech industry
  if (industry?.toLowerCase().includes("tech") || role?.toLowerCase().includes("engineer")) {
    tips.push("Include GitHub profile or portfolio link");
    tips.push("Highlight specific technologies and frameworks used");
    tips.push("Add open-source contributions if applicable");
  }

  // Product/Business
  if (role?.toLowerCase().includes("product") || role?.toLowerCase().includes("manager")) {
    tips.push("Emphasize product metrics: user growth, revenue impact");
    tips.push("Highlight cross-functional leadership experiences");
  }

  // General
  tips.push("Match your CV keywords to the job posting");
  tips.push("Update your CV for each application");

  return tips;
}

/**
 * Generate summary text based on score
 */
function generateSummary(score: number, findingCount: number): string {
  if (score >= 90) {
    return "Your CV is in great shape! 🌟 Just a few nice-to-have improvements could make it even stronger.";
  } else if (score >= 75) {
    return `Your CV is solid! 💪 With ${Math.max(1, findingCount)} key improvements, it could be even more competitive.`;
  } else if (score >= 60) {
    return `Your CV has potential! 🚀 Let's strengthen the key areas to make it really stand out.`;
  } else {
    return `Let's build a stronger CV! 📈 We'll work through the essential sections together, step by step.`;
  }
}

/**
 * Generate improvement suggestions text
 */
export function generateImprovementSuggestions(analysis: CVAnalysis): string {
  let response = `I've reviewed your CV and I have some great suggestions to strengthen it! 💪📄\n\n`;

  // Calculate score emoji
  const scoreEmoji = analysis.overall_score >= 80 ? "🌟" : analysis.overall_score >= 60 ? "💪" : "🚀";
  response += `**Current Score:** ${scoreEmoji} ${analysis.overall_score}/100\n\n`;

  response += analysis.summary + "\n\n";

  // Group by priority
  const critical = analysis.findings.filter((f) => f.priority === "critical");
  const high = analysis.findings.filter((f) => f.priority === "high");

  if (critical.length > 0) {
    response += `🔴 **CRITICAL CHANGES** (must fix)\n\n`;
    critical.forEach((suggestion) => {
      response += `**${suggestion.section || suggestion.category}**\n`;
      response += `${suggestion.explanation}\n`;
      if (suggestion.example) response += `Example: ${suggestion.example}\n`;
      response += "\n";
    });
  }

  if (high.length > 0) {
    response += `🟠 **HIGH IMPACT** (highly recommended)\n\n`;
    high.forEach((suggestion) => {
      response += `**${suggestion.section || suggestion.category}**\n`;
      response += `${suggestion.explanation}\n`;
      if (suggestion.example) response += `Example: ${suggestion.example}\n`;
      response += "\n";
    });
  }

  if (analysis.industrySpecificTips && analysis.industrySpecificTips.length > 0) {
    response += `💡 **INDUSTRY-SPECIFIC TIPS**\n\n`;
    analysis.industrySpecificTips.forEach((tip) => {
      response += `✓ ${tip}\n`;
    });
    response += "\n";
  }

  response += `---\n\nWould you like me to:\n`;
  response += `✏️ **Help rewrite any section** - Tell me which area to improve\n`;
  response += `💾 **Create tailored bullet points** - Share more about a specific role or achievement\n`;
  response += `🎯 **Focus on a specific industry** - Let me customize tips for your target role\n`;
  response += `📋 **Generate a new version** - Start fresh with improved structure\n\n`;
  response += `What would be most helpful? 😊`;

  return response;
}

/**
 * Generate section-specific help
 */
export function generateSectionHelp(section: string, currentContent: string, role?: string): string {
  const sectionUpper = section.toLowerCase();

  if (sectionUpper.includes("experience")) {
    return `📝 **Improving Your Experience Section**

**Current approach (weak):**
"Responsible for managing projects and working with teams"

**Better approach (strong):**
"Led cross-functional team of 8 to deliver Q4 roadmap 2 weeks early, increasing team velocity by 35%"

**Formula: [Action verb] + [What] + [Result/Impact]**

Action verbs: Led, Developed, Delivered, Architected, Transformed, Increased, Reduced, Launched
Metrics: %, $, time saved, team size, efficiency gains

**Your turn:**
Try rewriting one experience point using this formula! What would you like to highlight? 🚀`;
  }

  if (sectionUpper.includes("skill")) {
    return `💡 **Improving Your Skills Section**

**Group skills strategically:**
- Technical: React, TypeScript, Node.js, PostgreSQL
- Soft Skills: Leadership, Agile, Problem-solving
- Tools: Figma, JIRA, Git

**Match job requirements:**
Look at the job posting and include skills they mention.

**Prioritize:**
Put your strongest skills first.

**Industry-specific for ${role}:**
${role?.includes("Engineer") ? "Include specific languages/frameworks, tools, methodologies" : ""}
${role?.includes("Product") ? "Include analytics tools, prototyping tools, research methods" : ""}
${role?.includes("Design") ? "Include design tools, design systems, UX processes" : ""}

What skills would you like to highlight? ✨`;
  }

  if (sectionUpper.includes("summary")) {
    return `📌 **Improving Your Professional Summary**

**Template:**
"[Job Title] with [X years] experience in [key area]. Expertise in [2-3 main strengths]. Proven track record of [key achievement]."

**Example:**
"Product Manager with 7 years driving growth in SaaS. Expertise in user research and data-driven roadmap prioritization. Increased user retention by 40% through targeted feature releases."

**Make it:**
✓ Specific (mention achievements, not just responsibilities)
✓ Tailored (adjust for each application)
✓ Quantified (include numbers when possible)
✓ Forward-focused (show what value you'll bring)

What would you like your summary to emphasize? 🎯`;
  }

  return `I can help improve your ${section}! What specific aspect would you like to focus on? 📝`;
}
