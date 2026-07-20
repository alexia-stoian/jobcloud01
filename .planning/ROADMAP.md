# Roadmap: JobScout24 AI Job Copilot

**Created:** 2026-07-08
**Granularity:** standard
**Roadmap Style:** Vertical MVP phases
**Coverage:** 42/42 v1 requirements mapped

## Phases

- [x] **Phase 1: Account, Language, And Candidate Profile Foundation** - Users can securely access the product, work in EN/DE/FR, and build a reusable baseline candidate profile.
- [x] **Phase 2: CV-Aware Guided Onboarding** - Users can upload a CV and complete AI-led onboarding that asks role-relevant follow-up questions without locking in unconfirmed facts.
- [x] **Phase 3: Durable Memory And Readiness** - Users get a reliable long-lived profile memory that reuses prior answers and shows what is complete versus what still needs clarification.
- [x] **Phase 4: Personalized Job Guidance And Coaching** - Users receive profile-grounded next steps, interview preparation, salary guidance, and skill-improvement coaching.

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

**Plans**: 01-PLAN.md, 01-SUMMARY.md
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
| 1. Account, Language, And Candidate Profile Foundation | 1/1 | Completed | 2026-07-08 |
| 2. CV-Aware Guided Onboarding | 1/1 | Completed | 2026-07-09 |
| 3. Durable Memory And Readiness | 1/1 | Completed | 2026-07-09 |
| 4. Personalized Job Guidance And Coaching | 1/1 | Completed | 2026-07-09 |

### Phase 5: Cheerful Preference Questions

**Goal**: Users experience warm, emoji-rich preference questions that match the assistant's cheerful personality and provide encouragement after each selection.
**Mode:** mvp
**User Story**: 

- **As a** job seeker going through the onboarding and preference-gathering process for the first time
- **I want to** see preference questions written in a warm, cheerful, encouraging way with emojis, and receive a short celebratory acknowledgment after each answer before moving to the next question
- **So that** the onboarding experience feels consistent with the cheerful assistant personality, I feel motivated and supported throughout the preference-gathering process, and the transition from preferences to services feels seamless and encouraging

**Depends on**: Phase 4
**Requirements**: UX-TONE-01, UX-PERSONALITY-CONSISTENCY
**Success Criteria** (what must be TRUE):

1. All preference questions (contract type, work rate, salary, work authorization, etc.) use cheerful personality with emojis.
2. Questions include multiple-choice buttons (existing buttons kept) with warm introductory text.
3. After user selects an answer, the assistant acknowledges it with a celebratory message (e.g., "Got it! 🎯" or "Perfect! 💼✨").
4. The exact same Profile fields and data saving logic remain unchanged - only message text and tone are improved.
5. The preference tone matches the energy of interview mode, cover letter mode, and CV enhancement services.

**Plans**: TBD
**UI hint**: yes

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Account, Language, And Candidate Profile Foundation | 1/1 | Completed | 2026-07-08 |
| 2. CV-Aware Guided Onboarding | 1/1 | Completed | 2026-07-09 |
| 3. Durable Memory And Readiness | 1/1 | Completed | 2026-07-09 |
| 4. Personalized Job Guidance And Coaching | 1/1 | Completed | 2026-07-09 |
| 5. Cheerful Preference Questions | 0/1 | Not started | - |

### Phase 6: Basic Artifact Memory - Cover Letters, Job Postings, Interview Answers

**Goal**: Users can retrieve exact copies of past cover letters, job postings, and interview answers; display them verbatim; and make targeted edits while preserving the original content.
**Mode:** mvp
**Depends on**: Phase 4 (existing cover letter service, interview prep)
**Requirements**: MEM-ARTIFACT-01, MEM-ARTIFACT-02, MEM-ARTIFACT-03
**Success Criteria** (what must be TRUE):

