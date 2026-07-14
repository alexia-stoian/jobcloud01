---
phase: 02
slug: cv-aware-guided-onboarding
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-13
---

# Phase 02 - Validation Strategy

Per-phase Nyquist validation contract and execution results for Phase 02.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | vitest 2.1.9 |
| Config file | vitest.config.ts |
| Quick run command | npx vitest run tests/integration/onboarding-workflow.test.ts tests/integration/onboarding-state.test.ts tests/integration/onboarding-scope.test.ts tests/integration/onboarding-i18n.test.ts tests/integration/onboarding-interactive-flow.test.ts tests/integration/onboarding-nyquist-phase2.test.ts |
| Full suite command | npx vitest run |
| Estimated runtime | ~1 second for quick run on current machine |

---

## Sampling Rate

- After every task commit: run quick run command above
- After every plan wave: run full suite command
- Before /gsd-verify-work: full suite must be green
- Max feedback latency: 60 seconds

---

## Requirement Coverage Summary

| Requirement | Classification | Evidence |
|-------------|----------------|----------|
| CVIN-01 | COVERED | tests/integration/onboarding-upload-route.test.ts validates authenticated upload route behavior, payload validation, and account scoping |
| CVIN-02 | COVERED | tests/integration/onboarding-nyquist-phase2.test.ts (stores extracted CV details and uncertain facts) |
| CVIN-03 | COVERED | tests/integration/onboarding-nyquist-phase2.test.ts validates scalar profile seed fidelity and multi-category qualification persistence |
| CVIN-04 | COVERED | tests/integration/onboarding-scope.test.ts and tests/integration/onboarding-nyquist-phase2.test.ts (ambiguity drives follow-up) |
| CVIN-05 | COVERED | tests/integration/onboarding-nyquist-phase2.test.ts (continues onboarding with incomplete extraction) |
| AION-01 | COVERED | tests/integration/onboarding-nyquist-phase2.test.ts (target-role-driven question selection) |
| AION-02 | COVERED | tests/integration/onboarding-employer-style.test.ts validates screening-oriented follow-up selection from unresolved profile signals |
| AION-03 | COVERED | tests/integration/onboarding-skip-route.test.ts validates skip persistence and deduped state update contract |
| AION-04 | COVERED | tests/integration/onboarding-workflow.test.ts validates skipped questions remain resumable |
| AION-05 | COVERED | tests/integration/onboarding-confirm-route.test.ts validates confirm persistence contract and pending-question resolution behavior |
| AION-06 | COVERED | tests/integration/onboarding-scope.test.ts validates off-scope rejection/redirect |
| AION-07 | COVERED | tests/integration/onboarding-nyquist-phase2.test.ts validates follow-ups for certification, language, and work-condition constraints |
| AION-08 | COVERED | tests/integration/onboarding-nyquist-phase2.test.ts validates permit eligibility question when relevant |
| AION-09 | COVERED | tests/integration/onboarding-nyquist-phase2.test.ts validates unconfirmed CV assumptions are not persisted as canonical profile facts |

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-T2-01 | 02 | 1 | CVIN-01 | T-02-01 | Upload requires auth and valid payload | integration | npx vitest run tests/integration/onboarding-upload-route.test.ts | yes | COVERED |
| 02-T2-02 | 02 | 1 | CVIN-02 | T-02-02 | Extracted facts seed onboarding/profile data | integration | npx vitest run tests/integration/onboarding-nyquist-phase2.test.ts -t "stores extracted CV details and uncertain facts for onboarding session" | yes | COVERED |
| 02-T2-03 | 02 | 1 | CVIN-03 | T-02-03 | Detailed CV dimensions are stored with schema fidelity | integration | npx vitest run tests/integration/onboarding-nyquist-phase2.test.ts | yes | COVERED |
| 02-T3-01 | 02 | 1 | CVIN-04 | T-02-04 | Ambiguous fields produce clarification questions | integration | npx vitest run tests/integration/onboarding-scope.test.ts tests/integration/onboarding-nyquist-phase2.test.ts | yes | COVERED |
| 02-T2-04 | 02 | 1 | CVIN-05 | T-02-05 | Incomplete parsing still progresses onboarding | integration | npx vitest run tests/integration/onboarding-nyquist-phase2.test.ts -t "continues onboarding when CV parsing is incomplete" | yes | COVERED |
| 02-T3-02 | 02 | 1 | AION-01 | T-02-06 | Questions adapt to CV and target role | integration | npx vitest run tests/integration/onboarding-nyquist-phase2.test.ts -t "uses target role to ask role-specific confirmation question" | yes | COVERED |
| 02-T3-03 | 02 | 1 | AION-02 | T-02-07 | Follow-up questions improve profile completeness in employer style | integration | npx vitest run tests/integration/onboarding-employer-style.test.ts | yes | COVERED |
| 02-T4-01 | 02 | 1 | AION-03 | T-02-08 | Skip preserves flow continuity | integration | npx vitest run tests/integration/onboarding-skip-route.test.ts | yes | COVERED |
| 02-T4-02 | 02 | 1 | AION-04 | T-02-09 | Skipped questions are resumable later | integration | npx vitest run tests/integration/onboarding-workflow.test.ts -t "restores unresolved and skipped questions" | yes | COVERED |
| 02-T4-03 | 02 | 1 | AION-05 | T-02-10 | Only confirmed answers are persisted in structured profile data | integration | npx vitest run tests/integration/onboarding-confirm-route.test.ts | yes | COVERED |
| 02-T3-04 | 02 | 1 | AION-06 | T-02-11 | Off-topic prompts are redirected to onboarding scope | integration | npx vitest run tests/integration/onboarding-scope.test.ts -t "rejects off-scope prompts" | yes | COVERED |
| 02-T3-05 | 02 | 1 | AION-07 | T-02-12 | Role-specific constraints are asked when relevant | integration | npx vitest run tests/integration/onboarding-nyquist-phase2.test.ts | yes | COVERED |
| 02-T3-06 | 02 | 1 | AION-08 | T-02-13 | Eligibility questions (permits/certs) appear when needed | integration | npx vitest run tests/integration/onboarding-nyquist-phase2.test.ts -t "asks eligibility follow-up when work permit is unclear" | yes | COVERED |
| 02-T4-04 | 02 | 1 | AION-09 | T-02-14 | Unconfirmed CV assumptions never become canonical profile facts | integration | npx vitest run tests/integration/onboarding-nyquist-phase2.test.ts -t "does not persist unconfirmed CV assumptions as canonical profile facts" | yes | COVERED |

