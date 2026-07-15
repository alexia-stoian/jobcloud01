/**
 * Interview Q&A Extraction and Storage
 * 
 * Detects interview questions and answers from conversation flow
 * and prepares them for artifact storage
 */

import * as artifactDAL from '@/lib/artifacts/dal';

export interface InterviewQAPair {
  question: string;
  answer: string;
  sessionId?: string;
}

/**
 * Detect if the user message is answering an interview question
 * Returns the extracted question and answer if detected
 */
export function detectInterviewAnswer(
  userMessage: string,
  previousAssistantMessage: string
): InterviewQAPair | null {
  // Check if previous message was an interview question
  // Common interview question patterns:
  const questionPatterns = [
    /^\s*(?:\*\*)?Q\d+:|Tell me about yourself|Why do you want|What is your experience|How would you|What are your strengths|What are your weaknesses|Describe a time|Tell me about a project|How do you handle|What is your biggest/i,
    /^Let's start with question|Next question|Question \d+/i
  ];

  const isInterviewContext = questionPatterns.some(pattern => 
    pattern.test(previousAssistantMessage)
  );

  if (!isInterviewContext) {
    return null;
  }

  // Extract question from previous message
  let extractedQuestion = '';
  
  // Try to find Q&A format
  const qaMatch = previousAssistantMessage.match(/\*\*Q\d+:\*?\*?\s*([^\n*]+)/);
  if (qaMatch) {
    extractedQuestion = qaMatch[1].trim();
  } else {
    // Look for common interview question starters
    const questionMatch = previousAssistantMessage.match(
      /(?:Tell me about|Why do you|What (?:is|are|would)|How (?:would|do you)|Describe|Can you)[^?!]*[?!]/i
    );
    if (questionMatch) {
      extractedQuestion = questionMatch[0].trim();
    }
  }

  if (!extractedQuestion) {
    return null;
  }

  // Use the user's message as their answer
  return {
    question: extractedQuestion,
    answer: userMessage.trim(),
  };
}

/**
 * Store interview Q&A to artifacts
 */
export async function storeInterviewQA(
  userId: string,
  qa: InterviewQAPair
): Promise<void> {
  try {
    await artifactDAL.store(
      userId,
      'interview_qa',
      qa.answer,
      {
        question: qa.question,
        sessionId: qa.sessionId,
        source: 'user_interview_practice'
      }
    );
  } catch (error) {
    console.error("Failed to store interview Q&A:", error);
    // Don't fail the request - artifact storage is optional
  }
}