1. Every cover letter generated by the assistant is automatically stored with metadata (company, job title).
2. Every job posting pasted/input by the user is automatically stored with full text and metadata.
3. Every interview Q&A pair is automatically stored with question, user's answer, and feedback.
4. User can retrieve any artifact by reference (e.g., "show me my cover letter for [Company]", "that job posting I mentioned", "my answer about the deadline challenge") and receive the exact verbatim stored text.
5. User can request edits (e.g., "add a leadership paragraph", "make it shorter") and the assistant applies ONLY the requested changes, preserves everything else verbatim, and saves as a new version.
6. All existing functionality (CV extraction, preferences, cover letter generation, interview prep, coaching) remains completely unchanged.
7. Only job-search and hiring-related content is stored and retrieved; off-topic content is rejected.
8. Confirmations use the cheerful emoji personality (e.g., "Here's that cover letter for TechCorp! 📝✨").

**Plans**: 06-PLAN.md
**UI hint**: no

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 6. Basic Artifact Memory | 0/1 | Not started | - |

### Phase 7: Recruiter Signals Inference (Invisible)

**Goal**: Recruiters (dev/admin layer only) get evidence-backed, continuously-updated confidence scores for 11 recruiter-relevant candidate signals, inferred invisibly from natural conversation, forced-choice questions, CV cross-referencing, and mock interviews — without the job seeker ever knowing signals are being measured.
**Mode:** mvp
**Depends on**: Phase 6 (artifact memory / DB + persistence layer), Phase 4 (mock interview, services), Phase 2 (onboarding + CV extraction)
**Requirements**: SIGNAL-INFER-01, SIGNAL-CONFIDENCE-02, SIGNAL-EVIDENCE-03, SIGNAL-PERSIST-04, SIGNAL-NONDISCLOSURE-05, SIGNAL-ADMIN-UI-06, SIGNAL-QUESTION-DISCIPLINE-07
**Success Criteria** (what must be TRUE):

1. The system infers all 11 signals (4 motivation, 3 behavioral/fit, 4 skill/trajectory) with a 0–100% confidence score each, recalculated after every user input.
2. Every score change is backed by explicit evidence (verbatim quotes / observed behaviors) and stored with contradiction flags and update history — fully auditable, never a blind guess.
3. Signals persist to the candidate's profile DB and are reloaded/refined across sessions (not restarted), including cross-session consistency checks.
4. Data is gathered through the 7 mechanisms (multi-signal questions, forced-choice prompts, CV contradiction detection, consistency checks, confidence-gap-driven targeting, passive response-style analysis, mock-interview mining) blended naturally into existing flows.
5. Strict question discipline: every question either advances a real service need OR strategically targets a specific low-confidence signal while doubling as a genuinely helpful career question — no random/filler questions.
6. Strict non-disclosure: the job seeker is never told signals exist, are measured, or influence anything; signals are never surfaced or reflected back in the user-facing conversation.
7. A live "Recruiter Signals" panel (dev/admin/recruiter ONLY, right side of the onboarding conversation) shows each signal's live confidence bar, inferred value, and contradiction flags — not visible to the job seeker.
8. All existing functionality (onboarding, CV extraction, cover letters, interview prep, coaching, artifact memory) remains unchanged.

**Plans**: TBD
**UI hint**: yes (dev/admin-only panel)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 7. Recruiter Signals Inference | 0/1 | Not started | - |

### Phase 8: Admin User Dashboard (Recruiter-Facing)

**Goal**: Admin/recruiter staff get a protected Admin area — reachable from an "Admin" link under "Notifications" in the left sidebar — that lists every user and, per user, reveals their complete candidate profile plus the Phase 7 recruiter signals in a large right-side panel that updates in real time as candidates change their profile or trigger signals. Job seekers never see any of it.
**Mode:** mvp
**Depends on**: Phase 7 (recruiter signals model + admin signals API + panel), Phase 1 (auth, profile, i18n, app shell), Phase 3 (durable profile/memory)
**Requirements**: ADMIN-NAV-01, ADMIN-AUTHZ-02, ADMIN-USERLIST-03, ADMIN-PROFILE-PANEL-04, ADMIN-SIGNALS-PANEL-05, ADMIN-REALTIME-06, ADMIN-NONDISCLOSURE-07
**Success Criteria** (what must be TRUE):

