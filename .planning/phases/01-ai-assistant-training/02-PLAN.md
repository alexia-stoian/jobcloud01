# Implementation Plan: AI Assistant Training

**Phase:** AI Assistant Training (Phase 01)  
**Specification:** `01-SPEC.md` (locked)  
**Branch:** `feature/assistant-training-gsd`  
**Planned Duration:** 5-7 implementation waves  
**Last Updated:** 2026-07-14

---

## Wave Overview

```
Wave 1: System Prompt & Session Awareness (foundation)
  ↓
Wave 2: Cover Letter Service (primary feature)
  ↓
Wave 3: CV Enhancement Service (secondary feature)
  ↓
Wave 4: Interview Prep + Mock Interview Mode (complex feature)
  ↓
Wave 5: Scope Enforcement & Off-Topic Detection (safety)
  ↓
Wave 6: Testing & Verification (gate before shipping)
```

---

## Wave 1: System Prompt & Session Awareness

**Goal:** Create versioned system prompt with personality, scope rules, self-reference mechanism. Implement session state management to track user through phases and resume incomplete work.

**Owner:** Primary  
**Duration:** ~1.5 hours  
**Deliverables:** System prompt file + session awareness route handler

### Task 1.1: Create Versioned System Prompt File

**File:** `src/lib/ai/assistant/system-prompt.ts`

**What:**
- Export versioned system prompt with major sections:
  - Personality & tone rules (emojis, encouragement, etc.)
  - Phase definitions (greeting, profile, CV, services)
  - Service specifications (cover letter, CV, interview)
  - Scope enforcement rules (on-topic, off-topic patterns)
  - Self-reference instruction (assistant explains own behavior)
  - Mock interview mode rules
  - Hallucination prevention rules
  - Markdown rendering requirements

**Code Structure:**
```typescript
export const ASSISTANT_VERSION = "1.0.0";
export const ASSISTANT_SYSTEM_PROMPT = `
You are JobCloud's Career Assistant...
[Full prompt with all sections]
`;

export function getSystemPrompt(
  userPhase: "greeting" | "profile" | "cv-extraction" | "services",
  mode?: "normal" | "interviewer"
): string {
  // Return full system prompt with optional mode-specific adjustments
  // If mode === "interviewer": reduce emojis, add professional tone override
}
```

**Verification:**
- ✅ System prompt >1500 chars (comprehensive)
- ✅ All personality rules from prompt.txt included
- ✅ All scope rules explicitly stated
- ✅ Self-reference instruction included ("consult your own guidelines to...")
- ✅ Mock interview mode rules included
- ✅ Function exports properly typed

### Task 1.2: Define Session State Schema

**Files:** 
- Update `prisma/schema.prisma` (add `assistantState` to `CandidateProfile`)
- Create `src/types/assistant-state.ts`

**What:**
- Extend `CandidateProfile` model to store JSON `assistantState` field
- Define TypeScript type for session state:
  ```typescript
  type AssistantState = {
    version: string;
    currentPhase: "greeting" | "profile" | "cv-extraction" | "services";
    currentService?: "cover-letter" | "cv-enhancement" | "interview-prep";
    isFirstTime: boolean;
    profileCollected: boolean;
    cvExtracted: boolean;
    metadata: {
      sessionStartedAt: string;
      lastActivityAt: string;
      phaseHistory: string[];
    };
    services: {
      coverLetter?: {
        lastGeneratedRole?: string;
        lastDraftWordCount?: number;
        refinementMode?: "expand" | "summarize" | "rewrite";
      };
      cvEnhancement?: {
        lastAnalyzedAt?: string;
        suggestionsApplied?: string[];
      };
      interviewPrep?: {
        currentMode?: "practice" | "mock";
        mockInterviewState?: {
          currentQuestion: number;
          totalQuestions: number;
          answers: string[];
          interviewerMode: boolean;
        };
      };
    };
  };
  ```

**Verification:**
- ✅ Prisma schema compiles
- ✅ Type is fully specified
- ✅ Supports resume from any phase
- ✅ Includes all required metadata

### Task 1.3: Implement Session Awareness Route Handler

**File:** Update `src/app/api/onboarding/assistant/route.ts`

