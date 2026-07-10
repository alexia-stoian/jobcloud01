# Phase 2 Plan: CV-Aware Guided Onboarding

## Phase Goal (MVP)
**As a** logged-in job seeker, **I want to** upload my CV and answer adaptive onboarding questions, **so that** the system can build a more complete candidate profile without guessing on unconfirmed facts.

## Scope Guardrails
- In scope only: CVIN-01..CVIN-05, AION-01..AION-09.
- Enforce the AI contract:
  - LangGraph-driven onboarding workflow for stateful extraction, clarification, skip, and confirm transitions.
  - Treat CV-derived facts as provisional until user confirmation.
  - Keep the assistant constrained to job-search and candidate profiling.
  - Preserve skip/resume state and separate confirmed versus pending facts.
  - Localize all visible onboarding copy in EN/DE/FR.
- Do not add later-phase memory/readiness scoring or job guidance beyond onboarding.

## Delivery Strategy
- Build a vertical slice that proves the upload -> extract -> clarify -> confirm -> persist loop end to end.
- Use the existing authenticated app shell and candidate profile foundation from Phase 1.
- Keep CV parsing and question generation bounded and testable; prefer explicit state and server-side orchestration over loose chat logic.

## Task Breakdown

### T1. Define Phase 2 onboarding data model and state boundaries
- Objective:
  - Establish the state and persistence shape needed for CV upload, extracted facts, pending questions, skips, and confirmations.
- Depends on:
  - Phase 1 profile foundation.
- File touchpoints (expected):
  - prisma/schema.prisma
  - src/lib/onboarding/state.ts
  - src/lib/onboarding/types.ts
  - src/lib/onboarding/validation.ts
- Implementation notes:
  - Add or extend models for onboarding sessions, extracted CV facts, question queues, skip state, and confirmation state as needed.
  - Keep confirmed profile facts distinct from provisional CV-derived suggestions.
  - Make skip/resume state first-class rather than derived from UI state.
  - Preserve account scoping via authenticated userId.
- Verification/tests:
  - prisma validate
  - schema/migration validation
  - unit tests for state shape and validation boundaries
- Done criteria:
  - The app has a clear, account-scoped model for onboarding state that can separate confirmed facts from provisional ones.
- Risk controls and rollback:
  - Risk: polluting the canonical profile with provisional data.
  - Control: separate state channels and explicit confirmation states.
  - Rollback: remove onboarding tables/fields without touching Phase 1 profile models if needed.

### T2. Add CV upload and extraction entrypoint
- Objective:
  - Let users upload or provide CV content and extract candidate details for downstream question generation.
- Depends on:
  - T1.
- File touchpoints (expected):
  - src/app/(app)/onboarding/page.tsx
  - src/components/onboarding/CvUploadStep.tsx
  - src/app/api/onboarding/cv/upload/route.ts
  - src/app/api/onboarding/cv/extract/route.ts
  - src/lib/cv/extract.ts
  - src/lib/cv/parse.ts
  - src/lib/cv/normalise.ts
- Implementation notes:
  - Support partial parsing and continue the flow when extraction is incomplete.
  - Record ambiguous fields separately from confirmed facts.
  - Pre-fill or propose profile values only when the CV supports them strongly enough to justify a suggestion.
  - Keep uploaded content scoped to the authenticated account.
- Verification/tests:
  - integration test for successful upload/extraction
  - test for partial extraction continuing the flow
  - test for ambiguous facts being marked provisional
- Done criteria:
  - A user can upload a CV and see extracted candidate details used to seed onboarding.
- Risk controls and rollback:
  - Risk: overconfident parsing or unusable files.
  - Control: strict extraction schema and graceful fallback for partial content.
  - Rollback: disable extraction endpoint while preserving the upload step.

### T3. Implement adaptive question planning and domain guardrails
- Objective:
  - Generate the next best onboarding questions from CV data, target role, and profile gaps while staying in scope.
- Depends on:
  - T1, T2.
- File touchpoints (expected):
  - src/ai/onboarding/graph.ts
  - src/ai/onboarding/state.ts
  - src/ai/onboarding/prompts.ts
  - src/ai/onboarding/guards.ts
  - src/app/api/onboarding/questions/route.ts
  - src/app/api/onboarding/next-step/route.ts
- Implementation notes:
  - Use the AI contract’s LangGraph state machine to classify facts as confirmed, uncertain, or missing.
  - Ask role-relevant questions tied to the uploaded CV and the user’s target role.
  - Redirect or suppress out-of-scope behavior that is not job-search onboarding.
  - Surface unclear permits, certifications, work conditions, or language details when relevant.
- Verification/tests:
  - unit tests for question selection logic
  - test for scope drift rejection
  - test for ambiguity prompting instead of guessing
- Done criteria:
  - The system can reliably choose a relevant next onboarding question and explain why that question matters.
- Risk controls and rollback:
  - Risk: generic or repetitive questions reduce trust.
  - Control: rank questions against target-role relevance and unresolved CV gaps.
  - Rollback: fall back to a deterministic question set while the planner is tuned.

### T4. Build confirm/skip/resume workflow and profile persistence
- Objective:
  - Let the user confirm suggested facts, skip selected questions, and resume later without losing state.
