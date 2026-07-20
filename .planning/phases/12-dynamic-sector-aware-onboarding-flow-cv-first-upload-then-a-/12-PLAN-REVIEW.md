# Phase 12 Plan Review — Dynamic Sector-Aware Onboarding Flow

**Reviewer:** gsd-plan-checker (goal-backward pre-execution gate)
**Date:** 2026-07-20
**Plans reviewed:** 12-1, 12-2, 12-3, 12-4
**Inputs:** 12-CONTEXT.md (D-01..D-09), 12-RESEARCH.md, ROADMAP.md Phase 12; integration points spot-checked against live source.

---

## VERDICT: PASS-WITH-CONCERNS

The plan set, if executed, delivers the full 6-step flow and honors all nine locked decisions with credible regression guardrails. Every integration point the plans cite was verified to exist and match. **No BLOCKING issues.** Four NON-BLOCKING concerns are worth addressing during execution.

---

## Goal-Backward Coverage (6-step flow)

| Step | Requirement | Covered by | Status |
|------|-------------|-----------|--------|
| 1 | CV is the first ask | 12-2 Task 3(a) | Covered (see Concern C) |
| 2 | CV-tailored MCQ vs open-ended target role | 12-2 Task 1 (`generateTargetRoleQuestion`) | Covered |
| 3 | Sector customization on target-role-set; engineer unchanged | 12-2 Task 2 (universal-6 + engineer short-circuit) + Task 3(b) trigger | Covered |
| 4 | <=3 sector fields as MCQ + type-your-own | 12-3 (dedicated `sector:` endpoint + form wiring) | Covered |
| 5 | Universal-6 always present | 12-2 Task 2 (chat) + 12-4 Task 2 (Preferences) | Covered |
| 6 | Cheerful localized tone | D-08/D-09 threaded through every LLM prompt | Covered |

## Locked Decision Coverage (D-01..D-09)

| D | Decision | Plan(s) | Status |
|---|----------|---------|--------|
| D-01 | Open-ended LLM sector classification | 12-1 | Covered |
| D-02 | LLM always-available, null-safe degrade | 12-1, 12-2 Task 3(b) | Covered |
| D-03 | Additive `sectorPreferences` JSON store | 12-1 Task 1 | Covered |
| D-04 | Max 3 sector fields | 12-1 normalizer + 12-3 GET cap | Covered (double-enforced) |
| D-05 | Both chat + Profile Preferences | 12-3 + 12-4 | Covered |
| D-06 | Universal-6 set | 12-2 Task 2 + 12-4 Task 2 | Covered |
| D-07 | Fields ARE the MCQ follow-ups + type-your-own | 12-3 | Covered |
| D-08 | EN/DE/FR at generation time | 12-1 prompt + 12-4 locale matrix test | Covered |
| D-09 | Cheerful emoji tone | prompts in 12-1/12-2/12-3 | Covered |

Additive-only migration verified: `CandidateProfile` already carries the six universal columns (`currentJobSituation`, `workRate`, `contractPreference`, `workPermitStatus`, `salaryExpectation`, `preferredLocation`) and `assistantState Json @default("{}")` at line 121 — the exact style 12-1 mirrors. No existing column is renamed or retyped.

## Regression Guardrails

| Prior work | Guard | Credible? |
|-----------|-------|-----------|
| Phase 2 CVIN-*/AION-* (CV extraction, question engine) | Additive edits; CV extraction path untouched; engine signatures kept backward-compatible | Yes |
| Phase 5 preference copy | Universal-6 reuse existing `POST_CV_PREFERENCE_FLOW` prompts verbatim | Yes |
| Phase 10 target-role binding | Sector trigger hangs off the SAME dual-write event (`primaryRole`->`targetRoles` mirror confirmed at route.ts L178-185); `getTargetRoleAck` + assistant route untouched | Yes |
| Phase 11 sourcing mode | Distinct `sector:` prefix + dedicated endpoint; UI branches parallel to existing `sourcing:` branch (confirmed at L518); no shared state | Yes |
| Chat history / resume | 12-3 Task 2 mirrors the sourcing chronological-resume fix (re-attach only unanswered) | Yes |

## Sequencing / Waves

