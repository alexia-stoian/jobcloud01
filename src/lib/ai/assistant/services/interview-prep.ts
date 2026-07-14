/**
 * Interview Preparation Service
 * 
 * Handles interview practice mode, mock interviews, and feedback generation
 * Supports personality shift for mock interview mode (minimal emojis, professional)
 */

import type { CandidateProfile } from "@prisma/client";

export interface InterviewQuestion {
  id: string;
  type: "opening" | "behavioral" | "situational" | "technical" | "cultural" | "closing";
  question: string;
  followUpPattern?: string;
  rubric?: string;
}

export interface InterviewState {
  currentQuestion: number;
  totalQuestions: number;
  answers: string[];
  mode: "practice" | "mock";
  isInterviewerMode: boolean;
  concluded: boolean;
}

export interface InterviewFeedback {
  overallScore: number;
  strengths: string[];
  improvements: string[];
  starAnalysis?: {
    situation: string;
    task: string;
    action: string;
    result: string;
  };
  improvedVersion?: string;
  encouragement: string;
}

/**
 * Build interview question bank tailored to job
 */
export function buildInterviewQuestionBank(
  jobTitle: string,
  company: string,
  requirements?: string
): InterviewQuestion[] {
  const questions: InterviewQuestion[] = [];

  // Opening question
  questions.push({
    id: "q1-opening",
    type: "opening",
    question: `Tell me about yourself and why you're interested in this ${jobTitle} position with ${company}.`
  });

  // Behavioral questions (2-3)
  questions.push({
    id: "q2-behavioral-1",
    type: "behavioral",
    question: "Can you describe a time when you had to lead a project or team? What was the outcome?",
    rubric: "Look for STAR format: Situation, Task, Action, Result"
  });

  questions.push({
    id: "q3-behavioral-2",
    type: "behavioral",
    question: "Tell me about a time you faced a significant challenge. How did you handle it?",
    rubric: "Listen for problem-solving approach and resilience"
  });

  // Situational questions (1-2)
  questions.push({
    id: "q4-situational",
    type: "situational",
    question: `If you encountered a disagreement with a colleague about the technical approach for a feature, how would you handle it?`
  });

  // Technical question
  if (jobTitle.toLowerCase().includes("engineer") || jobTitle.toLowerCase().includes("developer")) {
    questions.push({
      id: "q5-technical",
      type: "technical",
      question: `What's your experience with ${requirements ? "the technologies mentioned in our job posting" : "modern development practices"}? Can you give an example of a project where you used them?`
    });
  } else if (jobTitle.toLowerCase().includes("product")) {
    questions.push({
      id: "q5-technical",
      type: "technical",
      question:
        "Walk me through a product decision you made using data. How did you measure success?"
    });
  } else {
    questions.push({
      id: "q5-technical",
      type: "technical",
      question: `What's your experience with the key competencies for this role, and how have you applied them?`
    });
  }

  // Cultural fit question
  questions.push({
    id: "q6-cultural",
    type: "cultural",
    question: `${company} values ${requirements ? "continuous learning and innovation" : "collaboration and impact"}. Can you share an example of how you embody this?`
  });

  // Behavioral question 3
  questions.push({
    id: "q7-behavioral-3",
    type: "behavioral",
    question: "Describe a time when you had to learn something new quickly. What did you do?",
    rubric: "Look for growth mindset and learning ability"
  });

  // Situational question 2
  questions.push({
    id: "q8-situational-2",
    type: "situational",
    question: "What would you do if you realized you made a mistake that impacted your team?",
    rubric: "Listen for accountability and communication"
  });

  // Strengths/fit question
  questions.push({
    id: "q9-fit",
    type: "behavioral",
    question: "What are you most proud of in your career so far?",
    rubric: "Look for alignment with role and genuine passion"
  });

  // Salary/expectations question
  questions.push({
    id: "q10-expectations",
    type: "situational",
    question: "What are your salary expectations for this role?",
    rubric: "Listen for reasonableness and confidence"
  });

  // Closing question
  questions.push({
    id: "q11-closing",
    type: "closing",
    question: "Do you have any questions for me or for the team?"
  });

  return questions;
}

/**
 * Determine if answer is too short/vague
 */
export function isAnswerInsubstantial(answer: string): boolean {
  const wordCount = answer.trim().split(/\s+/).length;
  return wordCount < 20 || answer.length < 100;
}