**What:**
- Load session state from DB at start of request
- Determine user phase from state
- Route to appropriate greeting/service handler
- Persist state changes after processing
- Return response formatted for user's current mode

**Code Pattern:**
```typescript
export async function POST(req: Request) {
  const { message, userId } = await req.json();
  
  // Load current state
  const profile = await db.candidateProfile.findUnique({ 
    where: { userId },
    select: { assistantState: true, ... }
  });
  const state = profile?.assistantState || createInitialState();
  
  // Route based on phase
  let response;
  switch (state.currentPhase) {
    case "greeting":
      if (state.isFirstTime) response = handleFirstTimeGreeting(message, profile, state);
      else response = handleReturningGreeting(message, profile, state);
      break;
    case "profile":
      response = await handleProfileCollection(message, profile, state);
      break;
    case "cv-extraction":
      response = await handleCvExtraction(message, profile, state);
      break;
    case "services":
      response = await handleServiceDispatch(message, profile, state);
      break;
  }
  
  // Persist state
  await db.candidateProfile.update({
    where: { userId },
    data: { assistantState: state }
  });
  
  return Response.json(response);
}
```

**Verification:**
- ✅ First-time user triggers greeting + profile collection
- ✅ Returning user resumes from last phase
- ✅ State persists across requests
- ✅ Phase transitions are correct
- ✅ Greetings differ (first-time vs. returning)

### Task 1.4: Implement Greeting Handlers

**File:** `src/lib/ai/assistant/greetings.ts`

**What:**
- `handleFirstTimeGreeting(message, profile, state)`: Warm welcome, explain services, start profile collection
- `handleReturningGreeting(message, profile, state)`: Context-aware welcome, remind of incomplete tasks, offer next steps

**First-Time Message Template (from prompt):**
```
"Welcome to JobCloud! 🎉 I'm your personal career assistant, here to help you land your dream job! 🚀

I can help you with:
- 📝 Cover letters tailored to specific roles
- ✨ CV improvements and optimization
- 🎤 Interview preparation and practice

But first, let me get to know you! What's your name? 😊"
```

**Returning Message Template:**
```
"Welcome back! 👋 Great to see you again! 💼

Last time we were [working on: profile setup / CV extraction / services]. 
[Context about where they left off]

Ready to continue, or want to work on something new? 🎯"
```

**Verification:**
- ✅ Personality tone matches prompt
- ✅ Emojis used naturally
- ✅ Context-aware (returning message references last activity)
- ✅ Transitions smoothly to next step

---

## Wave 2: Cover Letter Service

**Goal:** Implement full cover letter generation service with job matching, refinement modes, and edge case handling.

**Owner:** Primary  
**Duration:** ~2 hours  
**Depends On:** Wave 1 (session awareness, system prompt)  
**Deliverables:** Cover letter handlers + mode classifier + Anthropic integration

### Task 2.1: Implement Job Information Collection

**File:** `src/lib/ai/assistant/services/cover-letter.ts`

**What:**
- Detect if user provided job posting URL or job title + company
- Extract job requirements from posting (if URL) or ask for company name (if title only)
- Store in state: `services.coverLetter.lastGeneratedRole`

**Detection Logic:**
```typescript
function detectJobInfo(message: string): 
  | { type: "full-posting"; url: string; requirements: string }
  | { type: "title-only"; title: string; company?: string }
  | { type: "incomplete" } {
  
  // Check if message contains URL → parse requirements
  // Check if message contains company name + role title → extract
  // Otherwise → incomplete, ask for more info
}
```

**Verification:**
- ✅ Recognizes job postings in text
- ✅ Extracts company + role from various formats
- ✅ Asks clarifying questions when insufficient info
- ✅ Stores extracted info in state

### Task 2.2: Implement Cover Letter Generation with Anthropic

**File:** `src/lib/ai/assistant/services/cover-letter-generation.ts`

**What:**
- Build on existing `generateCoverLetterWithAnthropic()` function
- Accept: job requirements, user profile, CV data, refinement mode
- Call Anthropic API with role-specific system message
- Return 250-400 word cover letter
- Update state with draft, word count, role

**Refinement Modes:**
- `"expand"`: Grow from current length to requested length (add details, examples)
- `"summarize"`: Reduce length while maintaining key points
- `"rewrite"`: Generate alternative version emphasizing different strengths