- Depends on:
  - T3.
- File touchpoints (expected):
  - src/app/api/onboarding/confirm/route.ts
  - src/app/api/onboarding/skip/route.ts
  - src/app/api/onboarding/resume/route.ts
  - src/lib/onboarding/persist.ts
  - src/lib/onboarding/confirm-policy.ts
  - src/lib/onboarding/resume-state.ts
- Implementation notes:
  - Confirmed facts may update the candidate profile; skipped questions must remain unresolved and resumable.
  - Keep user-visible progress and unresolved items in sync with the persisted state.
  - Do not promote unconfirmed suggestions into canonical profile data.
  - Ensure later resumes continue from the right unanswered items.
- Verification/tests:
  - integration test for confirm applying to profile
  - integration test for skip preserving state
  - integration test for resume restoring unresolved items
- Done criteria:
  - The user can safely move through onboarding without being forced to answer every question immediately.
- Risk controls and rollback:
  - Risk: lost skip state or accidental writes of pending facts.
  - Control: explicit state transitions and confirmation gates.
  - Rollback: disable persistence writes while keeping read-only progress display available.

### T5. Localize onboarding surfaces and align with existing app shell
- Objective:
  - Make the Phase 2 onboarding surfaces fully translated and integrated into the logged-in app experience.
- Depends on:
  - T2, T3, T4.
- File touchpoints (expected):
  - messages/en.json
  - messages/de.json
  - messages/fr.json
  - src/app/(app)/onboarding/page.tsx
  - src/components/onboarding/*.tsx
  - src/components/header/LanguageSwitcher.tsx
- Implementation notes:
  - Reuse the existing locale source and translation patterns from Phase 1.
  - Ensure prompt text, labels, skip/resume states, and confirmation messaging are localized consistently.
  - Keep onboarding visible and understandable across EN/DE/FR.
- Verification/tests:
  - i18n coverage check for new onboarding keys
  - e2e test that switching language updates onboarding surfaces
- Done criteria:
  - The onboarding flow reads naturally in all supported languages without semantic drift.
- Risk controls and rollback:
  - Risk: missing or mismatched translation keys.
  - Control: fail tests on untranslated onboarding strings.
  - Rollback: keep a single-language fallback until translations are complete.

### T6. Add observability, validation, and safety checks for onboarding
- Objective:
  - Instrument onboarding behavior and protect the CV flow against scope drift and unconfirmed writes.
- Depends on:
  - T3, T4, T5.
- File touchpoints (expected):
  - src/lib/observability/onboarding-logger.ts
  - src/lib/onboarding/guards.ts
  - src/lib/onboarding/safety.ts
  - src/app/api/health/onboarding/route.ts
  - tests/integration/onboarding-security.test.ts
- Implementation notes:
  - Log extraction, question selection, confirm, skip, and resume events.
  - Add guards for scope control, schema validation, and unconfirmed-fact blocking.
  - Provide a health check that exercises the onboarding dependencies.
- Verification/tests:
  - integration tests for invalid onboarding payload rejection
  - smoke test for onboarding health endpoint
- Done criteria:
  - Onboarding has enough telemetry and safety checks to diagnose bad prompts, bad parsing, and state loss.
- Risk controls and rollback:
  - Risk: noisy telemetry or missing guard coverage.
  - Control: keep structured event types and bounded payloads.
  - Rollback: reduce log volume without removing guard logic.

### T7. End-to-end acceptance pack for Phase 2 onboarding
- Objective:
  - Prove the full CV-aware onboarding flow from upload through confirm/skip/resume and localization.
- Depends on:
  - T1 through T6.
- File touchpoints (expected):
  - tests/e2e/onboarding-cv.spec.ts
  - tests/integration/onboarding-state.spec.ts
  - tests/integration/onboarding-scope.spec.ts
  - tests/integration/onboarding-i18n.spec.ts
  - docs/phase2/verification-checklist.md
- Implementation notes:
  - Cover successful extraction, partial extraction, ambiguity handling, skip/resume, and scope drift rejection.
  - Ensure the AI never stores unconfirmed facts as final profile data.
  - Verify the user can continue even when CV parsing is incomplete.
- Verification/tests:
  - full e2e onboarding journey
  - integration coverage for state transitions and scope rules
- Done criteria:
  - Phase 2 can be validated as a complete onboarding slice.
- Risk controls and rollback:
  - Risk: e2e pass hides semantic issues.
  - Control: pair deterministic tests with a small human review set.
  - Rollback: keep the phase behind a route or feature flag until acceptance passes.

## Verification

Phase 2 is complete when users can upload a CV, receive relevant follow-up questions, skip and resume items, and confirm only the facts they want persisted, with no scope drift and no unconfirmed facts written as canonical profile data.

## Success Criteria
- [ ] CV upload seeds onboarding with extracted candidate details.
- [ ] The assistant asks role-relevant, job-search-only follow-up questions.
- [ ] Users can skip questions and resume later without losing state.
- [ ] Unconfirmed facts never become final profile data.
- [ ] Partial CV parsing still allows onboarding to continue.
- [ ] Onboarding surfaces are localized in EN/DE/FR.
- [ ] The full onboarding slice passes automated verification.