/**
 * Generate follow-up probe for short answers
 */
export function generateFollowUpProbe(questionType: string): string {
  switch (questionType) {
    case "behavioral":
      return "Can you tell me more about your specific role in that situation? What exactly did you do?";
    case "situational":
      return "Help me understand your thinking. What factors did you consider?";
    case "technical":
      return "Can you give me more details? What was the specific outcome or result?";
    case "opening":
      return "That's great. What attracts you specifically to this role?";
    default:
      return "Could you expand on that? I'd like to understand more.";
  }
}

/**
 * Get next question in sequence
 */
export function getNextQuestion(currentIndex: number, questionBank: InterviewQuestion[]): InterviewQuestion | null {
  if (currentIndex >= questionBank.length) {
    return null;
  }
  return questionBank[currentIndex];
}

/**
 * Generate practice mode feedback
 */
export function generatePracticeFeedback(
  userAnswer: string,
  question: InterviewQuestion
): InterviewFeedback {
  const wordCount = userAnswer.split(/\s+/).length;

  // Analyze STAR for behavioral questions
  let starAnalysis: {
    situation: string;
    task: string;
    action: string;
    result: string;
  } | undefined;
  if (question.type === "behavioral") {
    starAnalysis = analyzeSTAR(userAnswer);
  }

  // Generate feedback
  const strengths = [];
  const improvements = [];

  // Basic analysis
  if (wordCount > 50) {
    strengths.push("Good depth - you provided specific examples");
  }

  if (wordCount < 20) {
    improvements.push("Try to provide more detail. Expand your answer with specific examples and outcomes.");
  }

  if (userAnswer.toLowerCase().includes("result") || userAnswer.toLowerCase().includes("outcome")) {
    strengths.push("You focused on results and impact");
  }

  if (userAnswer.toLowerCase().includes("i")) {
    strengths.push("You took ownership and spoke with confidence");
  } else {
    improvements.push("Use 'I' statements to show personal responsibility");
  }

  if (question.type === "behavioral" && !starAnalysis) {
    improvements.push("Try structuring with STAR: Situation → Task → Action → Result");
  }

  const feedback: InterviewFeedback = {
    overallScore: Math.min(10, Math.max(5, wordCount / 15)),
    strengths: strengths.length > 0 ? strengths : ["You showed engagement"],
    improvements: improvements.length > 0 ? improvements : ["Consider adding more specific metrics"],
    starAnalysis,
    improvedVersion:
      question.type === "behavioral"
        ? generateSTARExample(question.question)
        : generateBetterAnswer(userAnswer, question),
    encouragement: "Great effort! Keep going, you're doing well! 💪"
  };

  return feedback;
}

/**
 * Analyze STAR structure in answer
 */
function analyzeSTAR(answer: string): {
  situation: string;
  task: string;
  action: string;
  result: string;
} {
  const lower = answer.toLowerCase();

  return {
    situation: lower.includes("situation") || lower.includes("was working") ? "✓ Mentioned" : "✗ Missing",
    task: lower.includes("task") || lower.includes("need") || lower.includes("goal") ? "✓ Mentioned" : "✗ Missing",
    action: lower.includes("i") || lower.includes("did") || lower.includes("took") ? "✓ Mentioned" : "✗ Missing",
    result: lower.includes("result") ||
      lower.includes("outcome") ||
      lower.includes("achieved") ||
      lower.includes("%")
      ? "✓ Mentioned"
      : "✗ Missing"
  };
}

/**
 * Generate example STAR answer
 */
function generateSTARExample(_question: string): string {
  return `
**STAR Example:**

**Situation:** "I was working in a team of 5 engineers and we noticed our API was causing performance issues."

**Task:** "I took ownership of diagnosing and fixing the problem, which was affecting 20% of our users."

**Action:** "I analyzed the code, identified an N+1 query issue, and implemented query caching. I also led the deployment strategy."

**Result:** "We reduced API response time by 40% and improved user satisfaction from 7.2 to 8.5 out of 10."

This structure helps us understand your specific contribution and the impact you had! 🎯`;
}

/**
 * Generate better answer example
 */