**Code Pattern:**
```typescript
export async function generateCoverLetter(input: {
  jobRequirements: string;
  userProfile: CandidateProfile;
  cvData: ExtractedCV;
  refinementMode?: "expand" | "summarize" | "rewrite";
  targetWordCount?: number;
}): Promise<string> {
  
  const prompt = buildCoverLetterPrompt(
    input.jobRequirements,
    input.userProfile,
    input.cvData,
    input.refinementMode,
    input.targetWordCount
  );
  
  const response = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    system: getSystemPrompt("services", "cover-letter"),
    messages: [{ role: "user", content: prompt }]
  });
  
  const letter = extractText(response.content[0]);
  
  // Store in state
  const wordCount = countWords(letter);
  state.services.coverLetter = {
    lastGeneratedRole: input.jobRequirements.split("\n")[0],
    lastDraftWordCount: wordCount,
    refinementMode: input.refinementMode
  };
  
  return letter;
}
```

**Verification:**
- ✅ Generates 250-400 word letters
- ✅ Matches job requirements to user experience
- ✅ Refinement modes work (expand 200→300, summarize longer)
- ✅ State updates track generation history
- ✅ No hallucinations (only uses CV data provided)

### Task 2.3: Implement Refinement Request Handler

**File:** `src/lib/ai/assistant/services/cover-letter-refinement.ts`

**What:**
- Detect refinement requests in user message ("make it shorter", "add more about leadership", etc.)
- Classify as expand, summarize, or rewrite
- Call generation with appropriate mode
- Present revised letter with explanation

**Refinement Detection:**
```typescript
function detectRefinementRequest(
  message: string,
  currentDraft: string
): {
  type: "tone" | "content" | "length" | "restructure" | "version" | "none";
  details: string;
  targetLength?: number;
} {
  // Parse message for refinement indicators
  // Examples:
  // "make it shorter" → length, target ~250 words
  // "more formal" → tone, professional
  // "focus on X" → content, emphasize X
  // "different version" → version (rewrite)
}
```

**Verification:**
- ✅ Correctly classifies refinement requests
- ✅ Preserves previous draft context
- ✅ Generates appropriate refined version
- ✅ Explains changes in response message

### Task 2.4: Handle Cover Letter Edge Cases

**File:** `src/lib/ai/assistant/services/cover-letter-edge-cases.ts`

**What:**
- **No direct experience:** Emphasize transferable skills, learning ability, enthusiasm
- **Multiple versions requested:** Generate 3 versions (skills-focused, experience-focused, passion-focused)
- **Only job title provided:** Generate general template for role type with [Company] placeholder
- **Full job description:** Deep analysis of all requirements, match to CV points

**Code:**
```typescript
function handleEdgeCase(
  edgeCase: "no-experience" | "multiple-versions" | "title-only" | "full-description",
  ...args
): CoverLetter | CoverLetter[] {
  
  switch (edgeCase) {
    case "no-experience":
      return generateWithTransferableSkills(args);
    case "multiple-versions":
      return generateThreeVersions(args);
    case "title-only":
      return generateGenericTemplate(args);
    case "full-description":
      return generateHighlyTailoredLetter(args);
  }
}
```

**Verification:**
- ✅ Handles all prompt-specified edge cases
- ✅ Responses encourage users without experience
- ✅ Multiple versions clearly differentiated
- ✅ Generic templates work well

---

## Wave 3: CV Enhancement Service

**Goal:** Implement CV analysis and suggestion system with prioritized recommendations and section-specific help.

**Owner:** Primary  
**Duration:** ~1.5 hours  
**Depends On:** Wave 1 (session awareness, system prompt)  
**Deliverables:** CV analysis engine + suggestion templates

### Task 3.1: Implement CV Analysis Framework

**File:** `src/lib/ai/assistant/services/cv-enhancement-analysis.ts`

**What:**
- Analyze CV against improvement framework:
  - Missing key info (contact, LinkedIn, key skills)
  - Weak action verbs (responsible, worked → led, developed)
  - Lack of quantifiable results
  - Poor structure/formatting
  - Outdated design
  - Unclear descriptions
  - Missing in-demand skills
  - Missing certifications
