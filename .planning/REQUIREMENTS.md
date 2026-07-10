# Requirements: JobScout24 AI Job Copilot

**Defined:** 2026-07-08
**Core Value:** Help a job seeker turn their CV, preferences, and goals into a complete, accurate, actionable profile for finding the right next job.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication

- [ ] **AUTH-01**: User can create an account with email and password.
- [ ] **AUTH-02**: User can log in to an existing account.
- [ ] **AUTH-03**: User session persists across browser refresh and later visits.
- [ ] **AUTH-04**: User profile data remains tied to the authenticated account.

### Localization

- [ ] **LOCL-01**: User can choose English, German, or French as the application language.
- [ ] **LOCL-02**: Landing page, onboarding flow, profile views, and AI guidance appear in the selected language.
- [ ] **LOCL-03**: User can change language later without losing saved profile data.

### Candidate Profile

- [ ] **PROF-01**: User can enter and save their full name.
- [ ] **PROF-02**: User can describe their current job situation.
- [ ] **PROF-03**: User can specify their employment objective, such as finding a new job, changing direction, or growing in their current field.
- [ ] **PROF-04**: User can save preferred roles or job titles of interest.
- [ ] **PROF-05**: User can save preferred work location.
- [ ] **PROF-06**: User can save preferred contract type or contract period.
- [ ] **PROF-07**: User can save preferred work rate.
- [ ] **PROF-08**: User can save skills, diplomas, certifications, and qualifications.
- [ ] **PROF-09**: User can save work permit or work authorization information.
- [ ] **PROF-10**: User can save salary expectations or compensation targets.
- [ ] **PROF-11**: User can review a structured summary of their current candidate profile.
- [ ] **PROF-12**: User can edit saved profile details after onboarding.

### CV Ingestion

- [ ] **CVIN-01**: User can upload a CV file during onboarding.
- [ ] **CVIN-02**: System extracts candidate-relevant information from the uploaded CV to prefill profile data.
- [ ] **CVIN-03**: System extracts and stores detailed CV facts including work history, education, languages, projects, skills, tools, frameworks, and other job-relevant experience when present.
- [ ] **CVIN-04**: System identifies missing, unclear, or ambiguous CV information and uses it to drive follow-up questions.
- [ ] **CVIN-05**: User can continue onboarding even if CV parsing is incomplete.

### AI Onboarding

- [ ] **AION-01**: AI asks personalized onboarding questions based on the uploaded CV and the user's target role or employment goal.
- [ ] **AION-02**: AI can ask employer-style follow-up questions that improve profile completeness.
- [ ] **AION-03**: User can skip individual onboarding questions without ending the onboarding flow.
- [ ] **AION-04**: Skipped questions remain available for the user to answer later.
- [ ] **AION-05**: AI stores confirmed answers as structured profile data.
- [ ] **AION-06**: AI stays focused on job-search, candidate profiling, interview preparation, and skill-improvement guidance.
- [ ] **AION-07**: AI asks role-specific requirement questions based on the user's target job, including job-relevant capabilities, qualifications, constraints, and working conditions.
- [ ] **AION-08**: AI can ask eligibility or suitability questions that matter for a specific role, such as work permits, certifications, physical demands, or other job-specific constraints, when relevant.
- [ ] **AION-09**: AI does not present unconfirmed CV assumptions as final profile facts without user review.

### Memory And Guidance