Linear 12-1 -> 12-2 -> 12-3 -> 12-4, one plan per wave, no same-wave file conflicts. Dependencies are real and load-bearing: 12-2 consumes `SectorFieldSet`/generator from 12-1; 12-3 consumes the persisted `sectorPreferences` written by 12-2; 12-4 consumes the `sector-questions` endpoint from 12-3. Verification commands are real (`npx prisma validate`, `npm run build`, `npx vitest run`), test glob `tests/**/*.test.ts` in vitest.config.ts matches the plans'' `tests/onboarding/*.test.ts` paths. Nyquist coverage is declared per plan and consolidated in the 12-4 full-loop capstone.

---

## Residual Risks (planner-flagged) — Assessment

1. **Engineer-classification boundary via `usesDefaultFields`** — NON-BLOCKING. D-01 explicitly delegates open-ended classification to the LLM; the short-circuit is unit-proven with a fixture. Boundary fuzziness (e.g. "IT support" vs "software engineer") is inherent to the locked design, not a plan defect.
2. **Prisma singleton restart after migration** — NON-BLOCKING. Documented in RESEARCH Pitfall 1 and surfaced in 12-1 Task 1 / SUMMARY. Operational note only.
3. **Integration-test Prisma-mock harness assumption** — NON-BLOCKING but real (see Concern D). The harness pattern (`vi.hoisted` dbMock + `vi.mock("@/lib/db")` + `_setup-env`) is confirmed to exist in `tests/integration/`. The 12-4 full-loop across four routes needs a *stateful* mock store, heavier than the existing per-route static mocks.
4. **Sector-vs-sourcing ordering** — NON-BLOCKING. Resolved: sector follow-ups run during onboarding completion, before post-onboarding sourcing; distinct prefixes + endpoints prevent interleaving.

None is a blocking gap.

---

## NON-BLOCKING Concerns (address during execution)

**A. Test directory convention deviation.** Existing tests live in `tests/unit/` and `tests/integration/`; all four plans write to `tests/onboarding/`. The vitest glob still matches so tests WILL run, but it breaks the established unit/integration split. Consider `tests/unit/` for 12-1/12-2 pure-function tests and `tests/integration/` for 12-3/12-4.

**B. `makeSectorFixture()` cross-file reuse is fragile.** 12-1 Task 3 defines the helper inside `sector-fields.test.ts`; 12-4 Task 3 says "reuse it from Plan 12-1." Importing a helper out of another `.test.ts` re-executes that file''s `describe` blocks. Put the fixture in a shared non-test module (e.g. `tests/onboarding/_fixtures.ts`) and export it. Trivial fix, but the plans as written imply an anti-pattern.

**C. "CV is the first ask" is under-specified against the existing pre-CV sequence.** The current engine starts pre-CV users on `employmentObjective` then `primaryRole` (per `onboarding-interactive-flow.test.ts`). 12-2 Task 3(a) says only "respect the existing `hasCvUpload`/`currentStep:"questioning"` gating" without concretely specifying HOW CV becomes the strict first ask without disturbing that pre-CV ordering. This is the softest spot in the set. The skip path (open-ended role) covers the no-CV case, so intent is sound — but the executor should pin down the exact ordering change and add an assertion so Step 1 is not left to interpretation.

**D. 12-4 full-loop "in-memory/mocked Prisma" is heavier than the existing harness.** The proven pattern mocks the DB per-route with static `vi.fn()` returns. A single test threading interactive -> sector-questions -> resume -> profile/summary needs writes to be readable back (stateful store). Achievable, but budget for building that stateful mock rather than a trivial clone; otherwise the capstone assertion (chat answer -> persisted -> rendered) cannot round-trip.

---

## Security

Each plan carries a scoped threat model. Verified good practice: all sector reads/writes owner-scoped to `session.user.id`; LLM output normalized/clamped/slugged/control-char-stripped before persist or render (V5); labels rendered as plain strings, no `dangerouslySetInnerHTML` (XSS); Anthropic key stays server-side via `callAnthropic` (confirmed server-only, null-on-failure); free-text answers clamped. Prompt-injection framing (CV/role as untrusted data) is called out in 12-1/12-2. No package installs — supply-chain surface is nil.

---

## Go / No-Go

**GO** — proceed to `/gsd-execute-phase 12`. No blocking rework required. Fold Concerns A-D in as you execute: prefer shared fixture module (B), pin the CV-first ordering with an explicit assertion (C), and budget for a stateful mock store in the 12-4 capstone (D). Concern A is cosmetic.