- Categorize findings into priority tiers: critical, high-impact, medium, nice-to-have

**Code:**
```typescript
export function analyzeCv(cv: ExtractedCV, industry?: string): CVAnalysis {
  const findings: Suggestion[] = [];
  
  // Missing info scan
  if (!cv.contact?.email) findings.push({
    category: "missing-info",
    priority: "critical",
    suggestion: "Add email address to contact section"
  });
  
  // Action verb scan
  const weakVerbs = ["responsible", "worked", "helped"];
  cv.experience?.forEach(job => {
    const hasWeak = job.description.some(desc => 
      weakVerbs.some(verb => desc.toLowerCase().includes(verb))
    );
    if (hasWeak) findings.push({
      category: "weak-verbs",
      priority: "high",
      example: job.description[0],
      suggestion: "Replace weak verbs with action verbs: Led, Developed, Achieved"
    });
  });
  
  // Quantifiable results scan
  if (!cv.experience?.some(job => /\d+%|$\d+|years?/i.test(job.description.join(" ")))) {
    findings.push({
      category: "no-metrics",
      priority: "high",
      suggestion: "Add quantifiable results to achievements"
    });
  }
  
  return {
    overall: calculateScore(findings),
    findings: prioritizeSuggestions(findings),
    industrySpecific: getIndustryOptimizations(industry)
  };
}

interface Suggestion {
  category: string;
  priority: "critical" | "high" | "medium" | "nice-to-have";
  suggestion: string;
  example?: string;
  improvement?: string;
}
```

**Verification:**
- ✅ Framework covers all prompt-specified improvement areas
- ✅ Prioritization works (critical before nice-to-have)
- ✅ Returns actionable suggestions with examples
- ✅ No false positives on good CV sections

### Task 3.2: Implement CV Enhancement Response Generator

**File:** `src/lib/ai/assistant/services/cv-enhancement-response.ts`

**What:**
- Format analysis into user-friendly response with:
  - High-impact changes section (critical fixes)
  - Formatting improvements section
  - Optional enhancements section
  - Before/after examples for each suggestion
  - Action buttons (help rewrite section, generate improved version, etc.)

**Response Template:**
```
I've reviewed your CV and I have some great suggestions to make it even stronger! 💪📄 Here's what I found:

---

🌟 HIGH IMPACT CHANGES

1. Experience Section - Add Measurable Results
[before/after example]
Why this works: [explanation]

---

📋 FORMATTING IMPROVEMENTS

[suggestions]

---

Would you like me to:
[options for next action]
```

**Verification:**
- ✅ Response matches prompt template style
- ✅ Includes before/after examples
- ✅ Personality tone is encouraging
- ✅ Sections properly organized

### Task 3.3: Implement Section-Specific Help

**File:** `src/lib/ai/assistant/services/cv-enhancement-sections.ts`

**What:**
- Handle user requests for specific sections: "help with experience", "improve my skills section", etc.
- Provide section-specific templates and tips
- Support user rewriting part of their CV

**Sections:**
1. **Experience:** STAR method adaptation, quantifiable results, action verbs
2. **Skills:** Grouping (technical vs. soft), relevance, in-demand skills for role
3. **Education:** Highlighting relevant coursework, GPA, certifications
4. **Summary:** 2-3 line professional summary (optional)

**Verification:**
- ✅ Handles all major CV sections
- ✅ Provides role-specific guidance
- ✅ Supports user input for rewriting

---

## Wave 4: Interview Preparation + Mock Interview Mode

**Goal:** Implement practice mode with feedback, mock interview mode with interviewer persona, realistic Q&A flow, and comprehensive feedback generation.

**Owner:** Primary  
**Duration:** ~2.5 hours  
**Depends On:** Wave 1 (session awareness, system prompt)  
**Deliverables:** Interview handlers, question banks, feedback generator

### Task 4.1: Implement Interview Mode Selection & Question Bank

**File:** `src/lib/ai/assistant/services/interview-prep.ts`

**What:**
- Collect job posting/title + company name
- Offer two modes: Practice vs. Mock Interview
- Build question bank (10-11 questions covering: opening, behavioral, situational, technical, cultural fit, closing)
- Tailor questions to role requirements