function generateBetterAnswer(currentAnswer: string, _question: InterviewQuestion): string {
  const wordCount = currentAnswer.split(/\s+/).length;

  if (wordCount < 20) {
    return "Your answer was a bit brief. Try including: what the situation was, what you specifically did, and what the result was.";
  }

  return "Your answer was good! To make it even stronger, consider adding specific metrics or outcomes that show the impact of your actions.";
}

/**
 * Generate comprehensive mock interview feedback
 */
export function generateMockInterviewFeedback(
  answers: string[],
  _questions: InterviewQuestion[],
  _userProfile: CandidateProfile
): string {
  const totalQuestions = answers.length;
  const avgWordCount = answers.reduce((sum, ans) => sum + ans.split(/\s+/).length, 0) / totalQuestions;

  // Calculate overall score
  const score = Math.min(10, Math.max(5, avgWordCount / 20));
  const stars = Math.round(score);

  let response = `📊 **OVERALL PERFORMANCE: ${stars}/10** ${"⭐".repeat(stars)}${"☆".repeat(10 - stars)}\n\n`;

  response += `**Overall Impression:**\n`;
  if (score >= 8) {
    response += `You had a strong interview! You provided thoughtful answers with good examples. Your communication was clear and confident. 🌟\n\n`;
  } else if (score >= 6) {
    response += `You did well overall! Your answers were solid. With a bit more specific examples and metrics, you'd be even more compelling. 💪\n\n`;
  } else {
    response += `You showed good engagement. To improve your next interview, focus on providing more specific examples and quantifiable results. 🚀\n\n`;
  }

  // Strengths
  response += `🌟 **YOUR STRENGTHS**\n\n`;

  const strengths = [];
  const fullAnswersCount = answers.filter((a) => a.split(/\s+/).length > 30).length;
  if (fullAnswersCount > totalQuestions / 2) {
    strengths.push("**Clear Communication:** You provided detailed, structured answers");
  }

  const emotionalCount = answers.filter((a) => a.toLowerCase().includes("i")).length;
  if (emotionalCount > totalQuestions / 2) {
    strengths.push("**Ownership & Confidence:** You spoke with personal ownership and conviction");
  }

  const exampleCount = answers.filter((a) => /\d+|%|\$/.test(a)).length;
  if (exampleCount > 0) {
    strengths.push("**Results-Focused:** You backed up your answers with metrics and concrete results");
  }

  if (strengths.length === 0) {
    strengths.push("**Engagement:** You were attentive and answered all questions");
  }

  strengths.forEach((s) => {
    response += `${s}\n`;
  });

  response += `\n💡 **AREAS TO IMPROVE**\n\n`;

  const improvements = [];

  if (avgWordCount < 25) {
    improvements.push(
      "**Provide More Detail:** Your answers could use more specific examples. Aim for 40-60 second answers."
    );
  }

  const starCount = answers.filter((a) => /situation|task|action|result/i.test(a)).length;
  if (starCount < totalQuestions / 2) {
    improvements.push(
      "**Use STAR Method:** For behavioral questions, structure with Situation → Task → Action → Result"
    );
  }

  if (improvements.length === 0) {
    improvements.push("**Challenge Yourself:** Consider what edge cases or follow-ups might arise and prepare for them");
  }

  improvements.forEach((imp) => {
    response += `${imp}\n`;
  });

  response += `\n🎯 **TOP RECOMMENDATIONS**\n\n`;
  response += `**Before Your Real Interview:**\n`;
  response += `1. Practice the STAR method - write out 5 example stories\n`;
  response += `2. Research the company and role deeply\n`;
  response += `3. Prepare 3-5 questions to ask them\n\n`;

  response += `**During the Interview:**\n`;
  response += `1. Take a moment to think before answering\n`;
  response += `2. Give specific examples with numbers when possible\n`;
  response += `3. Connect your experience to their job description\n`;
  response += `4. Show genuine interest in the role\n\n`;

  response += `**After the Interview:**\n`;
  response += `1. Send a thank you email\n`;
  response += `2. Reference something specific from the conversation\n`;
  response += `3. Reiterate your interest in the role\n\n`;

  response += `💪 **FINAL THOUGHTS**\n\n`;
  response += `You're already doing great things! Your background is strong. Focus on these improvements and you'll be even more competitive! 🚀\n\n`;
  response += `Ready to do another practice round, work on specific questions, or try the real mock interview? 😊`;

  return response;
}
