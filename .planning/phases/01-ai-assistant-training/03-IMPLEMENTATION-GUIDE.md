# AI Assistant Training Implementation - Completion Guide

**Current Status:** Wave 1 ✅ + Wave 2 Foundation ✅  
**Branch:** `feature/assistant-training-gsd`  
**Date:** 2026-07-14

---

## What's Been Completed ✅

### Wave 1: System Prompt & Session Awareness (DONE)
- ✅ `src/lib/ai/assistant/system-prompt.ts` - 2000+ line system prompt
- ✅ `src/types/assistant-state.ts` - Session state management
- ✅ `src/lib/ai/assistant/greetings.ts` - First-time vs returning greetings
- ✅ `src/app/api/onboarding/assistant/route.ts` - Session-aware route handler
- ✅ `prisma/schema.prisma` - assistantState field added

**Key Features:**
- Session awareness with phase-based routing
- State persistence across requests
- First-time user greeting + profile collection prompts
- Returning user context-aware resumption
- Locale support (en, de, fr)

---

## What's Started ✅

### Wave 2: Cover Letter Service (Foundation Ready)
- ✅ `src/lib/ai/assistant/services/cover-letter.ts` - Core functions:
  - `detectJobInfo()` - Extract company/role from message
  - `inferRefinementMode()` - Detect expand/summarize/rewrite
  - `generateCoverLetter()` - Call Anthropic with proper prompt
  - `handleEdgeCase()` - Handle no-experience, title-only, etc.

---

## Remaining Implementation Tasks

### Task 1: Complete Wave 2 Service Integration

**File:** Create `src/lib/ai/assistant/services/cover-letter-handler.ts`

```typescript
import { updateServiceState } from "@/types/assistant-state";
import { generateCoverLetter, detectJobInfo, inferRefinementMode } from "./cover-letter";

export async function handleCoverLetterRequest(
  message: string,
  profile: CandidateProfile,
  state: AssistantState,
  cvData?: ExtractedCV
): Promise<{ answer: string; newState: AssistantState }> {
  
  const jobInfo = detectJobInfo(message);
  
  if (!jobInfo?.title && !jobInfo?.company) {
    return {
      answer: "I'd love to help with a cover letter! Could you tell me about the job? Please share: job title, company name, and ideally the job posting/description. 📋💼",
      newState: state
    };
  }

  // Generate letter
  const letter = await generateCoverLetter(
    { jobInfo, userProfile: profile, cvData },
    process.env.ANTHROPIC_API_KEY!,
    process.env.ANTHROPIC_MODEL!
  );

  // Format response matching prompt template
  const response = `Here's your personalized cover letter! 📝✨ I've highlighted your ${letter.emphasis.join(", ")} and matched it to what ${letter.company} is looking for! 🎯

---
${letter.letter}
---

**What I emphasized:**
${letter.emphasis.map(e => `✓ ${e}`).join("\n")}

Would you like me to:
🔄 Adjust the tone (more formal/creative/enthusiastic)
✏️ Emphasize different skills or experiences
📝 Restructure any sections
💾 Generate a different version
✅ This looks perfect!

Let me know! 😊🚀`;

  const newState = updateServiceState(state, "cover-letter", {
    lastGeneratedRole: letter.title,
    lastDraftWordCount: letter.wordCount,
    draftCount: (state.services.coverLetter?.draftCount || 0) + 1,
    lastGeneratedAt: new Date().toISOString()
  });

  return { answer: response, newState };
}
```

### Task 2: Create Wave 3 - CV Enhancement Service

**File:** Create `src/lib/ai/assistant/services/cv-enhancement.ts`

