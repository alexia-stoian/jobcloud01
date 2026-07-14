# Phase 6 Plan: Advanced Coaching And Readiness

**Phase:** 05 (Advanced Coaching — v2 Phase 1)  
**Status:** Execution Planning  
**Created:** 2026-07-14  
**Target:** Complete Phase 6 (mock interviews + learning resources + multi-role readiness)

---

## Execution Overview

Phase 6 delivers 3 interconnected features:
1. **Mock Interview Sessions** — Interactive interview practice with feedback
2. **Learning Resources** — Skill-gap-driven course/book recommendations
3. **Multi-Role Readiness** — Compare profile readiness across target roles

**Estimated Duration:** 28-38 hours (~4-5 working days)  
**Test Target:** 15+ new tests passing  
**Wave Strategy:** 3 waves (backend APIs → UI components → testing)

---

## Wave 1: Mock Interview Engine (8-10 hours)

### T1.1: Create Mock Interview Session Model & API

**Objective:** Build foundation for interview session management

**Files:**
- `src/app/api/mock-interview/start/route.ts` (NEW)
- `src/app/api/mock-interview/question/route.ts` (NEW)
- `src/app/api/mock-interview/end/route.ts` (NEW)
- `src/app/api/mock-interview/history/route.ts` (NEW)

**Implementation:**
```typescript
// POST /api/mock-interview/start
{
  userId: authenticated user
  interviewType: "behavioral" | "technical" | "case-study" | "cultural-fit"
  targetRole: optional string (from profile.primaryRole)
}
// Returns: { sessionId, startedAt, interviewerContext }

// POST /api/mock-interview/question
{
  sessionId: string
  userAnswer: string (previous answer)
}
// Returns: { question, feedback, score, nextQuestion }

// POST /api/mock-interview/end
{
  sessionId: string
  userRating: 1-5 (optional)
}
// Returns: { summary, overallScore, strengths, improvements }
```

**Database Migration:**
- Add `InterviewSession` and `InterviewQuestion` models to Prisma schema
- Run migration: `npx prisma migrate dev --name add_interview_sessions`

**Validation Checklist:**
- [ ] All endpoints require auth
- [ ] User-scoped data access (userId check)
- [ ] Session CRUD operations work
- [ ] Questions persist correctly

---

### T1.2: Claude Interview Prompting

**Objective:** Create interview prompts for each type

**File:** `src/lib/interview/prompts.ts` (NEW)

**Implementation:**
```typescript
export function buildInterviewPrompt(
  interviewType: "behavioral" | "technical" | "case-study" | "cultural-fit",
  targetRole: string | null,
  profileContext: DurableProfileMemory,
  locale: string
): string

// Returns prompt like:
"You are a professional interview coach conducting a behavioral interview.
You will ask 5-7 questions over this session.
The candidate is interviewing for: [targetRole]
Their profile: [profile context]
Your job: Ask 1 question, wait for their answer, provide feedback, score 0-100, then ask next.
...
"
```

**Prompt Types:**

1. **Behavioral:**
   - STAR method framework (Situation, Task, Action, Result)
   - Questions about past experiences
   - Evaluates: communication, problem-solving, teamwork, conflict resolution

2. **Technical:**
   - Role-specific technical problems
   - Code/design evaluations
   - Evaluates: technical depth, approach, explanation, edge cases