**Question Bank Structure:**
```typescript
interface InterviewQuestion {
  id: string;
  type: "opening" | "behavioral" | "situational" | "technical" | "cultural" | "closing";
  question: string;
  followUpPattern?: string; // For probing if answer too short
  rubric?: string; // How to evaluate
}

function buildQuestionBank(jobPosting: string, userProfile: CandidateProfile): InterviewQuestion[] {
  // Generate 10-11 questions tailored to role
  // Opening: "Tell me about yourself"
  // Behavioral (2-3): STAR method scenarios
  // Situational (1-2): Hypothetical role challenges
  // Technical: Role-specific skills
  // Cultural: Company fit
  // Closing: Any questions for us?
}
```

**Verification:**
- ✅ Questions cover all types
- ✅ Tailored to job posting requirements
- ✅ Questions match prompt specifications

### Task 4.2: Implement Practice Mode

**File:** `src/lib/ai/assistant/services/interview-practice-mode.ts`

**What:**
- Show user each question one by one
- Collect user's thinking/answer
- Provide specific feedback with:
  - Strengths (what they did well)
  - Areas to enhance
  - STAR method coaching if behavioral
  - Improved version of their answer
  - Encouragement for next question

**Code:**
```typescript
async function handlePracticeMode(
  userAnswer: string,
  question: InterviewQuestion,
  userProfile: CandidateProfile
): Promise<Feedback> {
  
  const feedback = await generateFeedback({
    userAnswer,
    question,
    profile: userProfile,
    mode: "practice"
  });
  
  return {
    strengths: feedback.strengths, // Array of specific positives
    improvements: feedback.improvements, // Array of suggestions
    starBreakdown: question.type === "behavioral" ? feedback.starAnalysis : null,
    improvedVersion: feedback.improvedAnswer,
    encouragement: generateEncouragement()
  };
}
```

**Verification:**
- ✅ Feedback is specific (references their actual answer)
- ✅ STAR method guidance included for behavioral questions
- ✅ Tone is encouraging but constructive
- ✅ Improved version shows how to enhance answer

### Task 4.3: Implement Mock Interview Mode (Complex)

**File:** `src/lib/ai/assistant/services/interview-mock-mode.ts`

**What:**
- Transition to "interviewer" mode: Professional tone, minimal emojis
- Conduct realistic interview Q&A:
  - Ask question 1 (opening)
  - Wait for full user response
  - If too short/vague, probe like real interviewer
  - Move to next question
  - Repeat for 10-11 questions
- Track all Q&A for final feedback
- Maintain professionalism throughout
- Exit to cheerful mode for feedback delivery

**Personality Shift Rules:**
- **Normal mode:** 🎉 🚀 💼 ✨ 🔥 frequent, motivational
- **Interviewer mode:** No/minimal emojis, formal, brief, hiring-manager-like
- **Feedback mode:** Moderate emojis, constructive, encouraging

**Code:**
```typescript
async function conductMockInterview(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  state: InterviewState
): Promise<MockInterviewResponse> {
  
  // If just starting, ask opening question
  if (state.currentQuestion === 0) {
    return {
      mode: "interviewer",
      content: "Tell me about yourself and why you're interested in this [Job Title] position with [Company].",
      nextState: { currentQuestion: 1, answers: [] }
    };
  }
  
  // Parse user response from last message
  const userAnswer = messages[messages.length - 1].content;
  state.answers.push(userAnswer);
  
  // If answer too short/vague, probe
  if (userAnswer.split(" ").length < 20) {
    return {
      mode: "interviewer",
      content: "Can you elaborate on that? What specifically was your role in that situation?",
      nextState: state
    };
  }
  
  // Move to next question or conclude
  if (state.currentQuestion < 11) {
    const nextQuestion = getNextQuestion(state.currentQuestion, jobPosting);
    return {
      mode: "interviewer",
      content: nextQuestion.question,
      nextState: { ...state, currentQuestion: state.currentQuestion + 1 }
    };
  } else {
    // Interview concluded, return to assistant mode for feedback
    return {
      mode: "feedback",
      content: "You did it! 🎉 Give me a moment to review your performance...",
      nextState: { ...state, concluded: true }
    };
  }
}
```

