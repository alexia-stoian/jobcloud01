/**
 * Artifact Retrieval and Display
 * 
 * Functions to retrieve stored artifacts and format them for display with personality
 */

import * as dal from './dal';
import type { StoredArtifactData } from './dal';

/**
 * Find the most recent artifact for a user by company
 * Searches for cover letters or job postings related to a company
 * 
 * @param userId - User ID
 * @param company - Company name to search for
 * @returns Most recent matching artifact or null
 */
export async function findRecentByCompany(
  userId: string,
  company: string
): Promise<StoredArtifactData | null> {
  // Search through cover letters and job postings for this company
  const types: Array<'cover_letter' | 'job_posting'> = ['cover_letter', 'job_posting'];
  
  for (const type of types) {
    const artifacts = await dal.findByUserAndType(userId, type);
    
    // Find first artifact matching the company (most recent first due to ordering)
    const match = artifacts.find(artifact => {
      const metadata = artifact.metadata as Record<string, unknown>;
      const metaCompany = metadata.company as string | undefined;
      return metaCompany?.toLowerCase().includes(company.toLowerCase());
    });
    
    if (match) {
      return match;
    }
  }
  
  return null;
}

/**
 * Find interview Q&A related to a question/topic
 * Searches for interview answers containing keywords
 * 
 * @param userId - User ID
 * @param questionPattern - Keywords or pattern to search for
 * @returns Most recent matching Q&A or null
 */
export async function findRecentByQuestion(
  userId: string,
  questionPattern: string
): Promise<StoredArtifactData | null> {
  const artifacts = await dal.findByUserAndType(userId, 'interview_qa');
  
  // Find first artifact matching the question pattern (most recent first)
  const match = artifacts.find(artifact => {
    const metadata = artifact.metadata as Record<string, unknown>;
    const question = (metadata.question as string) || '';
    const content = artifact.content;
    
    const pattern = questionPattern.toLowerCase();
    return (
      question.toLowerCase().includes(pattern) ||
      content.toLowerCase().includes(pattern)
    );
  });
  
  return match || null;
}

/**
 * Format artifact for display with cheerful personality
 * 
 * @param artifact - The artifact to display
 * @returns Formatted display string
 */
export function formatArtifactForDisplay(artifact: StoredArtifactData): string {
  const metadata = artifact.metadata as Record<string, unknown>;
  
  if (artifact.type === 'cover_letter') {
    const company = (metadata.company as string) || 'that company';
    const jobTitle = (metadata.jobTitle as string) || 'that role';
    
    return `Here's your cover letter for ${jobTitle} at ${company}! 📝✨

---

${artifact.content}

---

Would you like to:
✏️ **Edit this** (make changes, add details, shorten)
📋 **See another version** (different emphasis)
💾 **Save as final** (you're happy with it)
✅ **Use it now** (ready to submit)

Let me know! 😊`;
  }

  if (artifact.type === 'job_posting') {
    const company = (metadata.company as string) || 'that company';
    
    return `Here's that job posting from ${company}! 📋✨

---

${artifact.content}

---

Ready to:
📝 **Prepare a cover letter** for this role
🎤 **Practice interview prep** based on this posting
💬 **Discuss any concerns** about the position

What would help most? 😊`;
  }

  if (artifact.type === 'interview_qa') {
    const question = (metadata.question as string) || 'that question';
    
    return `Here's your answer to: "${question}" 🎤✨

---

${artifact.content}

---

Would you like to:
✏️ **Refine this answer** (more concise, add more detail)
🎯 **See next question** (keep practicing)
💾 **Save this version** (you're happy with it)

Let me know! 😊`;
  }

  // Default fallback
  return `Found your saved artifact! Here it is:\n\n---\n\n${artifact.content}\n\n---\n\nNeed anything else?`;
}

/**
 * Detect if user is requesting retrieval based on keywords
 * Returns match info if retrieval intent detected
 * 
 * @param message - User message to analyze
 * @returns { isRetrievalRequest: boolean; requestType?: 'company' | 'question'; query?: string }
 */
export function detectRetrievalIntent(message: string): {
  isRetrievalRequest: boolean;
  requestType?: 'company' | 'question';
  query?: string;
} {
  const lowerMsg = message.toLowerCase();
  
  // Cover letter/job posting retrieval
  const companyMatches = message.match(
    /(?:show|retrieve|remind|get|find|display).*(?:my|that)?.*(?:cover letter|job posting|posting)?.*(?:for|at|with)?\s+([A-Za-z0-9\s&'-]+?)(?:\?|$|\.|\b(?:interview|question))/i
  );
  
  if (companyMatches?.[1]) {
    return {
      isRetrievalRequest: true,
      requestType: 'company',
      query: companyMatches[1].trim()
    };
  }
  
  // Interview answer retrieval
  const questionMatches = message.match(
    /(?:what did|remind|show|retrieve|get).*(?:i|me)?.*(?:say|answer|responded|replied).*(?:about|to|on)?\s+([A-Za-z0-9\s]+?)(?:\?|$|\.)/i
  );
  
  if (questionMatches?.[1]) {
    return {
      isRetrievalRequest: true,
      requestType: 'question',
      query: questionMatches[1].trim()
    };
  }
  
  // Catch-all patterns
  if (
    (lowerMsg.includes('show me') && lowerMsg.includes('cover letter')) ||
    (lowerMsg.includes('show me') && lowerMsg.includes('job posting')) ||
    (lowerMsg.includes('remind') && lowerMsg.includes('cover letter')) ||
    (lowerMsg.includes('remind') && lowerMsg.includes('job posting')) ||
    (lowerMsg.includes('what did i') && lowerMsg.includes('say')) ||
    (lowerMsg.includes('remind me') && lowerMsg.includes('answer'))
  ) {
    return {
      isRetrievalRequest: true,
      requestType: 'company',
    };
  }
  
  return { isRetrievalRequest: false };
}
