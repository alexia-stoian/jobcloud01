/**
 * Cover Letter Service Implementation
 * 
 * Handles full cover letter generation workflow:
 * - Job information collection
 * - Requirement analysis
 * - Letter generation with Anthropic
 * - Refinement modes (expand, summarize, rewrite)
 * - Edge case handling
 */

import type { CandidateProfile } from "@prisma/client";
import type { ExtractedCvFacts } from "@/lib/cv/extract";

type AnthropicTextContent = {
  type: "text";
  text: string;
};

type AnthropicResponse = {
  content?: AnthropicTextContent[];
  error?: { message?: string };
};

export interface JobInfo {
  title: string;
  company: string;
  description?: string;
  requirements?: string[];
  url?: string;
}

export interface CoverLetterRequest {
  jobInfo: JobInfo;
  userProfile: CandidateProfile;
  cvData?: ExtractedCvFacts;
  refinementMode?: "expand" | "summarize" | "rewrite";
  targetWordCount?: number;
  currentDraft?: string;
}

export interface CoverLetterResponse {
  letter: string;
  wordCount: number;
  title: string;
  company: string;
  emphasis: string[];
  refinementApplied?: string;
}

/**
 * Detect and extract job information from user message
 */
export function detectJobInfo(message: string): Partial<JobInfo> | null {
  // Check for URL
  const urlMatch = message.match(
    /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/
  );

  if (urlMatch) {
    return {
      url: urlMatch[0],
      description: message.replace(urlMatch[0], "").trim()
    };
  }

  // Check for company + role pattern
  // Examples: "Senior Developer at Google", "Marketing Manager, Meta"
  const companyMatch = message.match(
    /(?:for|at|with)\s+([A-Za-z0-9\s&'-]+?)(?:\s+(?:as|for)\s+([A-Za-z0-9\s]+?))?(?:\.|,|$)/i
  );

  if (companyMatch) {
    return {
      company: companyMatch[1].trim(),
      title: companyMatch[2]?.trim()
    };
  }

  // Check for role + company pattern
  // Examples: "Python Developer role at Netflix"
  const roleCompanyMatch = message.match(
    /([A-Za-z0-9\s]+)\s+(?:position|role|job)\s+(?:at|with|for)\s+([A-Za-z0-9\s&'-]+)/i
  );

  if (roleCompanyMatch) {
    return {
      title: roleCompanyMatch[1].trim(),
      company: roleCompanyMatch[2].trim()
    };
  }

  return null;
}

/**
 * Infer refinement mode from user message and current draft
 */
export function inferRefinementMode(
  userMessage: string,
  currentWordCount: number,
  requestedWordCount?: number
): "expand" | "summarize" | "rewrite" | null {
  const lowerMsg = userMessage.toLowerCase();

  // Explicit refinement requests
  if (lowerMsg.includes("rewrite") || lowerMsg.includes("different")) {
    return "rewrite";
  }

  if (
    lowerMsg.includes("shorter") ||
    lowerMsg.includes("condense") ||
    lowerMsg.includes("summarize") ||
    lowerMsg.includes("concise")
  ) {
    return "summarize";
  }

  if (
    lowerMsg.includes("longer") ||
    lowerMsg.includes("expand") ||
    lowerMsg.includes("more detail") ||
    lowerMsg.includes("elaborate")
  ) {
    return "expand";
  }

  // Numeric word count comparison
  if (requestedWordCount) {
    if (requestedWordCount > currentWordCount * 1.2) {
      return "expand";
    }
    if (requestedWordCount < currentWordCount * 0.8) {
      return "summarize";
    }
  }

  // Tone/content adjustments (more formal, less formal, add focus, etc.)
  if (
    lowerMsg.includes("tone") ||
    lowerMsg.includes("formal") ||
    lowerMsg.includes("casual") ||
    lowerMsg.includes("professional")
  ) {
    return "rewrite";
  }

  if (
    lowerMsg.includes("focus on") ||
    lowerMsg.includes("emphasize") ||
    lowerMsg.includes("highlight")
  ) {
    return "rewrite";
  }

  return null;
}

/**
 * Generate cover letter with Anthropic API using fetch
 */
export async function generateCoverLetter(
  request: CoverLetterRequest,
  anthropicApiKey: string,
  anthropicModel: string
): Promise<CoverLetterResponse> {
  // Build the prompt for cover letter generation
  const prompt = buildCoverLetterPrompt(request);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: anthropicModel,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = (await response.json()) as AnthropicResponse;
  const content = data.content?.[0];

  if (!content || content.type !== "text") {
    throw new Error("Unexpected response format from Anthropic");
  }

  const letter = content.text;
  const wordCount = countWords(letter);

  // Parse what we emphasized
  const emphasis = parseEmphasis(request, letter);

  return {
    letter,
    wordCount,
    title: request.jobInfo.title || "Unknown Role",
    company: request.jobInfo.company || "Unknown Company",
    emphasis,
    refinementApplied: request.refinementMode
  };
}

/**
 * Build the prompt for Anthropic based on request
 */
function buildCoverLetterPrompt(request: CoverLetterRequest): string {
  const { jobInfo, userProfile, cvData, refinementMode, targetWordCount, currentDraft } = request;

  let prompt = `Generate a professional cover letter with the following details:\n\n`;

  prompt += `JOB DETAILS:\n`;
  prompt += `- Position: ${jobInfo.title || "Not specified"}\n`;
  prompt += `- Company: ${jobInfo.company || "Not specified"}\n`;
  if (jobInfo.description) {
    prompt += `- Description/Requirements: ${jobInfo.description}\n`;
  }
  prompt += `\n`;

  prompt += `CANDIDATE PROFILE:\n`;
  prompt += `- Name: ${userProfile.fullName || "Not provided"}\n`;
  prompt += `- Current Situation: ${userProfile.currentJobSituation || "Not specified"}\n`;
  prompt += `- Primary Role: ${userProfile.primaryRole || "Not specified"}\n`;
  if (userProfile.targetRoles) {
    prompt += `- Target Roles: ${userProfile.targetRoles}\n`;
  }
  prompt += `\n`;

  if (cvData) {
    prompt += `CANDIDATE EXPERIENCE:\n`;
    prompt += `Name: ${cvData.fullName || "Not provided"}\n`;
    prompt += `Primary Role: ${cvData.primaryRole || "Not specified"}\n`;
    prompt += `Current Situation: ${cvData.currentJobSituation || "Not specified"}\n`;
    if (cvData.qualifications && cvData.qualifications.length > 0) {
      prompt += `Qualifications: ${cvData.qualifications.map((q) => q.value).join(", ")}\n`;
    }
    prompt += `\n`;
  }

  if (refinementMode && currentDraft) {
    prompt += `REFINEMENT MODE: ${refinementMode.toUpperCase()}\n`;
    prompt += `CURRENT DRAFT:\n${currentDraft}\n\n`;

    if (refinementMode === "expand") {
      prompt += `Task: Expand this cover letter to approximately ${targetWordCount || 350} words. Add more specific examples, achievements, and details about your fit for this role.\n`;
    } else if (refinementMode === "summarize") {
      prompt += `Task: Condense this cover letter to approximately ${targetWordCount || 250} words while maintaining impact. Keep key points and remove redundancy.\n`;
    } else if (refinementMode === "rewrite") {
      prompt += `Task: Rewrite this cover letter with a different emphasis or tone. Maintain professionalism but provide fresh perspective.\n`;
    }
  }

  prompt += `REQUIREMENTS:\n`;
  prompt += `- Professional cover letter format (salutation, 3-4 paragraphs, closing)\n`;
  prompt += `- 250-400 words (optimal length)\n`;
  prompt += `- Tailored to the specific role and company\n`;
  prompt += `- Include relevant experience from candidate's background\n`;
  prompt += `- Show enthusiasm and genuine interest\n`;
  prompt += `- Action-oriented language with specific achievements\n`;
  prompt += `- No fabricated experience - only use provided information\n`;

  return prompt;
}

/**
 * Parse what was emphasized in the generated letter
 */
function parseEmphasis(request: CoverLetterRequest, generatedLetter: string): string[] {
  const emphasis: string[] = [];

  const { jobInfo, userProfile } = request;

  // Look for skills/experience mentioned in the letter
  if (userProfile.primaryRole && generatedLetter.includes(userProfile.primaryRole)) {
    emphasis.push(`Your experience as ${userProfile.primaryRole}`);
  }

  if (jobInfo.title && generatedLetter.includes(jobInfo.title)) {
    emphasis.push(`Relevance to ${jobInfo.title} role`);
  }

  if (jobInfo.company && generatedLetter.includes(jobInfo.company)) {
    emphasis.push(`Interest in ${jobInfo.company}`);
  }

  // Generic emphasis points if no specific matches
  if (emphasis.length === 0) {
    emphasis.push("Professional background");
    emphasis.push("Relevant skills and experience");
  }

  return emphasis;
}

/**
 * Count words in text
 */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).length;
}

/**
 * Generate edge case response
 */
export function handleEdgeCase(
  edgeCase: "no-experience" | "title-only" | "multiple-versions" | "generic-template",
  jobInfo: JobInfo,
  userProfile: CandidateProfile
): string {
  switch (edgeCase) {
    case "no-experience":
      return `I've created a cover letter that focuses on your **transferable skills** and your strong ability to learn quickly! 💪 

While you may not have direct experience in this area, I've highlighted:
- Your **${userProfile.primaryRole || "relevant skills"}** from your background which applies to this position ✨
- Your proven track record of **learning and adapting in new areas** 🚀
- Your genuine enthusiasm for **${jobInfo.company || "this opportunity"}** 🌟

This positions you as a motivated candidate ready to grow! 🔥`;

    case "title-only":
      return `Perfect! I can create a general cover letter for **${jobInfo.title}** roles! 📝 

Here's a template you can customize with the specific company name later. Just replace [Company Name] with the actual company! 🎯`;

    case "multiple-versions":
      return `Smart thinking! 💡 I can create different versions that emphasize different aspects:

**Version 1:** Skills-focused (highlights technical abilities) 💻
**Version 2:** Experience-focused (emphasizes past achievements) 📊
**Version 3:** Passion-focused (shows enthusiasm and cultural fit) ❤️

Which ones would you like? I can do all three! 🚀✨`;

    case "generic-template":
      return `I've created a strong generic template for [Company Name] **${jobInfo.title}** positions! 📝✨

You can customize this with specific company details when applying! 🎯`;

    default:
      return "Let me help you with this cover letter!";
  }
}