1. Admins see an "Admin" link directly under "Notifications" in the left sidebar; non-admins never see it and cannot reach `/admin` by URL (server-enforced authorization).
2. The Admin page lists all app users, each with name/email, target role, completion status, and a working "Profile" button.
3. Clicking "Profile" opens a large right-side panel showing that user's complete candidate profile and all 11 recruiter signals with confidence bars, inferred values, evidence, and contradiction flags.
4. When the selected candidate updates their profile or triggers signals during onboarding, the admin panel updates in real time (within a few seconds) without a manual refresh.
5. All existing user-facing functionality and the invisible nature of signals are fully preserved; `npm run build` passes with 0 errors; EN/DE/FR not regressed.

**Plans**: TBD
**UI hint**: yes (admin-only surface)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 8. Admin User Dashboard | 0/? | Not started | - |

### Phase 9: Recruiter Sourcing - JSON-driven candidate matching with fit scores and reports

**Goal:** Admins/recruiters get a new "Sourcing" page — reachable from a "Sourcing" link directly under "Admin" in the left sidebar — where they upload a JSON file describing what they need in a candidate (role, required skills, experience, education, languages, preferences, etc.). The JSON can be swapped for a different one at any time. On submission, every app user's full Admin profile (skills, education, experience, languages, preferences, and invisible 0–1 recruiter signals) is compared against the recruiter's needs, and the top 3 best-fitting candidates are surfaced. Each candidate shows a fit percentage plus a thorough, fact-grounded report explaining why they fit, their most relevant/best skills for the role, and clear pros and cons of hiring them — all derived from real Admin-profile facts. Job seekers never see any of this.
**Mode:** mvp
**Depends on:** Phase 8 (admin area, users list, admin profile bundle API, authz gate), Phase 7 (recruiter signals), Phase 1 (auth, app shell, i18n)
**Requirements**: TBD (run /gsd-plan-phase 9 to break down)
**Success Criteria** (what must be TRUE):

1. Admins see a "Sourcing" link directly under "Admin" in the left sidebar; non-admins never see it and cannot reach the sourcing route by URL (server-enforced authorization).
2. The Sourcing page shows a compact upload box that accepts a JSON file describing the recruiter's needs; the uploaded JSON can be replaced with a different one at any moment.
3. On submission, all app users' full Admin profiles (skills, education, experience, languages, preferences, and invisible signals) are compared against the recruiter JSON, and the top 3 best-fit candidates are displayed.
4. Each of the top 3 shows a fit percentage and a thorough report grounded in actual Admin-profile facts: why they fit, best/most-relevant skills for the role, and explicit pros and cons.
5. Signals remain invisible to job seekers; existing functionality is preserved; `npm run build` passes with 0 errors; EN/DE/FR not regressed.

**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 9 to break down)

### Phase 10: Dynamic target-role binding: assistant detects target-role intent anywhere in conversation, updates Profile Target Roles field, and re-optimizes interview/cover-letter generation and memory to the new role

**Goal:** Replace the brittle regex target-role detector with an LLM intent classifier that, anywhere in the assistant conversation (including interview/practice turns), recognizes explicit first-person intent to pursue a role, silently overwrites the single active target role in both `CandidateProfile.targetRoles` and `OnboardingSession.targetRole`, acknowledges the switch in the reply (EN/DE/FR), and lets all future generation (interview questions, cover letters, guidance, memory) optimize to the new role — without regenerating existing artifacts.
**Requirements**: TRB-01, TRB-02, TRB-03, TRB-04, TRB-05, TRB-06
**Depends on:** Phase 9
**Plans:** 2 plans

Plans:

- [ ] 10-1-PLAN.md — LLM target-role detector (keyword-gated, practice-aware, normalize + null-on-failure), localized EN/DE/FR acknowledgement helper, and failing integration test scaffold
- [ ] 10-2-PLAN.md — Rewire the single GLOBAL detection site to the async detector, delete duplicate detect blocks, wire the acknowledgement, remove dead regex functions, fix the standalone mock-interview fallback, and green the tests + build

