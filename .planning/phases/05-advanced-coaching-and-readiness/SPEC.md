# Phase 6 Specification: Advanced Coaching And Readiness

**Phase:** 06 (v2 Phase 1 — Advanced Coaching)  
**Status:** Specification Phase  
**Created:** 2026-07-14  
**Target:** Production-ready mock interview + skill development + multi-role readiness system

---

## Goal

Users receive advanced coaching features: mock interview sessions with feedback, curated learning resources for skill gaps, and readiness comparison across multiple target roles.

---

## Scope: What Gets Built

### v2 Requirements Mapping

| Requirement | Feature | Description |
|------------|---------|-------------|
| **COCH-01** | Mock Interview Sessions | Users run repeated interview sessions with saved history, feedback, and progress tracking |
| **COCH-02** | Learning Resources | System curates skill-development resources based on identified gaps from Phase 4 guidance |
| **COCH-03** | Multi-Role Readiness | Users can compare their profile readiness across 2+ target roles |

---

## Feature 1: Mock Interview Sessions (COCH-01)

### User-Facing Surfaces

**Interview Session Page** (`/mock-interview`)
- Start new mock interview session
- Select interview type: "Behavioral", "Technical", "Case Study", "Cultural Fit"
- Live Q&A with Claude as interviewer
- Real-time feedback and scoring
- Session history with past interviews

**Interview History** (`/mock-interview/history`)
- View all past sessions
- Compare performance across sessions
- Track improvement over time
- Export feedback as PDF

### Backend APIs

**POST `/api/mock-interview/start`**
- Request: `{ interviewType: "behavioral" | "technical" | "case-study" | "cultural-fit", targetRole?: string }`
- Response: `{ sessionId, startedAt, interviewerContext }`

**POST `/api/mock-interview/question`**
- Request: `{ sessionId, userAnswer: string }`
- Response: `{ question: string, feedback: string, score: 0-100, nextQuestion: string | null }`

**POST `/api/mock-interview/end`**
- Request: `{ sessionId, userRating?: 1-5 }`
- Response: `{ sessionId, summary, overallScore, strengths, improvements, createdAt }`

**GET `/api/mock-interview/history`**
- Response: `{ sessions: Array<{ id, type, score, date, targetRole, duration }> }`

**GET `/api/mock-interview/sessions/{sessionId}`**
- Response: `{ sessionId, type, questions, answers, feedback, overallScore, duration }`

### Data Model

```prisma
model InterviewSession {
  id String @id @default(cuid())
  userId String
  user CandidateProfile @relation(fields: [userId], references: [userId])
  
  type "behavioral" | "technical" | "case-study" | "cultural-fit"
  targetRole String?
  
  questions InterviewQuestion[]
  overallScore Int // 0-100
  strengthAreas String[]
  improvementAreas String[]
  
  duration Int // seconds
  userRating Int? // 1-5
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([userId, createdAt])
}

model InterviewQuestion {
  id String @id @default(cuid())
  sessionId String
  session InterviewSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  
  question String
  userAnswer String?
  feedback String?
  score Int? // 0-100
  
  order Int // Question number in sequence
  
  @@index([sessionId, order])
}
```

### Prompt Engineering

Claude acts as professional interviewer for each type:

**Behavioral:**
- Uses STAR method framework
- Asks about past experiences
- Evaluates communication, problem-solving, teamwork
- Follows up with probing questions

**Technical:**
- Asks coding/technical problems
- Evaluates solution approach, code quality, explanations
- Tailored to target role (if provided)

**Case Study:**
- Presents business scenario
- Evaluates analysis, frameworks, recommendations
- Scores on structure, creativity, business acumen

**Cultural Fit:**
- Asks about values, work style, collaboration
- Evaluates alignment with typical Swiss tech culture
- Scores on integrity, adaptability, communication

---

## Feature 2: Learning Resources (COCH-02)

### User-Facing Surfaces

**Skill Development Dashboard** (`/skill-development`)
- View skill gaps from latest guidance
- Browse recommended learning resources
- Track resource completion
- See learning progress vs target role

### Backend APIs

**GET `/api/skill-development/gaps`**
- Uses latest guidance `skill_gaps` section
- Parses into structured skill gaps
- Response: `{ gaps: Array<{ skill, priority, why }> }`

**GET `/api/skill-development/resources`**
- Request: `{ skillGap: string, numberOfResources?: number }`
- Response: `{ resources: Array<{ id, title, type, source, duration, link, cost }> }`

**POST `/api/skill-development/mark-complete`**
- Request: `{ resourceId: string }`
- Response: `{ resourceId, completedAt, pointsEarned }`

**GET `/api/skill-development/progress`**
- Response: `{ completedResources, inProgressResources, totalSkillGaps, progressPercent }`

### Resource Curation Strategy

**Resource Types:**
- Online courses (Udemy, Coursera, LinkedIn Learning)
- Books and PDFs
- YouTube tutorials
- Documentation and guides
- Practice problems and exercises
- Certifications

**Curation Logic:**
- Parse skill gaps from latest guidance
- Query knowledge base of curated resources (manually maintained or sourced)
- Rank by: relevance, cost (free first), time-to-completion, user ratings
- Return top 3-5 resources per skill gap
- Include mix of free + paid options

### Data Model