3. **Case Study:**
   - Business scenario analysis
   - Framework usage (MECE, Porter's, etc)
   - Evaluates: structure, creativity, business acumen, communication

4. **Cultural Fit:**
   - Values and work style alignment
   - Swiss tech culture context
   - Evaluates: integrity, adaptability, communication, teamwork

**Localization:** All prompts support EN/DE/FR via locale parameter

**Validation:**
- [ ] Each prompt type has distinct questions
- [ ] Prompts include profile context
- [ ] Locale instruction included
- [ ] Feedback framework defined (0-100 scoring)

---

### T1.3: Interview Question Generator & Feedback

**Objective:** Generate questions and score answers

**File:** `src/lib/interview/engine.ts` (NEW)

**Implementation:**
```typescript
// Generate first question
async function generateFirstQuestion(
  sessionId: string,
  interviewType: string,
  targetRole: string | null,
  profileContext: DurableProfileMemory,
  locale: string
): Promise<string>

// Score answer and generate feedback
async function scoreAnswerAndGenerateFeedback(
  question: string,
  userAnswer: string,
  interviewType: string,
  locale: string
): Promise<{
  feedback: string;
  score: 0-100;
  nextQuestion: string | null;
  isDone: boolean;
}>

// End session and calculate summary
async function generateSessionSummary(
  sessionId: string,
  questions: InterviewQuestion[]
): Promise<{
  overallScore: number;
  strengthAreas: string[];
  improvementAreas: string[];
  recommendations: string[];
}>
```

**Claude Integration:**
- Call Claude for each question/feedback cycle
- Model: claude-3-5-sonnet-20241022
- Max tokens: 500 per response
- Timeout: 30 seconds

**Validation:**
- [ ] Questions are relevant to interview type
- [ ] Scores are consistent (0-100 scale)
- [ ] Feedback is actionable and specific
- [ ] Session completes after 5-7 questions

---

## Wave 2: Learning Resources (6-8 hours)

### T2.1: Skill Resource Database

**Objective:** Create curated resource collection

**File:** `src/lib/interview/resources.ts` (NEW)

**Implementation:**
- Create 50+ curated learning resources
- Categories: courses, books, videos, documentation, certifications
- Each resource has: title, source, duration, cost, difficulty, tags

**Resource Format:**
```typescript
type SkillResource = {
  id: string;
  skillTag: string; // "SQL", "Python", "Leadership"
  title: string;
  type: "course" | "book" | "video" | "documentation" | "certification" | "practice";
  source: string; // "Udemy", "LinkedIn Learning", "YouTube"
  duration?: number; // minutes
  link?: string;
  cost: number; // 0 for free
  difficulty: "beginner" | "intermediate" | "advanced";
  targetRole?: string;
  tags: string[];
};
```

**Resource Collection:**
- Tech skills: SQL, Python, JavaScript, React, TypeScript, AWS, etc
- Soft skills: Leadership, Communication, Negotiation, etc
- Domain skills: Product Management, Data Analysis, UX, etc
- Mix of free (60%) and paid (40%) resources
- Vary by difficulty level

**Validation:**
- [ ] 50+ resources created
- [ ] Multiple resources per skill tag (3-5 per skill)
- [ ] Mix of free and paid
- [ ] All difficulty levels represented
- [ ] Resource links valid (or marked for verification)

---

### T2.2: Parse Guidance Skill Gaps

**Objective:** Extract skill gaps from latest guidance

**File:** `src/lib/interview/parse-gaps.ts` (NEW)

**Implementation:**
```typescript
async function extractSkillGapsFromLatestGuidance(userId: string): Promise<SkillGap[]>
// 1. Fetch latest guidance from /api/guidance
// 2. Parse skill_gaps section
// 3. Extract individual skills (may be comma-separated or bullet points)
// 4. Normalize skill names
// 5. Return array of { skill, priority, reason }

// Example:
// Guidance skill_gaps: "1. Learn SQL for data analysis. 2. Develop Python skills"
// Returns: [
//   { skill: "SQL", priority: "high", reason: "data analysis" },
//   { skill: "Python", priority: "high", reason: "technical depth" }
// ]
```

**Skill Normalization:**
- "SQL" → "SQL"
- "Python programming" → "Python"
- "Communication skills" → "Communication"
- "Public speaking" → "Public Speaking"

**Validation:**
- [ ] Parses guidance skill_gaps correctly
- [ ] Skill names normalized consistently
- [ ] Returns 1-5 skill gaps per user
- [ ] Priorities assigned correctly

---

### T2.3: Resource Recommendation API

**Objective:** Curate and rank resources for skill gaps

**File:** `src/app/api/skill-development/resources/route.ts` (NEW)

**Implementation:**
```typescript
// GET /api/skill-development/resources?skillGap=SQL&numberOfResources=5
// Returns top 5 resources for "SQL" skill, ranked by:
// 1. Relevance (exact skill match)
// 2. Cost (free first)
// 3. Difficulty (beginner first, unless user is advanced)
// 4. Time-to-completion (shorter first for quick wins)
// 5. User ratings (if available)

// Response:
{
  skill: "SQL",
  resources: [
    {
      id: "res-123",
      title: "SQL for Data Analysis",
      type: "course",
      source: "Udemy",
      duration: 480,
      cost: 12.99,
      difficulty: "beginner",
      link: "https://..."
    },
    // ... 4 more resources
  ]
}
```

**Ranking Algorithm:**
```
score = (relevance × 0.3) + (cost_rank × 0.2) + (difficulty_rank × 0.2) + (duration_rank × 0.15) + (rating × 0.15)
// Return top N sorted by score descending
```

**Validation:**
- [ ] Returns up to N resources per request
- [ ] Rankings make sense (free resources first, then by difficulty)
- [ ] Resource links are valid
- [ ] Handles missing skills gracefully

---

### T2.4: Resource Completion Tracking

**Objective:** Allow users to mark resources complete and track progress

**Files:**
- `src/app/api/skill-development/mark-complete/route.ts` (NEW)
- `src/app/api/skill-development/progress/route.ts` (NEW)

**Implementation:**
```typescript
// POST /api/skill-development/mark-complete
{
  resourceId: string;
  rating?: 1-5;
  feedback?: string;
}
// Returns: { resourceId, completedAt, pointsEarned }

// GET /api/skill-development/progress
// Returns: {
//   completedResources: 5,
//   inProgressResources: 2,
//   totalSkillGaps: 8,
//   progressPercent: 62,
//   completedResourcesList: [ ... ]
// }
```

**Validation:**
- [ ] Mark complete creates CompletedResource record
- [ ] Progress calculation accurate
- [ ] User ratings stored correctly
- [ ] Duplicate completions prevented (upsert)

---

## Wave 3: Multi-Role Readiness Comparison (6-8 hours)

### T3.1: Role Profiles Database

**Objective:** Define 50+ job roles with requirements

**File:** `src/lib/interview/roles.ts` (NEW)

**Implementation:**
```typescript
type RoleProfile = {
  id: string;
  title: string; // "Senior Product Manager"
  description: string;
  requiredSkills: string[]; // ["Product Strategy", "Analytics", "Leadership"]
  preferredEducation: string; // "MBA" or "Bachelor's"
  yearsExperienceRequired: number;
  typicalLocations: string[]; // ["Zurich", "Bern", "Geneva"]
  typicalSalaryRange: { min: number; max: number };
  workPermitRequired: string[];
  physicalDemands?: string;
  marketDemand: "high" | "medium" | "low";
};

// Create 50+ roles:
// - Product Manager (3 levels)
// - Software Engineer (5+ specializations)
// - Data Scientist / Analyst
// - UX/UI Designer
// - Project Manager
// - Sales Engineer
// - Etc.
```

**Validation:**
- [ ] 50+ roles created
- [ ] Each role has complete profile
- [ ] Skills are normalized and consistent
- [ ] Salary ranges realistic for Swiss market

---

### T3.2: Readiness Scoring Algorithm

**Objective:** Calculate readiness (0-100%) for a profile against a role

**File:** `src/lib/interview/readiness-score.ts` (NEW)

**Implementation:**
```typescript
async function calculateReadiness(
  userId: string,
  roleId: string
): Promise<{
  overallReadiness: number; // 0-100
  breakdown: {
    experience: number;
    skills: number;
    education: number;
    workPermit: number;
    location: number;
  };
  strengths: string[];
  gaps: string[];
  timeToReady: string; // "3 months", "6 months", "1 year"
}>

// Scoring logic:
// 1. Experience Match (0-100):
//    - Years in field vs required
//    - Relevant roles held
//
// 2. Skills Match (0-100):
//    - Count matching skills in profile
//    - Compare vs required skills
//    - Weight by criticality
//
// 3. Education Match (0-100):
//    - Check education level
//    - Certifications
//
// 4. Work Permit (0-100):
//    - Can candidate work in Switzerland?
//    - Are there sponsorship constraints?
//
// 5. Location (0-100):
//    - Does preferred location match role location?
//    - Is user open to relocation?
//
// Overall = weighted average of 5 dimensions
```

**Weights:**
- Experience: 30%
- Skills: 35%
- Education: 15%
- Work Permit: 10%
- Location: 10%

**Validation:**
- [ ] Scores between 0-100
- [ ] Breakdown accurate and actionable
- [ ] Time estimates reasonable
- [ ] Strengths and gaps identified clearly

---

### T3.3: Multi-Role Comparison API

**Objective:** Compare readiness across multiple roles

**File:** `src/app/api/readiness/compare/route.ts` (NEW)

**Implementation:**
```typescript
// POST /api/readiness/compare
{
  roleIds: ["role-123", "role-456", "role-789"]
}
// Returns: {
//   comparisons: [
//     {
//       roleId: "role-123",
//       title: "Senior Product Manager",
//       readiness: 85,
//       breakdown: { experience: 90, skills: 80, ... },
//       strengths: ["10 years experience", "Strong analytics"],
//       gaps: ["Limited user research", "No B2B experience"],
//       timeToReady: "3 months"
//     },
//     // ... for each role
//   ],
//   recommendation: "You're most ready for Senior Product Manager role..."
// }
```

**Recommendation Logic:**
- Suggest role with highest readiness score
- Suggest next best role as alternative
- Identify quickest-to-ready path (e.g., "learn SQL → Ready for Data Analyst in 2 months")

**Validation:**
- [ ] Compares up to 3 roles
- [ ] Scores accurate for each role
- [ ] Recommendations logical and helpful
- [ ] Response includes actionable next steps

---

## Wave 4: UI Components & Localization (4-6 hours)

### T4.1: Mock Interview UI

**Files:** `src/components/interview/**` (NEW)

**Components:**
- `InterviewSessionStart.tsx` — Choose interview type + target role
- `InterviewSessionFeedback.tsx` — Show question, answer input, feedback
- `InterviewSessionEnd.tsx` — Summary with score, strengths, improvements
- `InterviewHistory.tsx` — List of past sessions with scores and dates
- `InterviewSessionDetail.tsx` — View detailed session feedback

**Key Features:**
- Real-time feedback after each answer
- Progress bar (Question X of Y)
- Score display
- Retry logic for questions
- Export/share session results

**Validation:**
- [ ] All components render correctly
- [ ] User input accepted and processed
- [ ] Feedback displayed clearly
- [ ] Navigation works (start → questions → summary → history)

---

### T4.2: Learning Resources UI

**Files:** `src/components/skill-development/**` (NEW)

**Components:**
- `SkillGapsList.tsx` — Show identified skill gaps
- `ResourceBrowser.tsx` — Browse and filter learning resources
- `ResourceCard.tsx` — Individual resource with link and metadata
- `CompletionTracker.tsx` — Show progress toward skill goals
- `ResourceDetail.tsx` — Full resource information

**Validation:**
- [ ] Resources displayed with all metadata
- [ ] Filter by skill, type, cost
- [ ] Mark complete button works
- [ ] Progress bar accurate

---

### T4.3: Readiness Comparison UI

**Files:** `src/components/readiness/**` (NEW)

**Components:**
- `RoleSelector.tsx` — Choose 2-3 roles to compare
- `ReadinessCard.tsx` — Show readiness score + breakdown
- `ReadinessComparison.tsx` — Side-by-side comparison of roles
- `ReadinessTimeline.tsx` — Time to readiness for each role

**Validation:**
- [ ] Roles display with readiness scores
- [ ] Breakdown visible (experience, skills, etc)
- [ ] Comparison layout clear and readable
- [ ] Recommendations prominent

---

### T4.4: Page Routes

**Files:** `src/app/(app)/**/page.tsx` (NEW)

**Routes:**
- `/mock-interview` — Start new session or view history
- `/mock-interview/session/{sessionId}` — Active interview session
- `/mock-interview/history` — Past sessions
- `/skill-development` — View skill gaps and resources
- `/readiness-comparison` — Compare roles

**Validation:**
- [ ] All routes require authentication
- [ ] Proper layout with AppShellServer
- [ ] Navigation between routes works
- [ ] Metadata (titles, descriptions) set

---

### T4.5: Localization (EN/DE/FR)

**Files:** `messages/{en|de|fr}.json` (UPDATED)

**Keys to Add:**
```json
{
  "mockInterview": {
    "pageTitle": "Mock Interview",
    "startSession": "Start Interview",
    "selectType": "Interview Type",
    "behavioral": "Behavioral",
    "technical": "Technical",
    "caseStudy": "Case Study",
    "culturalFit": "Cultural Fit",
    "yourAnswer": "Your Answer",
    "feedback": "Feedback",
    "score": "Score",
    "strengths": "Strengths",
    "improvements": "Areas to Improve",
    "sessionHistory": "Past Sessions",
    // ... 20+ more keys
  },
  "skillDevelopment": {
    "pageTitle": "Skill Development",
    "skillGaps": "Skill Gaps",
    "learningResources": "Recommended Resources",
    "completed": "Completed",
    "inProgress": "In Progress",
    "markComplete": "Mark as Complete",
    // ... 15+ more keys
  },
  "readiness": {
    "pageTitle": "Readiness Comparison",
    "selectRoles": "Select Roles to Compare",
    "readinessscore": "Readiness Score",
    "experience": "Experience",
    "skills": "Skills",
    "education": "Education",
    // ... 15+ more keys
  }
}
```

**Translation for DE & FR:**
- German: Professional, formal tone
- French: Professional, formal tone

**Validation:**
- [ ] All 3 languages complete
- [ ] No missing keys
- [ ] Text lengths reasonable (no overflow)
- [ ] Special characters correct (ü, ö, ä for German; é, è, ê for French)

---

## Wave 5: Testing & Validation (4-6 hours)

### T5.1: Integration Tests (8 tests)

**File:** `tests/integration/mock-interview.test.ts` (NEW)

Tests:
1. ✅ Create interview session (behavioral)
2. ✅ Generate first question
3. ✅ Score answer and provide feedback
4. ✅ End session and generate summary
5. ✅ Fetch interview history
6. ✅ Retrieve past session details
7. ✅ Skill gaps extracted from guidance
8. ✅ Resources recommended for skill gap

**Validation:**
- [ ] All tests pass
- [ ] No flaky tests
- [ ] Coverage >80%

---

### T5.2: E2E Tests (4 scenarios)

**File:** `tests/e2e/mock-interview.spec.ts` (NEW)

Scenarios:
1. ✅ User completes mock interview session (end-to-end)
2. ✅ User views interview history
3. ✅ User browses learning resources
4. ✅ User compares readiness across 3 roles

**Validation:**
- [ ] All scenarios pass
- [ ] No console errors
- [ ] Timeouts reasonable (<70s per scenario)

---

### T5.3: Build & Type Check

**Command:** `npm run build`

**Expected:** Build completes without errors

**Validation:**
- [ ] Build succeeds
- [ ] No TypeScript strict mode violations
- [ ] No runtime errors

---

### T5.4: Manual Testing (Developer Verification)

**Checklist:**
- [ ] Mock interview: Ask 5+ questions with relevant feedback
- [ ] Learning resources: Show 3+ resources per skill gap
- [ ] Readiness comparison: Compare 3 roles with scores
- [ ] Localization: Test EN, DE, FR responses
- [ ] Error cases: Test with incomplete profile, API errors

---

## Checkpoint: Pre-Commit Verification

Before committing Phase 6:

**Code Quality:**
- [ ] No TypeScript errors
- [ ] All 12+ tests passing (8 integration + 4 E2E)
- [ ] Build passing
- [ ] No console errors/warnings
- [ ] Linting passed

**Functionality:**
- [ ] Mock interview works end-to-end
- [ ] Learning resources curated and ranked
- [ ] Readiness scores accurate
- [ ] Localization complete (3 languages)

**Documentation:**
- [ ] SPEC.md complete
- [ ] PLAN.md complete
- [ ] PHASE6-HANDOFF.md created
- [ ] API documentation updated

---

## Timeline

| Wave | Task | Duration | Total |
|------|------|----------|-------|
| 1 | Mock Interview Engine | 8-10 hours | 8-10 hours |
| 2 | Learning Resources | 6-8 hours | 14-18 hours |
| 3 | Multi-Role Readiness | 6-8 hours | 20-26 hours |
| 4 | UI & Localization | 4-6 hours | 24-32 hours |
| 5 | Testing & Validation | 4-6 hours | 28-38 hours |

**Total Estimated Time:** 28–38 hours (~4–5 working days)

---

## Success Criteria

✅ **Build:** `npm run build` passes  
✅ **Tests:** 12+ tests passing (8 integration + 4 E2E)  
✅ **Functionality:** All 3 features work end-to-end  
✅ **Localization:** EN/DE/FR all working  
✅ **Performance:** Responses <3 seconds, interviews <60 seconds  

---

## Notes

- Phase 6 depends on Phase 3-4 (Profile memory + guidance)
- Interview engine uses Claude (costs estimated $0.02-0.05 per session)
- Resource database can be manually curated or sourced from APIs
- Role profiles can start with 20 roles and expand over time
- Future enhancements: Interview history analytics, resource ratings, peer comparisons

---

**Phase 6 Ready to Execute** ✅