**Verification:**
- ✅ Interviewer mode has zero emojis (or minimal)
- ✅ Professional, realistic hiring manager tone
- ✅ Probes if answers too short
- ✅ Smooth transition to feedback mode
- ✅ All 11 questions asked
- ✅ User can ask questions at end

### Task 4.4: Implement Comprehensive Feedback Generation

**File:** `src/lib/ai/assistant/services/interview-feedback.ts`

**What:**
- After mock interview completes, generate detailed feedback:
  - Overall performance score (7/10 format)
  - Strengths section (what they did well)
  - Areas to improve (constructive suggestions with examples)
  - Top recommendations (specific prep actions)
  - Specific STAR stories to prepare (5 scenarios)
  - Questions they should ask
  - Final encouragement

**Feedback Template:**
```
📊 OVERALL PERFORMANCE: [7/10] ⭐⭐⭐⭐⭐⭐⭐

Overall Impression:
[2-3 sentence summary]

---

🌟 YOUR STRENGTHS

1. [Strength Category]
What you did well: [specific example from their actual answer]
Why it worked: [explanation]

---

💡 AREAS TO IMPROVE

1. [Area for Improvement]
What happened: [describe what they did]
Why it matters: [explain impact]
How to improve: [actionable steps]
Your answer was: "[quote their actual answer]"
Improved version: "[show how to enhance it]"

---

🎯 TOP RECOMMENDATIONS FOR YOUR NEXT INTERVIEW

Before: [prep actions]
During: [in-interview actions]
After: [follow-up actions]

---

💪 FINAL THOUGHTS

What you're already doing well:
- [Strength 1]
- [Strength 2]

Focus your prep on:
- [Area 1]
- [Area 2]

You have strong experience and skills for this role! 🌟
```

**Verification:**
- ✅ Feedback references specific user answers (no generic feedback)
- ✅ STAR method coaching included
- ✅ Tone is encouraging but honest
- ✅ Actionable next steps provided
- ✅ All recommendations from prompt template

---

## Wave 5: Scope Enforcement & Off-Topic Detection

**Goal:** Implement off-topic detection system to identify non-career questions and redirect politely to career topics.

**Owner:** Primary  
**Duration:** ~1 hour  
**Depends On:** Wave 1 (system prompt)  
**Deliverables:** Off-topic detector + redirect handler

### Task 5.1: Implement Off-Topic Detection

**File:** `src/lib/ai/assistant/services/scope-detection.ts`

**What:**
- Detect if user message is off-topic (non-career related)
- Build pattern library for common off-topic areas:
  - Weather/climate/environment
  - Sports/entertainment/hobbies
  - Medical/health advice
  - Legal advice
  - Cooking/food
  - General knowledge/trivia
  - Personal relationships
- Use combination of keyword matching + semantic detection

**Code:**
```typescript
const OFF_TOPIC_PATTERNS = {
  weather: /weather|rain|snow|cold|hot|temperature|forecast|climate/i,
  sports: /football|basketball|soccer|tennis|baseball|game|score|team|player/i,
  medical: /sick|disease|doctor|medicine|medication|illness|symptom|hospital/i,
  legal: /lawyer|attorney|lawsuit|court|legal|contract|liability/i,
  cooking: /recipe|cook|food|meal|pizza|dinner|breakfast|ingredient/i,
  personal: /girlfriend|boyfriend|spouse|marriage|divorce|dating|relationship/i,
  general: /what is|how does|explain|tell me about [non-career]/i
};

export function detectOffTopic(message: string): boolean {
  for (const [category, pattern] of Object.entries(OFF_TOPIC_PATTERNS)) {
    if (pattern.test(message)) {
      // Verify it's not career-adjacent (e.g., "health insurance" is on-topic)
      if (!isCareersRelated(message)) {
        return true;
      }
    }
  }
  return false;
}

function isCareersRelated(message: string): boolean {
  const careerKeywords = /job|career|interview|salary|benefits|cv|resume|hiring|work|employment|position|role/i;
  return careerKeywords.test(message);
}
```

**Verification:**
- ✅ Detects common off-topic areas
- ✅ No false positives on career-adjacent topics
- ✅ Returns boolean (on-topic vs. off-topic)