```prisma
model SkillResource {
  id String @id @default(cuid())
  
  skillTag String // "SQL", "Python", "Public Speaking", etc
  title String
  type "course" | "book" | "video" | "documentation" | "certification" | "practice"
  source String // "Udemy", "LinkedIn Learning", etc
  duration Int? // minutes
  link String?
  cost Decimal // 0 for free
  
  difficulty "beginner" | "intermediate" | "advanced"
  targetRole String? // "Product Manager", "Engineer", etc
  
  tags String[] // ["data-analysis", "sql", "python"]
  
  createdAt DateTime @default(now())
  
  @@index([skillTag, type])
}

model CompletedResource {
  id String @id @default(cuid())
  userId String
  resourceId String
  resource SkillResource @relation(fields: [resourceId], references: [id])
  
  completedAt DateTime @default(now())
  rating Int? // 1-5
  feedback String?
  
  @@unique([userId, resourceId])
  @@index([userId, completedAt])
}
```

---

## Feature 3: Multi-Role Readiness Comparison (COCH-03)

### User-Facing Surfaces

**Multi-Role Readiness Page** (`/readiness-comparison`)
- Select 2-3 target roles
- Compare current profile readiness for each role
- View: requirements, skill gaps, time to readiness, action items

### Backend APIs

**GET `/api/readiness/roles`**
- Returns list of available job roles
- Response: `{ roles: Array<{ id, title, description, marketDemand }> }`

**POST `/api/readiness/compare`**
- Request: `{ roleIds: [string, string, string] }`
- Response: `{ comparisons: Array<{ roleId, readinessPercent, strengths, gaps, timeToReady }> }`

### Readiness Scoring

For each role, evaluate:
1. **Experience Match** — Does profile have relevant experience?
2. **Skills Match** — Do qualifications cover required skills?
3. **Education Match** — Does education level fit requirements?
4. **Work Permit** — Are constraints compatible?
5. **Location** — Does location preference match market demand?

Score: 0-100% readiness

**Example:**
```
Senior Product Manager role:
- Experience: 80% (7 years relevant experience)
- Skills: 70% (has analytics, missing strategic planning)
- Education: 90% (MBA not required but helpful)
- Work Permit: 100% (Swiss work permit)
- Location: 85% (prefer Zurich, role based in Zurich)

Overall Readiness: 85%
```

---

## Requirements Mapping

| v2 Requirement | Implementation |
|---|---|
| **COCH-01** | Mock Interview Sessions with history, feedback, and scoring |
| **COCH-02** | Learning Resources curated based on skill gaps from guidance |
| **COCH-03** | Multi-role readiness comparison with scoring |

---

## Success Criteria

1. ✅ User can start mock interview session (choose type + target role)
2. ✅ Claude generates 5+ interview questions with feedback
3. ✅ Session saved with score and history accessible
4. ✅ User can view learning resources for identified skill gaps
5. ✅ Resources curated and ranked by relevance/cost
6. ✅ User can mark resources as completed and track progress
7. ✅ User can compare readiness across 2-3 target roles
8. ✅ Readiness scoring accurate (0-100%) with clear breakdown
9. ✅ All features multilingual (EN/DE/FR)
10. ✅ Build passes, tests pass, no console errors

---

## Integration Points: v1 Dependency

Phase 6 **depends on v1 phases 3-4:**

1. **DurableProfileMemory** (Phase 3)
   - Used as context for mock interview tailoring
   - Skills listed in memory used for resource curation
   
2. **Guidance Skill Gaps** (Phase 4)
   - Latest guidance `skill_gaps` section parsed for learning resources
   - Drives COCH-02 feature

3. **Profile Completion Gate** (Phase 3)
   - Minimal profile required before mock interview
   - Readiness scoring uses profile fields

---

## Remaining Work

### Task 1: Mock Interview Engine
- Claude integration for interviewer persona
- Multi-type interview prompting (behavioral, technical, etc)
- Feedback scoring and analysis
- Session persistence

### Task 2: Learning Resource Database
- Curate initial resource collection (50+ resources)
- Build resource matching algorithm
- Implement completion tracking

### Task 3: Readiness Comparison
- Define role profiles (50+ roles with requirements)
- Build matching/scoring algorithm
- Implement multi-role comparison

### Task 4: UI Components
- Interview session UI (Q&A display, answer input, feedback)
- Learning resources browser
- Readiness comparison visualization

### Task 5: Testing & Localization
- Integration tests for all endpoints
- E2E tests for full flows
- Localization for 3 languages (EN/DE/FR)

---

## Estimated Scope

| Feature | Complexity | Effort |
|---------|-----------|--------|
| Mock Interviews | Medium | 8-10 hours |
| Learning Resources | Medium | 6-8 hours |
| Multi-Role Readiness | Medium | 6-8 hours |
| UI Components | Medium | 4-6 hours |
| Testing & Polish | Low-Medium | 4-6 hours |
| **TOTAL** | | **28-38 hours** |

---

## Acceptance Criteria

**Code Quality:**
- [ ] All Phase 6 tests passing (15+ tests)
- [ ] Build passing with strict TypeScript
- [ ] No console errors/warnings
- [ ] All endpoints secured with auth

**Functionality:**
- [ ] Mock interview sessions work end-to-end
- [ ] Learning resources curated and ranked
- [ ] Readiness scores accurate and actionable
- [ ] Multi-role comparison displays correctly

**Localization:**
- [ ] All 3 languages supported (EN/DE/FR)
- [ ] Interview feedback localized
- [ ] UI strings translated

**Documentation:**
- [ ] Phase 6 handoff document created
- [ ] API documentation updated
- [ ] User guide for each feature

---

## Next Steps

1. **Finalize Specification** (this document)
2. **Create Phase 6 PLAN.md** with detailed execution
3. **Execute Phase 6** with wave-based parallelization
4. **Test & Validate** all features
5. **Handoff & Commit** with comprehensive documentation

---

**Phase 6 Ready to Plan** ✅