```typescript
export interface CVAnalysis {
  improvements: CVImprovement[];
  priorityAreas: string[];
  industrySpecificTips?: string[];
}

export interface CVImprovement {
  category: "missing-info" | "weak-verbs" | "no-metrics" | "structure" | "skills";
  priority: "critical" | "high" | "medium" | "nice-to-have";
  current?: string;
  suggested?: string;
  explanation: string;
}

export function analyzeCv(cvData: ExtractedCV, industry?: string): CVAnalysis {
  const improvements: CVImprovement[] = [];

  // Check for missing contact info
  if (!cvData.email) {
    improvements.push({
      category: "missing-info",
      priority: "critical",
      suggestion: "Add email address",
      explanation: "Recruiters need a way to contact you!"
    });
  }

  // Check for weak action verbs
  const weakVerbs = ["responsible for", "worked on", "helped", "was"];
  const hasWeak = Object.values(cvData).some(v => 
    typeof v === "string" && weakVerbs.some(w => v.toLowerCase().includes(w))
  );
  if (hasWeak) {
    improvements.push({
      category: "weak-verbs",
      priority: "high",
      current: "Responsible for managing projects",
      suggested: "Led cross-functional project team of 5, delivering on-time and under budget",
      explanation: "Strong action verbs show ownership and impact!"
    });
  }

  return { improvements, priorityAreas: improvements.map(i => i.category) };
}
```

### Task 3: Create Wave 4 - Interview Prep Service

**File:** Create `src/lib/ai/assistant/services/interview-prep.ts`

```typescript
export interface InterviewQuestion {
  id: string;
  type: "opening" | "behavioral" | "situational" | "technical" | "cultural" | "closing";
  question: string;
}

export interface InterviewFeedback {
  overallScore: number;
  strengths: string[];
  improvements: string[];
  starAnalysis?: StarBreakdown;
  improvedAnswer?: string;
}

interface StarBreakdown {
  situation: string;
  task: string;
  action: string;
  result: string;
}

export function buildQuestionBank(jobPosting: string): InterviewQuestion[] {
  return [
    {
      id: "opening",
      type: "opening",
      question: "Tell me about yourself and why you're interested in this role."
    },
    {
      id: "behavioral-1",
      type: "behavioral",
      question: "Tell me about a time you overcame a significant challenge at work."
    },
    {
      id: "behavioral-2",
      type: "behavioral",
      question: "Describe a situation where you led or influenced a team."
    },
    {
      id: "situational",
      type: "situational",
      question: "If you faced [challenge from job posting], how would you handle it?"
    },
    {
      id: "technical",
      type: "technical",
      question: "Tell me about your experience with [key skill from posting]."
    },
    {
      id: "cultural",
      type: "cultural",
      question: "Why do you want to work for our company specifically?"
    },
    {
      id: "closing",
      type: "closing",
      question: "Do you have any questions for us?"
    }
  ];
}
```

### Task 4: Add Off-Topic Detection (Wave 5)

**File:** Create `src/lib/ai/assistant/services/scope-detection.ts`

```typescript
const OFF_TOPIC_PATTERNS = {
  weather: /weather|rain|snow|temperature|climate|forecast/i,
  sports: /football|basketball|soccer|game|score|player/i,
  medical: /sick|disease|doctor|medicine|illness|symptom/i,
  legal: /lawyer|lawsuit|court|legal|attorney/i,
  cooking: /recipe|cook|food|meal|ingredient|pizza/i,
  personal: /girlfriend|boyfriend|marriage|dating|relationship/i
};

export function detectOffTopic(message: string): boolean {
  for (const pattern of Object.values(OFF_TOPIC_PATTERNS)) {
    if (pattern.test(message)) {
      // Double-check it's not career-adjacent
      const careerKeywords = /job|career|interview|cv|resume|hiring|work|employment|salary|skill/i;
      if (!careerKeywords.test(message)) {
        return true;
      }
    }
  }
  return false;
}

export function getOffTopicRedirect(category: string): string {
  return `I appreciate the question about ${category}! 😊 

I'm specifically here to help with your job search and career development though! 🎯 

Let's focus on career topics instead. What would help most - working on your CV, cover letters, or interview prep? 💼✨`;
}
```

### Task 5: Create Integration Tests (Wave 6)

**File:** Create `tests/integration/assistant-services.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { POST } from "@/app/api/onboarding/assistant/route";