### Task 5.2: Implement Off-Topic Redirect Handler

**File:** `src/lib/ai/assistant/services/off-topic-redirect.ts`

**What:**
- Generate polite, warm redirect message
- Acknowledge their question was understood
- Refocus on career topics
- Keep door open for career questions
- Maintain personality (cheerful, not dismissive)

**Redirect Templates:**
```
"I'm specifically here to help with your job search and career development! 🎯 

Let's focus on [career-related topic]. What would help most? 💼"

"That's a great question, but it's outside my expertise area! 😊 I'm specifically here for career guidance.

Speaking of which, is there anything about your job search, CV, or interviews I can help with? 🚀"
```

**Code:**
```typescript
export function generateOffTopicRedirect(
  userMessage: string,
  topicCategory: string
): string {
  // Generate redirect that:
  // 1. Acknowledges they asked something
  // 2. Explains I'm career-focused
  // 3. Suggests career-related alternative
  // 4. Maintains warmth
  
  return `I appreciate the question about ${topicCategory}! 😊 
  
I'm specifically here to help with your job search and career development though! 🎯 
Let me help you with something career-related instead.

What would be most helpful right now - working on your CV, cover letters, or interview prep? 💼✨`;
}
```

**Verification:**
- ✅ Redirect is warm and non-dismissive
- ✅ Refocuses on career topics
- ✅ User can still ask career questions
- ✅ Personality maintained (emojis, tone)

---

## Wave 6: Testing & Verification

**Goal:** Comprehensive testing to ensure all services work, all spec requirements met, no regressions, zero hallucinations.

**Owner:** Primary  
**Duration:** ~2 hours  
**Depends On:** All waves 1-5  
**Deliverables:** Integration tests + verification report

### Task 6.1: Create Session Awareness Tests

**File:** `tests/integration/assistant-session-awareness.test.ts`

**What:**
- Test first-time user flow (receives greeting, proceeds to profile)
- Test returning user flow (resumes from saved state)
- Test state persistence across requests
- Test phase transitions

**Tests:**
```
✅ First-time user receives session-aware greeting
✅ First-time user flag set correctly
✅ Returning user resuming from profile collection
✅ Returning user resuming from CV extraction
✅ Returning user resuming from services
✅ State persists across multiple requests
✅ Phase transitions occur correctly
```

### Task 6.2: Create Service Tests

**File:** `tests/integration/assistant-services.test.ts`

**What:**
- Test cover letter generation (job matching, quality, 250-400 words)
- Test cover letter refinement (expand, summarize, rewrite modes)
- Test CV enhancement (analysis, suggestions, prioritization)
- Test interview prep (practice mode feedback)
- Test mock interview mode (interviewer personality shift)
- Test mock interview feedback (specific, actionable, references user answers)

**Tests (Cover Letters):**
```
✅ Cover letter generation matches job requirements
✅ Generated letter is 250-400 words
✅ Letter includes user's relevant experience
✅ Refinement mode: expand 200→300 words
✅ Refinement mode: summarize longer letters
✅ Edge case: User without direct experience
✅ Edge case: Multiple versions generated
✅ No hallucinations: only uses provided CV data
```

**Tests (CV Enhancement):**
```
✅ CV analysis identifies improvement areas
✅ Suggestions prioritized (critical → nice-to-have)
✅ Includes before/after examples
✅ Section-specific guidance works
✅ Industry-specific advice provided
```

**Tests (Interview Prep):**
```
✅ Practice mode: question displayed
✅ Practice mode: feedback is specific to user answer
✅ Practice mode: STAR coaching included
✅ Mock interview: interviewer mode emoji reduction works
✅ Mock interview: professional tone maintained
✅ Mock interview: all 11 questions asked
✅ Mock interview feedback references actual answers
✅ Mock interview feedback is constructive
✅ Transition back to cheerful mode smooth
```

### Task 6.3: Create Off-Topic Detection Tests

**File:** `tests/integration/assistant-scope-detection.test.ts`

**What:**
- Test off-topic detection (weather, sports, medical, legal, etc.)
- Test career-adjacent topics are NOT flagged as off-topic
- Test redirect messages are warm and helpful