### Phase 11: Sourcing skill-gap questions: profile button opens Admin profile, assistant (sourcing mode) delivers personalized multiple-choice gap questions in onboarding for >=60% matches, answers feed match %, card shows Q&A and before->now change

**Goal:** On a recruiter sourcing run, persist a session and — for every shown candidate whose displayed fit % is >=60 — generate <=5 personalized, gap-grounded multiple-choice questions (1 correct, 3 distractors, 1 open) queued to that candidate; add a Profile button that opens the Admin profile in a slide-over on the Sourcing page; deliver the queued questions one at a time in the candidate's Onboarding assistant "Sourcing mode" (notify first, never reveal correctness, silently judge open answers, cap at 5, thank + "you'll be contacted" then exit); LLM re-score each answer set with a server clamp guaranteeing a visible increase for good answers; and show the recruiter the Q&A plus "[before] -> [now]" on the card — all without leaking recruiter signals to candidates, regressing Phase 10, or breaking the build.
**Requirements**: SGQ-01, SGQ-02, SGQ-03, SGQ-04, SGQ-05, SGQ-06
**Depends on:** Phase 10
**Plans:** 3 plans

Plans:

- [ ] 11-1-PLAN.md — Additive Prisma models (SourcingSession -> Candidate -> Question -> Answer) + migration, shared Anthropic util, grounded gap-question generator, visible-increase re-score clamp, candidate-scoped DAL, and unit tests
- [ ] 11-2-PLAN.md — Generate + persist queued questions for >=60% candidates on the sourcing run, admin-gated read-back endpoint, Sourcing card Profile slide-over + Q&A / before->now section, EN/DE/FR keys, and a read-back integration test
- [ ] 11-3-PLAN.md — Dedicated session-scoped onboarding delivery endpoint (one-at-a-time MCQ, notify-first, silent open-judge, <=5, re-score + thank-you), onboarding form Sourcing-mode wiring bypassing Phase 10 routing, and a full-loop integration test

### Phase 12: Dynamic sector-aware onboarding flow: CV-first upload, then a target-role question that is CV-tailored multiple-choice (or open-ended without a CV); once the target role is set in assistant memory and Profile>Preferences>Target Role, dynamically customize the Preferences fields to the job sector (max 3 sector-specific fields) while always keeping universal fields (current situation, work rate, contract type); ask sector-specific follow-up preference questions as multiple-choice with a type-your-own option; all in the established cheerful emoji tone per prompts/prompt.txt

**Goal:** Sector-aware onboarding: CV is the first ask, the target-role question is CV-tailored multiple-choice (or open-ended without a CV), and once the target role is set the Preferences fields dynamically adapt to the detected job sector (≤3 sector-specific fields on top of the universal 6, engineers unchanged), delivered as in-chat MCQ follow-ups with type-your-own and rendered/editable on Profile > Preferences — all localized (EN/DE/FR) and cheerful per prompts/prompt.txt.
**Requirements**: D-01..D-09 (locked decisions in 12-CONTEXT.md); must not regress CVIN-*/AION-* (Phase 2), Phase 5 preference copy, Phase 10 target-role binding, Phase 11 sourcing mode.
**Depends on:** Phase 11
**Plans:** 4 plans

Plans:

- [ ] 12-1-PLAN.md — Additive sectorPreferences Prisma column + null-safe localized LLM sector-classification/≤3-field generator + unit tests
- [ ] 12-2-PLAN.md — CV-first ordering, CV-tailored vs open-ended target-role question, universal-6 subset + engineer short-circuit, and sector-generation trigger on the target-role-set event
- [ ] 12-3-PLAN.md — sector:-prefixed in-chat MCQ delivery endpoint (clone sourcing), confirm-policy allowlist, resume wiring, and OnboardingCvUploadForm sector-mode
- [ ] 12-4-PLAN.md — Profile > Preferences dynamic sector block + PATCH persistence + full-loop EN/DE/FR integration test

---
*Last updated: 2026-07-16 — added Phase 9 (Recruiter Sourcing) after Phase 8 merge*
