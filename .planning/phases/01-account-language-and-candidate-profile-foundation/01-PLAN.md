# Phase 1 Plan: Account, Language, And Candidate Profile Foundation

## Phase Goal (MVP)
**As a** job seeker in Switzerland, **I want to** create an account, use the app in EN/DE/FR, and build/edit my candidate profile through chat, **so that** I have a durable, reusable profile foundation for later AI guidance.

## Scope Guardrails
- In scope only: AUTH-01..AUTH-04, LOCL-01..LOCL-03, PROF-01..PROF-12.
- Explicitly enforce discuss decisions:
  - Chat-only profile editing (D-18, D-19).
  - Soft warnings (non-blocking) for required profile fields (D-15).
  - Minimal completion gate: name, location, primary role, language, permit (D-14).
  - Full append-only profile history (D-21).
  - Work permit always required (D-12).
  - Salary expectation optional (D-11).
  - AI suggestions must be reviewed and explicitly confirmed before apply (D-20).
- Do not add CV ingestion, long-term memory coaching, or general-purpose assistant behavior in this phase.

## Delivery Strategy
- MVP vertical slices, but with a practical bootstrap since no app baseline is guaranteed.
- Stack fixed from research: Next.js (App Router) + TypeScript, PostgreSQL + Prisma, Auth.js, next-intl, Zod, Vitest/Playwright.

## Task Breakdown

### T1. Bootstrap runnable app foundation and CI checks
- Objective:
  - Create a runnable web app baseline and test/lint pipeline so Phase 1 slices can ship incrementally.
- Depends on:
  - None.
- File touchpoints (expected):
  - package.json
  - next.config.ts
  - tsconfig.json
  - .env.example
  - src/app/layout.tsx
  - src/app/page.tsx
  - src/lib/env.ts
  - prisma/schema.prisma
  - vitest.config.ts
  - playwright.config.ts
  - .github/workflows/ci.yml
- Implementation notes:
  - If no app exists, initialize Next.js App Router project in-place.
  - Add scripts for lint, unit test, e2e smoke.
  - Configure database env wiring and Prisma client generation.
  - Keep homepage minimal; no non-Phase-1 features.
- Verification/tests:
  - `npm run lint`
  - `npm run test`
  - `npm run build`
- Done criteria:
  - Repo can install, run, test, and build on a clean machine.
  - CI workflow runs lint/test/build without manual steps.
- Risk controls and rollback:
  - Risk: bad bootstrap choices create rework.
  - Control: use research-approved stack only.
  - Rollback: revert bootstrap commit; restore previous root files from git.

### T2. Implement Phase-1 data model and first migration
- Objective:
  - Create canonical schema for account-linked candidate profile, qualifications list, and full profile history.
- Depends on:
  - T1.