describe("AI Assistant Services", () => {
  let userId: string;

  beforeAll(async () => {
    // Create test user profile
    const profile = await db.candidateProfile.create({
      data: {
        userId: "test-user-" + Date.now(),
        fullName: "Test User",
        primaryRole: "Software Engineer"
      }
    });
    userId = profile.userId;
  });

  it("should generate cover letter for specific role", async () => {
    const response = await POST(new Request("http://localhost/api/onboarding/assistant", {
      method: "POST",
      body: JSON.stringify({
        message: "I want a cover letter for Senior Developer role at Google",
        locale: "en"
      })
    }));

    const data = await response.json();
    expect(data.answer).toContain("cover letter");
    expect(data.answer).toContain("Google");
  });

  it("should handle refinement requests", async () => {
    const response = await POST(new Request("http://localhost/api/onboarding/assistant", {
      method: "POST",
      body: JSON.stringify({
        message: "Make it shorter and more formal",
        locale: "en"
      })
    }));

    const data = await response.json();
    expect(data.answer).toBeDefined();
  });

  it("should detect off-topic questions", async () => {
    const response = await POST(new Request("http://localhost/api/onboarding/assistant", {
      method: "POST",
      body: JSON.stringify({
        message: "What's the weather like?",
        locale: "en"
      })
    }));

    const data = await response.json();
    expect(data.answer).toContain("job search");
  });

  afterAll(async () => {
    await db.candidateProfile.deleteMany({
      where: { userId }
    });
  });
});
```

---

## Integration Steps

### 1. Route Cover Letter Requests in Main Handler

Update `src/app/api/onboarding/assistant/route.ts` POST handler to detect cover letter requests:

```typescript
// In the services phase handler:
if (
  userMessage.toLowerCase().includes("cover letter") ||
  userMessage.toLowerCase().includes("letter") ||
  detectJobInfo(userMessage)
) {
  const { answer, newState: servicState } = await handleCoverLetterRequest(
    userMessage,
    profile,
    newState,
    cvData
  );
  answer = servicState;
  newState = servicState;
}
```

### 2. Add CV Enhancement Detection

```typescript
if (
  userMessage.toLowerCase().includes("cv") ||
  userMessage.toLowerCase().includes("resume") ||
  userMessage.toLowerCase().includes("improve")
) {
  // Route to CV enhancement handler
}
```

### 3. Add Interview Prep Detection

```typescript
if (
  userMessage.toLowerCase().includes("interview") ||
  userMessage.toLowerCase().includes("mock") ||
  userMessage.toLowerCase().includes("practice")
) {
  // Route to interview prep handler
}
```

---

## Next Steps to Complete

1. **Implement Wave 2 Service Handler** - Create cover letter integration
2. **Implement Wave 3** - CV enhancement analysis and suggestions
3. **Implement Wave 4** - Interview practice & mock interview modes
4. **Add Wave 5** - Off-topic detection and redirection
5. **Add Wave 6** - Integration tests for all services
6. **Run Full Build** - `npm run build`
7. **Commit Final Work** - `git add -A && git commit -m "feat(wave2-6): complete AI assistant training implementation"`

---

## Quick Reference: Key Files

```
src/lib/ai/assistant/
├── system-prompt.ts          ✅ Comprehensive prompt (2000+ lines)
├── greetings.ts               ✅ Session-aware greetings
├── services/
│   ├── cover-letter.ts        ✅ Core functions ready
│   ├── cv-enhancement.ts      🔄 To implement
│   ├── interview-prep.ts      🔄 To implement
│   └── scope-detection.ts     🔄 To implement

src/types/
└── assistant-state.ts         ✅ Session state management

src/app/api/onboarding/assistant/
└── route.ts                   ✅ Phase-based routing
```

---

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- assistant-services.test.ts

# Watch mode
npm test -- --watch
```

---

## Build & Deploy

```bash
# Build project
npm run build

# Check for TypeScript errors
npm run type-check

# Lint
npm run lint
```

---

## Success Criteria Summary

- ✅ Wave 1: Session awareness working
- ⏳ Wave 2: Cover letter service complete
- ⏳ Wave 3: CV enhancement service complete
- ⏳ Wave 4: Interview prep service complete
- ⏳ Wave 5: Off-topic detection working
- ⏳ Wave 6: All tests passing
- ⏳ Build passing with no new errors
- ⏳ All features match prompt.txt specifications
- ⏳ Zero hallucinations verified
- ⏳ Self-reference mechanism working

---

**Status:** Ready for Wave 2+ implementation  
**Author:** AI Assistant Training GSD Workflow  
**Last Updated:** 2026-07-14