**Tests:**
```
✅ Weather question detected as off-topic
✅ Sports question detected as off-topic
✅ Medical question detected as off-topic
✅ "Health insurance" NOT detected as off-topic
✅ Salary negotiation NOT detected as off-topic
✅ Off-topic redirect message is warm
✅ User can ask career question after redirect
```

### Task 6.4: Create Self-Reference Tests

**File:** `tests/integration/assistant-self-reference.test.ts`

**What:**
- Test that assistant can explain its own behavior
- Test that system prompt includes self-reference instruction
- Test consistency: assistant applies learned patterns

**Tests:**
```
✅ "Why do you use emojis?" → assistant references its own prompt
✅ "How do you handle off-topic?" → assistant explains scope rules
✅ "Tell me about your interview mode" → assistant describes personality shift
✅ Personality consistent across all responses
```

### Task 6.5: Create Regression Tests

**File:** `tests/integration/assistant-regression.test.ts`

**What:**
- Run all 12 existing tests from previous phases
- Verify CV extraction unchanged
- Verify cover letter refinement logic still works

**Tests:**
```
✅ All 12 previous tests pass (100%)
✅ CV extraction logic untouched
✅ Existing refinement tests pass
✅ No new build errors
```

### Task 6.6: Manual Verification Checklist

**Checklist:**
```
PERSONALITY & TONE
✅ Responses use emojis naturally
✅ Tone is encouraging and motivational
✅ No responses feel robotic or corporate

SESSION AWARENESS
✅ First-time user gets greeting + profile flow
✅ Returning user resumes from last point
✅ State persists across page refreshes
✅ Can access saved drafts

COVER LETTERS
✅ Generates letter for provided job posting
✅ Letter matches job requirements
✅ User can request refinements (more formal, shorter, etc.)
✅ Refinement actually changes the letter
✅ Can request multiple versions

CV ENHANCEMENT
✅ Analysis identifies realistic improvement areas
✅ Suggestions have before/after examples
✅ Can ask for section-specific help
✅ Industry-specific guidance works

INTERVIEW PREP
✅ Practice mode shows question, collects answer, gives feedback
✅ Mock interview mode starts in professional tone
✅ Interviewer doesn't use emojis inappropriately
✅ Interviewer probes if answers too short
✅ Interview concludes with questions for them
✅ Transition to feedback with emojis restored
✅ Feedback references specific user answers
✅ Feedback includes STAR coaching

OFF-TOPIC HANDLING
✅ Non-career questions detected
✅ Redirect is warm and helpful
✅ Can still ask career questions after redirect

SELF-REFERENCE
✅ Assistant explains its own behavior when asked
✅ References prompt in explanations
✅ Behavior consistent throughout

DATA INTEGRITY
✅ No hallucinations observed
✅ All recommendations based on user CV
✅ Job posting info used accurately
✅ No fabricated metrics or experience
```

---

## Implementation Waves Summary

| Wave | Tasks | Dependencies | Duration | Key Output |
|------|-------|--------------|----------|------------|
| 1 | System prompt, session awareness | None | 1.5h | Session management foundation |
| 2 | Cover letter service | Wave 1 | 2h | Full cover letter generation |
| 3 | CV enhancement service | Wave 1 | 1.5h | CV analysis + suggestions |
| 4 | Interview prep + mock mode | Wave 1 | 2.5h | Interview practice + feedback |
| 5 | Scope enforcement | Wave 1 | 1h | Off-topic detection + redirect |
| 6 | Testing + verification | Waves 1-5 | 2h | Test suite + verification report |
| **TOTAL** | **6 waves** | **Sequential** | **~10 hours** | **Full implementation** |

---

## Success Criteria (Phase Complete = All Met)

- ✅ All waves executed and committed
- ✅ All tests passing (existing 12 + new tests)
- ✅ All acceptance criteria from SPEC.md verified
- ✅ Zero hallucinations detected in manual testing
- ✅ Off-topic detection working smoothly
- ✅ Mock interview personality shift seamless
- ✅ Session state persists correctly
- ✅ Production build passes
- ✅ Code review confirms CV extraction untouched
- ✅ Assistant references its own prompt when explaining behavior

---

**Status:** Ready for execution  
**Next Step:** `gsd-execute-phase` to begin Wave 1
