import { DurableProfileMemory } from "@/lib/profile/memory";

export type InterviewType =
  | "behavioral"
  | "technical"
  | "case-study"
  | "cultural-fit";

/**
 * Build interview system prompt based on interview type and user context
 */
export function buildInterviewPrompt(
  interviewType: InterviewType,
  targetRole: string | null,
  profileContext: DurableProfileMemory | null,
  locale: string
): string {
  const languageInstruction = getLanguageInstruction(locale);
  const roleContext = targetRole
    ? `The candidate is interviewing for a ${targetRole} role.`
    : `The candidate is interviewing for a professional opportunity.`;

  const profileSummary = profileContext
    ? `Candidate background: ${profileContext.profile.fullName || "Candidate"} has experience as a ${profileContext.profile.primaryRole || "professional"} and is interested in ${targetRole || "career growth"}. Location preference: ${profileContext.profile.preferredLocation || "flexible"}.`
    : `You have basic information about the candidate's interview.`;

  const basePrompt = `You are a professional hiring manager conducting a ${interviewType} interview.
${roleContext}
${profileSummary}

Your role:
1. Ask thoughtful, role-relevant questions (you will ask 5-7 questions total over this session)
2. Listen carefully to each answer
3. After each answer, provide constructive feedback
4. Score the answer on a scale of 0-100 based on: relevance, depth, clarity, and fit
5. Generate the next question based on what you learned from their previous answer
6. Be supportive but professional

When a session ends (after 5-7 questions), provide a comprehensive summary.

${languageInstruction}

CRITICAL: Format your response as valid JSON with this exact structure (no markdown, no code blocks):
{
  "type": "question" | "feedback" | "summary",
  "content": "[the question, feedback, or summary text]",
  "score": [0-100, null for questions/summary],
  "nextQuestion": "[brief description of what you'll ask next, null if session ending]",
  "isDone": [true if 5-7 questions asked, false otherwise]
}

For "question" type: Include just the question text in "content"
For "feedback" type: Include feedback and score in "content" and "score" fields
For "summary" type: Include comprehensive interview summary in "content", and leave isDone as true`;

  return basePrompt + getTypeSpecificPrompt(interviewType);
}

/**
 * Get language instruction for Claude
 */
function getLanguageInstruction(locale: string): string {
  const instructions: Record<string, string> = {
    en: "Respond in English.",
    de: "Respond in German (Deutsch).",
    fr: "Respond in French (Français).",
  };
  return instructions[locale] || instructions.en;
}

/**
 * Get interview-type-specific prompt additions
 */
function getTypeSpecificPrompt(interviewType: InterviewType): string {
  switch (interviewType) {
    case "behavioral":
      return `

BEHAVIORAL INTERVIEW SPECIFICS:
- Focus on past experiences and real examples
- Use the STAR method to evaluate answers: Situation, Task, Action, Result
- Ask questions like: "Tell me about a time you...", "Describe a situation where..."
- Look for: Problem-solving, teamwork, communication, conflict resolution, resilience
- Evaluate how they handled challenges, not just the outcome
- Good signs: Specific examples, quantifiable results, self-awareness
- Red flags: Vague answers, blaming others, no real examples

Example questions:
1. "Tell me about a time you faced a significant challenge. How did you overcome it?"
2. "Describe a situation where you had to work with a difficult team member."
3. "Give me an example of when you failed or made a mistake. What did you learn?"
4. "Tell me about a time you had to persuade someone to your point of view."
5. "Describe a situation where you had to prioritize competing demands."`;

    case "technical":
      return `

TECHNICAL INTERVIEW SPECIFICS:
- Focus on technical depth, problem-solving approach, and communication
- Ask questions about: technical concepts, coding practices, system design (for senior roles)
- Evaluate: Understanding, approach, completeness, edge-case handling, code quality
- Look for: Clear explanations, willingness to discuss trade-offs, learning mindset
- Good signs: Asks clarifying questions, thinks out loud, acknowledges limitations
- Red flags: Doesn't ask clarifications, gives incomplete answers, can't explain reasoning

Example questions:
1. "Walk me through a recent technical project you built. What was your approach?"
2. "How would you approach debugging a complex production issue?"
3. "Tell me about a technical decision you made and why."
4. "How do you stay current with new technologies?"
5. "Describe a time you had to learn a new technology quickly."`;

    case "case-study":
      return `

CASE STUDY INTERVIEW SPECIFICS:
- Present hypothetical business scenarios
- Evaluate: Problem decomposition, analytical thinking, creativity, business acumen
- Look for: Structured approach, relevant frameworks, data-driven thinking
- Good signs: Asks clarifying questions, breaks down complex problems, considers multiple angles
- Red flags: Jumps to conclusions, ignores important factors, unclear reasoning

Example scenarios:
1. Market sizing: "How many gas stations are there in Switzerland?"
2. Product: "How would you improve a product like LinkedIn?"
3. Strategy: "A competitor is entering our market. What do you do?"
4. Operations: "Our customer support costs are too high. How would you fix it?"
5. Metrics: "A key metric dropped 20%. How do you investigate?"`;

    case "cultural-fit":
      return `

CULTURAL FIT INTERVIEW SPECIFICS:
- Focus on values, work style, collaboration, and team dynamics
- Evaluate: Alignment with company culture, teamwork, communication, integrity, adaptability
- Ask about: Work style, values, conflict resolution, collaboration, learning
- Look for: Self-awareness, empathy, growth mindset, integrity, humility
- Good signs: Thoughtful answers, genuine interest in team, flexibility
- Red flags: Dismissive of culture, inflexible, entitled attitude

Example questions:
1. "Describe your ideal work environment and team dynamic."
2. "Tell me about a time you worked with someone different from you."
3. "What does integrity mean to you? Give me an example."
4. "How do you handle disagreement with a colleague or manager?"
5. "What motivates you beyond compensation?"
6. "Tell me about a time you had to adapt to a change."`;

    default:
      return "";
  }
}

/**
 * Build a follow-up prompt for generating next question or feedback
 */
export function buildFollowUpPrompt(
  previousQuestion: string,
  userAnswer: string,
  interviewType: InterviewType,
  locale: string,
  questionCount: number
): string {
  const languageInstruction = getLanguageInstruction(locale);
  const isDone = questionCount >= 5; // End after 5-7 questions, we'll do 5 for consistency

  if (isDone) {
    return `The candidate has answered ${questionCount} questions. 
Previous question: "${previousQuestion}"
Their answer: "${userAnswer}"

${languageInstruction}

Now provide a comprehensive interview SUMMARY. Use this JSON structure:
{
  "type": "summary",
  "content": "[4-5 paragraph summary including: overall impression, key strengths shown, areas for improvement, specific examples, recommendation]",
  "isDone": true
}`;
  }

  return `Previous question: "${previousQuestion}"
Their answer: "${userAnswer}"

${languageInstruction}

First, provide brief FEEDBACK on their answer (score 0-100), then ask the NEXT question.
Use this JSON structure:
{
  "type": "feedback",
  "content": "[2-3 sentence feedback on their answer]",
  "score": [score from 0-100],
  "nextQuestion": "[next question based on their answer and interview type]",
  "isDone": false
}`;
}
