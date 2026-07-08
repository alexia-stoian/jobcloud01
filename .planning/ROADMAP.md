# Roadmap: JobScout24 AI Job Copilot

**Created:** 2026-07-08
**Granularity:** standard
**Roadmap Style:** Vertical MVP phases
**Coverage:** 42/42 v1 requirements mapped

## Phases

- [ ] **Phase 1: Account, Language, And Candidate Profile Foundation** - Users can securely access the product, work in EN/DE/FR, and build a reusable baseline candidate profile.
- [ ] **Phase 2: CV-Aware Guided Onboarding** - Users can upload a CV and complete AI-led onboarding that asks role-relevant follow-up questions without locking in unconfirmed facts.
- [ ] **Phase 3: Durable Memory And Readiness** - Users get a reliable long-lived profile memory that reuses prior answers and shows what is complete versus what still needs clarification.
- [ ] **Phase 4: Personalized Job Guidance And Coaching** - Users receive profile-grounded next steps, interview preparation, salary guidance, and skill-improvement coaching.

## Phase Details

### Phase 1: Account, Language, And Candidate Profile Foundation
**Goal**: Users can securely access a multilingual app and maintain a structured candidate profile as the durable base for later AI guidance.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, LOCL-01, LOCL-02, LOCL-03, PROF-01, PROF-02, PROF-03, PROF-04, PROF-05, PROF-06, PROF-07, PROF-08, PROF-09, PROF-10, PROF-11, PROF-12
**Success Criteria** (what must be TRUE):
1. User can create an account, log in, and return later to the same saved candidate profile.
2. User can use the landing page, onboarding entry points, and profile surfaces in English, German, or French and switch languages later without losing saved data.
3. User can enter, save, and later edit their personal details, job situation, target roles, location, contract preferences, work rate, qualifications, work permit status, and salary expectations.
4. User can review a structured summary of their saved candidate profile before moving into deeper AI-guided flows.
**Plans**: TBD
**UI hint**: yes

### Phase 2: CV-Aware Guided Onboarding
**Goal**: Users can accelerate onboarding with CV upload and receive adaptive job-hunt-only AI questioning that captures missing or role-specific details safely.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: CVIN-01, CVIN-02, CVIN-03, CVIN-04, CVIN-05, AION-01, AION-02, AION-03, AION-04, AION-05, AION-06, AION-07, AION-08, AION-09
**Success Criteria** (what must be TRUE):
1. User can upload a CV during onboarding and see extracted candidate details used to prefill or propose profile data.
2. The AI asks personalized employer-style follow-up questions based on the uploaded CV, the user’s target role, and role-specific constraints such as permits, certifications, physical demands, or working conditions when relevant.
3. User can skip individual onboarding questions, continue the flow without breaking it, and come back to unanswered items later.
4. The AI stays within the job-search and candidate-profiling domain, marks unclear or ambiguous CV information for clarification, and does not treat unconfirmed assumptions as final profile facts.
5. User can continue onboarding even when CV parsing is partial or incomplete.
**Plans**: TBD
**UI hint**: yes

### Phase 3: Durable Memory And Readiness
**Goal**: Users can rely on the system to remember detailed profile facts and earlier answers across sessions, then use that memory to understand profile completeness.
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: MEMG-01, MEMG-02, MEMG-03, MEMG-04, MEMG-10
**Success Criteria** (what must be TRUE):
1. User can return in a later session and find their confirmed requirements, preferences, and detailed CV-derived facts still available in the reusable candidate profile.
2. The system reuses earlier answers in later onboarding or guidance flows so the user is not repeatedly asked for the same information unnecessarily.
3. User can trust that detailed CV content such as projects, education, languages, frameworks, tools, and qualifications remains available when relevant to their job target.
4. User can view a readiness-style summary that clearly shows which profile areas are complete and which still need clarification.
**Plans**: TBD
**UI hint**: yes

### Phase 4: Personalized Job Guidance And Coaching
**Goal**: Users can turn their saved profile into practical job-search guidance, interview preparation, salary guidance, and role-readiness improvement advice.
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: MEMG-05, MEMG-06, MEMG-07, MEMG-08, MEMG-09
**Success Criteria** (what must be TRUE):
1. User receives tailored next-step guidance based on saved profile data and target roles.
2. User can get interview preparation support that reflects their profile, target role, and previously confirmed constraints.
3. User receives skill or qualification improvement suggestions based on gaps between the current profile and the target role.
4. User receives salary expectation guidance and profile-grounded readiness feedback informed by their saved role goals, compensation targets, and constraints.
**Plans**: TBD
**UI hint**: yes

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Account, Language, And Candidate Profile Foundation | 0/TBD | Not started | - |
| 2. CV-Aware Guided Onboarding | 0/TBD | Not started | - |
| 3. Durable Memory And Readiness | 0/TBD | Not started | - |
| 4. Personalized Job Guidance And Coaching | 0/TBD | Not started | - |

---
*Last updated: 2026-07-08 during roadmap creation*