- File touchpoints (expected):
  - prisma/schema.prisma
  - prisma/migrations/*
  - src/lib/db.ts
  - src/lib/profile/types.ts
- Implementation notes:
  - Add/extend models: User, Session, Account, VerificationToken (Auth.js-compatible), CandidateProfile, ProfileQualification, ProfileHistoryEvent.
  - CandidateProfile fields must map exactly to PROF-01..10, including:
    - required: workPermitStatus
    - optional nullable: salaryExpectation
    - PROF-08 coverage must include editable skills, diplomas, certifications, and qualifications (stored as structured list records, not chat transcript only)
    - locale field persisted to profile/account
  - Include completion-state fields for minimal gate result.
  - History model is append-only and stores structured change set.
- Verification/tests:
  - `npx prisma validate`
  - `npx prisma migrate dev --name phase1_profile_foundation`
  - unit test for model-level constraints using test DB
- Done criteria:
  - Migration applies cleanly to empty DB.
  - Schema supports all Phase-1 profile fields, list qualifications, and immutable history events.
- Risk controls and rollback:
  - Risk: migration drift/data-loss later.
  - Control: additive schema, no destructive operations in initial migration.
  - Rollback: `prisma migrate reset` in dev; create explicit down migration note before production rollout.

### T3. Deliver auth vertical slice (signup, verify email, login, reset, persistent session)
- Objective:
  - Ship secure email/password auth with verification and password reset, with persisted sessions tied to user profile ownership.
- Depends on:
  - T2.
- File touchpoints (expected):
  - src/auth/config.ts
  - src/auth/password.ts
  - src/app/api/auth/[...nextauth]/route.ts
  - src/app/api/auth/signup/route.ts
  - src/app/api/auth/verify-email/route.ts
  - src/app/api/auth/request-password-reset/route.ts
  - src/app/api/auth/reset-password/route.ts
  - src/app/(public)/login/page.tsx
  - src/app/(public)/signup/page.tsx
  - src/app/(public)/forgot-password/page.tsx
  - src/lib/email/templates/*
  - src/lib/security/rate-limit.ts
  - src/lib/audit/auth-events.ts
- Implementation notes:
  - Enforce D-01..D-06.
  - Require email verification before normal app access.
  - Password reset token must be one-time, expiring, and invalidated on use.
  - Persist sessions via DB-backed Auth.js sessions (AUTH-03).
  - Ensure profile ownership checks always use authenticated userId (AUTH-04).
  - Localize auth UI strings for EN/DE/FR.
- Verification/tests:
  - unit/integration tests for signup, verify, login, reset flows
  - test for unverified account gating
  - test for session persistence across refresh
  - security tests for token reuse rejection and simple rate limit behavior
- Done criteria:
  - User can sign up, verify email, log in, reset password, and remain logged in across visits.
  - Protected profile endpoints reject cross-user access.
- Risk controls and rollback:
  - Risk: auth lockout due to verification bug.
  - Control: maintain admin/dev bypass only in non-production env.
  - Rollback: feature-flag verify gate, keep login route operable while fixing tokens.

### T4. Deliver multilingual framework and immediate language switching
- Objective:
  - Implement EN/DE/FR localization with always-visible switcher and persisted preference.
- Depends on:
  - T3.
- File touchpoints (expected):
  - src/i18n/config.ts
  - src/i18n/request.ts
  - messages/en.json
  - messages/de.json
  - messages/fr.json
  - src/components/header/LanguageSwitcher.tsx
  - src/app/api/me/locale/route.ts
  - src/middleware.ts
  - src/app/layout.tsx
- Implementation notes:
  - Enforce D-07..D-10.
  - Switcher always visible in header for authenticated app and public auth surfaces.
  - Language change updates UI immediately and persists to account/profile.
  - Canonical authenticated locale source is CandidateProfile.locale; any auth-layer locale mirror must stay synchronized.
  - Locale changes must not mutate or clear profile records.
- Verification/tests:
  - unit tests for locale resolution and fallback
  - integration test for persisted locale after re-login
  - e2e: switch language and verify auth/profile surface text updates immediately
- Done criteria:
  - User can select and later change EN/DE/FR at any time without profile data loss.
  - Locale switch reflects on landing/auth/profile surfaces within one navigation/render cycle (target: <1s local baseline).
- Risk controls and rollback:
  - Risk: mixed-language UI due to missing keys.
  - Control: fail CI on missing translation keys for required phase strings.
  - Rollback: temporary fallback to last known good locale while key gaps are fixed.

### T5. Build chat-only profile editing orchestration (intent -> preview -> confirm)
- Objective:
  - Provide chat as the only editing entrypoint for profile creation/updates, with explicit confirmation before apply.
- Depends on:
  - T3, T4.
- File touchpoints (expected):
  - src/app/(app)/profile/chat/page.tsx
  - src/components/chat/ProfileChatPanel.tsx
  - src/app/api/profile/chat/interpret/route.ts
  - src/app/api/profile/chat/confirm/route.ts
  - src/lib/profile/intent-schema.ts
  - src/lib/profile/intent-parser.ts
  - src/lib/profile/confirm-policy.ts
  - src/lib/ai/domain-guard.ts
- Implementation notes:
  - Enforce D-18, D-19, D-20.
  - Chat responses must remain job-profile scoped only (no general assistant drift).
  - Parse chat input into structured, schema-validated edit intents (field/op/value).
  - Ensure interpreted prompts, confirmations, and warnings are localized by selected locale (LOCL-02).
  - Show diff preview for AI or multi-field suggestions.
  - Require explicit confirmation for high-impact fields: permit, primary role, location, salary.
  - Do not provide form-based editing UI in Phase 1.
- Verification/tests:
  - unit tests for intent parsing and schema validation
  - unit tests for confirm-policy enforcement
  - integration test: unconfirmed suggestion does not persist
  - e2e: edit field through chat and confirm apply
- Done criteria:
  - Profile updates can only be applied through chat confirmation flow.
  - Unconfirmed suggestions never change persisted profile.
- Risk controls and rollback:
  - Risk: incorrect field mapping from ambiguous chat text.
  - Control: strict schema validation + rejection with clarification prompt.
  - Rollback: disable automatic parse endpoint and allow only explicit command format temporarily.

### T6. Implement profile mutation service with soft warnings, minimal gate, and full history
- Objective:
  - Persist profile edits safely while computing completion status and writing immutable history events transactionally.
- Depends on:
  - T2, T5.
- File touchpoints (expected):
  - src/lib/profile/service.ts
  - src/lib/profile/validation.ts
  - src/lib/profile/completion-gate.ts
  - src/lib/profile/history.ts
  - src/app/api/profile/patch/route.ts
  - src/app/api/profile/history/route.ts
  - src/app/api/profile/revert-last/route.ts
- Implementation notes:
  - Map all PROF fields (PROF-01..10) with decisions:
    - permit always required
    - salary optional
    - qualifications as add/remove editable list
    - primary role suggestions + free-text fallback
  - Use soft warnings for missing required fields; no hard-block save.
  - Compute minimal completion using exactly name/location/primary-role/language/permit.
  - Every accepted mutation writes ProfileHistoryEvent in same transaction.
  - Add revert-last-change endpoint for safe undo.
  - Enforce chat-only editing at API boundary: profile mutation route accepts writes only from confirmed chat flow context (and controlled system revert path), rejecting generic direct-edit callers.
- Verification/tests:
  - unit tests for validation and gate logic
  - integration tests for atomic profile+history write
  - integration test for revert-last-change
  - negative test: permit missing triggers warning but does not crash flow
- Done criteria:
  - Profile can be incrementally saved with soft warnings.
  - Completion state is accurate to D-14.
  - History is complete and append-only for every mutation.
- Risk controls and rollback:
  - Risk: partial writes leave profile/history inconsistent.
  - Control: single DB transaction per mutation.
  - Rollback: disable mutating endpoint and restore from latest valid profile snapshot if inconsistency detected.

### T7. Deliver structured profile summary and history visibility UI/API
- Objective:
  - Provide read surfaces for profile summary and change history while preserving chat-only editing.
- Depends on:
  - T6.
- File touchpoints (expected):
  - src/app/(app)/profile/summary/page.tsx
  - src/app/api/profile/summary/route.ts
  - src/components/profile/ProfileSummaryCard.tsx
  - src/components/profile/ProfileCompletionStatus.tsx
  - src/components/profile/ProfileHistoryTimeline.tsx
  - src/lib/profile/summary-builder.ts
- Implementation notes:
  - Enforce PROF-11 and PROF-12 read/edit journey:
    - summary is deterministic from canonical data
    - UI provides "Edit in chat" links, not direct form editing
  - Localize all summary labels and warning text.
  - Show completion status and missing critical fields as nudges.
  - Show full chronological change history (D-21).
- Verification/tests:
  - unit tests for summary builder output stability
  - integration test for summary API shape
  - e2e: user views summary, sees warnings, navigates to chat edit
- Done criteria:
  - User can review structured summary and full profile history.
  - User can edit saved details any time via chat entrypoint.
- Risk controls and rollback:
  - Risk: summary drift from source profile.
  - Control: single server-side summary builder used by both API and UI.
  - Rollback: hide derived widgets and return raw canonical sections until builder bug fixed.

### T8. Add observability and basic hardening for Phase-1 operations
- Objective:
  - Add minimum telemetry and safeguards for auth, locale, and profile mutation reliability.
- Depends on:
  - T3, T4, T6, T7.
- File touchpoints (expected):
  - src/lib/observability/logger.ts
  - src/lib/observability/metrics.ts
  - src/lib/security/csrf.ts
  - src/lib/security/input-sanitization.ts
  - src/lib/security/headers.ts
  - src/app/api/health/phase1/route.ts
  - docs/runbooks/phase1-rollback.md
- Implementation notes:
  - Add structured logs and key counters:
    - auth success/fail, verify/reset attempts
    - locale switch events
    - profile mutation accepted/rejected
    - history write failures
  - Harden API handlers: schema validation, CSRF strategy for state-changing routes, secure headers, request-size limits.
  - Add a Phase-1 health endpoint with dependency checks (db/session/translation bundles).
  - Document rollback playbook per critical flow.
- Verification/tests:
  - integration tests for guarded endpoints (invalid payload, missing auth)
  - smoke test for health endpoint
  - manual check in local logs for expected event emission during auth + profile update
- Done criteria:
  - Critical Phase-1 flows emit actionable logs/metrics.
  - Baseline hardening controls are active on mutation/auth endpoints.
  - Rollback runbook exists and is usable.
- Risk controls and rollback:
  - Risk: noisy logs or missing key signal.
  - Control: structured event taxonomy and bounded payload logging.
  - Rollback: reduce log volume via config flag; preserve security controls.

### T9. End-to-end acceptance pack for AUTH/LOCL/PROF scope
- Objective:
  - Prove all in-scope requirements and decisions through deterministic automated tests.
- Depends on:
  - T3 through T8.
- File touchpoints (expected):
  - tests/e2e/auth-profile-locale.spec.ts
  - tests/integration/profile-history.spec.ts
  - tests/integration/profile-completion-gate.spec.ts
  - tests/integration/locale-persistence.spec.ts
  - tests/integration/auth-security.spec.ts
  - docs/phase1/verification-checklist.md
- Implementation notes:
  - Build tests directly against AUTH/LOCL/PROF requirements only.
  - Include decision-specific assertions:
    - chat-only editing
    - soft warnings
    - required permit / optional salary
    - full history event trail
  - Add explicit negative tests: direct non-chat mutation attempt is rejected; language switch does not alter previously saved profile values.
  - Keep tests fast enough for CI phase gate.
- Verification/tests:
  - `npm run test`
  - `npm run test:e2e`
  - `npm run lint && npm run build`
- Done criteria:
  - Automated suite passes and demonstrates requirement coverage for Phase 1.
  - Verification checklist maps green tests to each scoped requirement ID.
- Risk controls and rollback:
  - Risk: flaky e2e blocks delivery.
  - Control: stable selectors, seeded fixtures, deterministic time controls.
  - Rollback: quarantine flaky test with issue reference; keep critical integration tests mandatory.

## Requirement Mapping (Task -> Requirement IDs)

| Task | Requirement IDs Covered |
|---|---|
| T1 | Enabler (no direct requirement ownership) |
| T2 | AUTH-04, PROF-01, PROF-02, PROF-03, PROF-04, PROF-05, PROF-06, PROF-07, PROF-08, PROF-09, PROF-10 |
| T3 | AUTH-01, AUTH-02, AUTH-03, AUTH-04 |
| T4 | LOCL-01, LOCL-02, LOCL-03 |
| T5 | PROF-12 (chat-only edit path and confirmation enforcement) |
| T6 | PROF-01, PROF-02, PROF-03, PROF-04, PROF-05, PROF-06, PROF-07, PROF-08, PROF-09, PROF-10, PROF-12 |
| T7 | PROF-11, PROF-12 |
| T8 | AUTH-01, AUTH-02, AUTH-03, AUTH-04, LOCL-03, PROF-11, PROF-12 (operational reliability/security support) |
| T9 | AUTH-01, AUTH-02, AUTH-03, AUTH-04, LOCL-01, LOCL-02, LOCL-03, PROF-01, PROF-02, PROF-03, PROF-04, PROF-05, PROF-06, PROF-07, PROF-08, PROF-09, PROF-10, PROF-11, PROF-12 |

## Decision Coverage Matrix

| Decision | Implemented In |
|---|---|
| D-11 salary optional | T2, T6, T9 |
| D-12 permit required | T2, T6, T9 |
| D-14 minimal completion gate | T6, T7, T9 |
| D-15 soft warnings | T6, T7, T9 |
| D-18 chat-only profile editing | T5, T7, T9 |
| D-19 editing anytime from profile settings | T5, T7, T9 |
| D-20 explicit confirmation before AI apply | T5, T9 |
| D-21 full profile history in Phase 1 | T2, T6, T7, T9 |

## Execution Order
1. Wave 1: T1 -> T2 -> T3 -> T4
2. Wave 2: T5 -> T6
3. Wave 3: T7
4. Wave 4: T8
5. Wave 5: T9 (final acceptance gate)

## Exit Criteria for Phase 1
- All AUTH-01..04, LOCL-01..03, PROF-01..12 pass automated tests.
- Profile editing is chat-only and confirmation-safe.
- Minimal completion gate and soft warnings behave exactly as specified.
- Full append-only profile history is visible and revert-last-change works.
- Locale switching is immediate, persisted, and non-destructive to profile data.