Status legend: COVERED, PARTIAL, MISSING, RED (BLOCKER)

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements.
- New Nyquist audit tests added in tests/integration/onboarding-nyquist-phase2.test.ts.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Execution Log

Commands executed during this audit:

1) npx vitest run tests/integration/onboarding-nyquist-phase2.test.ts
- Result: failed (5 passed, 1 failed)
- Failure: does not persist unconfirmed CV assumptions as canonical profile facts

2) npx vitest run tests/integration/onboarding-workflow.test.ts tests/integration/onboarding-state.test.ts tests/integration/onboarding-scope.test.ts tests/integration/onboarding-i18n.test.ts tests/integration/onboarding-interactive-flow.test.ts tests/integration/onboarding-nyquist-phase2.test.ts
- Result: failed (12 passed, 1 failed)
- Single failure remains the same AION-09 blocker

3) npx vitest run tests/integration/onboarding-nyquist-phase2.test.ts
- Result: passed (6 passed, 0 failed)
- Fix validated: AION-09 no longer persists unconfirmed CV assumptions into canonical profile fields

4) npx vitest run
- Result: passed (30 passed, 0 failed)
- Repository-wide regression check is green after AION-09 remediation

5) npx vitest run tests/integration/onboarding-upload-route.test.ts tests/integration/onboarding-confirm-route.test.ts tests/integration/onboarding-skip-route.test.ts tests/integration/onboarding-employer-style.test.ts tests/integration/onboarding-nyquist-phase2.test.ts
- Result: passed (21 passed, 0 failed)
- Gap-closure suite validated CVIN-01, CVIN-03, AION-02, AION-03, AION-05, and AION-07

6) npx vitest run
- Result: passed (45 passed, 0 failed)
- Full-suite regression remained green after route/graph hardening and new tests

### Debug Loop - Resolved Gap

| Gap ID | Iteration | Error Type | Action | Result |
|--------|-----------|------------|--------|--------|
| AION-09 | 1/3 | Assertion mismatch with requirement | Verified test expectation against requirement wording; no test correction needed | Escalate implementation bug in src/lib/onboarding/persist.ts |
| AION-09 | 2/3 | Partial mitigation (still persisting fullName) | Tightened uncertainty guard for canonical seeding | Still failing due stricter expectation |
| AION-09 | 3/3 | Contract alignment | Ensured canonical profile update payload remains empty when core identity facts are uncertain | Resolved |

---

## Validation Sign-Off

- [x] All tasks have automated verify references or explicit manual gap notes
- [x] Sampling continuity: no 3 consecutive tasks without an automated verify target
- [x] Wave 0 infra present (Vitest configured)
- [x] No watch-mode flags used in audit commands
- [x] Feedback latency < 60s for quick runs
- [x] nyquist_compliant: true set in frontmatter

Approval: approved 2026-07-13