- [ ] **MEMG-01**: System remembers user requirements, preferences, and confirmed CV details across sessions.
- [ ] **MEMG-02**: System remembers detailed CV content including projects, education, languages, role-specific skills, frameworks, tools, and qualifications when those details are relevant to the user's job target.
- [ ] **MEMG-03**: System remembers answers from earlier onboarding steps and uses them in future questions to avoid asking for the same information again unnecessarily.
- [ ] **MEMG-04**: System keeps a reusable candidate profile that can be used in later guidance flows.
- [ ] **MEMG-05**: User receives tailored next-step guidance based on saved profile data and target roles.
- [ ] **MEMG-06**: User can receive interview preparation support tailored to their target role and profile.
- [ ] **MEMG-07**: User can receive suggestions for skills or qualifications to improve based on their target role and current profile.
- [ ] **MEMG-08**: User can receive salary expectation guidance informed by their profile, target role, and saved constraints.
- [ ] **MEMG-09**: User can receive profile-grounded feedback on how to improve readiness for a target role.
- [ ] **MEMG-10**: User can view a readiness-style summary showing what profile information is complete and what still needs clarification.

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Job Search Execution

- **EXEC-01**: User can save job opportunities to a lightweight shortlist.
- **EXEC-02**: User can track application progress across saved jobs.
- **EXEC-03**: User can receive reminders about application next steps.

### Advanced Coaching

- **COCH-01**: User can run repeated mock interview sessions with saved history.
- **COCH-02**: User can receive curated learning resources linked to identified skill gaps.
- **COCH-03**: User can compare readiness across multiple target roles.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Employer or recruiter dashboards | v1 is focused on the job seeker experience only |
| Autonomous job applications | Trust and profile quality need validation before automation |
| Full job-tracker CRM | Adds a separate workflow surface and is not core to validating the profile copilot |
| General-purpose chatbot behavior | The assistant must remain focused on job-hunt workflows |
| Video interview analytics | Too complex for v1 compared with text-based interview preparation |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Completed |
| AUTH-02 | Phase 1 | Completed |
| AUTH-03 | Phase 1 | Completed |
| AUTH-04 | Phase 1 | Completed |
| LOCL-01 | Phase 1 | Completed |
| LOCL-02 | Phase 1 | Completed |
| LOCL-03 | Phase 1 | Completed |
| PROF-01 | Phase 1 | Completed |
| PROF-02 | Phase 1 | Completed |
| PROF-03 | Phase 1 | Completed |
| PROF-04 | Phase 1 | Completed |
| PROF-05 | Phase 1 | Completed |
| PROF-06 | Phase 1 | Completed |
| PROF-07 | Phase 1 | Completed |
| PROF-08 | Phase 1 | Completed |
| PROF-09 | Phase 1 | Completed |
| PROF-10 | Phase 1 | Completed |
| PROF-11 | Phase 1 | Completed |
| PROF-12 | Phase 1 | Completed |
| CVIN-01 | Phase 2 | Pending |
| CVIN-02 | Phase 2 | Pending |
| CVIN-03 | Phase 2 | Pending |
| CVIN-04 | Phase 2 | Pending |
| CVIN-05 | Phase 2 | Pending |
| AION-01 | Phase 2 | Pending |
| AION-02 | Phase 2 | Pending |
| AION-03 | Phase 2 | Pending |
| AION-04 | Phase 2 | Pending |
| AION-05 | Phase 2 | Pending |
| AION-06 | Phase 2 | Pending |
| AION-07 | Phase 2 | Pending |
| AION-08 | Phase 2 | Pending |
| AION-09 | Phase 2 | Pending |
| MEMG-01 | Phase 3 | Completed |
| MEMG-02 | Phase 3 | Completed |
| MEMG-03 | Phase 3 | Completed |
| MEMG-04 | Phase 3 | Completed |
| MEMG-05 | Phase 4 | Completed |
| MEMG-06 | Phase 4 | Completed |
| MEMG-07 | Phase 4 | Completed |
| MEMG-08 | Phase 4 | Completed |
| MEMG-09 | Phase 4 | Completed |
| MEMG-10 | Phase 3 | Completed |

**Coverage:**
- v1 requirements: 42 total
- Mapped to phases: 42
- Unmapped: 0

---
*Requirements defined: 2026-07-08*
*Last updated: 2026-07-08 after roadmap creation*
