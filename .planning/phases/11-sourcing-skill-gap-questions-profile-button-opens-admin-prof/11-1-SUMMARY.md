---
phase: 11-sourcing-skill-gap-questions
plan: 1
subsystem: sourcing
tags: [prisma, migration, anthropic, llm, scoring, dal, unit-tests]
requires: []
provides:
  - SourcingSession/SourcingCandidate/SourcingQuestion/SourcingAnswer models
  - src/lib/sourcing/anthropic.ts (callAnthropic, parseLlmJson)
  - src/lib/sourcing/questions.ts (generateGapQuestions, stripPublicOptions)
  - src/lib/sourcing/rescore.ts (rescoreFromAnswers)
  - src/lib/sourcing/session-dal.ts (candidate-scoped CRUD + read-back)
affects:
  - prisma/schema.prisma
  - vitest.config.ts
tech-stack:
  added: []
  patterns:
    - "House Anthropic fetch pattern copied (not imported) from report.ts"
    - "InterviewSession -> InterviewQuestion Prisma shape mirrored"
    - "Server-only correctness data behind a single stripPublicOptions choke point"
key-files:
  created:
    - src/lib/sourcing/anthropic.ts
    - src/lib/sourcing/questions.ts
    - src/lib/sourcing/rescore.ts
    - src/lib/sourcing/session-dal.ts
    - src/lib/sourcing/questions.test.ts
    - src/lib/sourcing/rescore.test.ts
    - prisma/migrations/20260720103523_sourcing_sessions/migration.sql
  modified:
    - prisma/schema.prisma
    - vitest.config.ts
decisions:
  - "Extended vitest include with src/**/*.test.ts so plan-locked co-located tests are discovered (Rule 3 blocking-fix)."
  - "generateGapQuestions guarantees exactly one correct option by normalizing the LLM output (demote extra corrects, promote first when none flagged)."
metrics:
  duration: ~35m
  completed: 2026-07-20
status: complete
---

# Phase 11 Plan 1: Sourcing Foundation Summary

Additive persistence + pure-logic foundation for Phase 11: four new Prisma models
(`SourcingSession → SourcingCandidate → SourcingQuestion → SourcingAnswer`) with a
provably-additive migration, a shared house Anthropic call/JSON-salvage util, a grounded
gap-question generator with a server-only correctness choke point, the visible-increase
re-score clamp, a candidate-scoped DAL, and unit tests pinning the gap filter, the 5-option
strip, and the clamp. No route, UI, or existing-table change — the build stays green.

## What was built

### T1 — Prisma models + additive migration
- Appended four models to [prisma/schema.prisma](prisma/schema.prisma) mirroring the
  `InterviewSession → InterviewQuestion` conventions: cuid `@id`, camelCase fields,
  `Json @default("[]"/"{}")` arrays, `@db.Text` long text, `@default(now())`/`@updatedAt`
  timestamps, `onDelete: Cascade` on every child relation, plus `@@index`/`@@unique`.
- Server-only fields present: `SourcingQuestion.options` carry `isCorrect`/`isOpen`,
  `SourcingQuestion.gapLabel`, `SourcingAnswer.satisfiedNeed`, `needsSnapshot`, and
  `fitBefore`/`fitAfter`.
- Candidate/recruiter ids are plain `String` columns (like `CandidateSignalState`) — no
  relation added onto or modification of any existing model.
- Migration `20260720103523_sourcing_sessions` **applied to the local Postgres dev DB**
  (localhost:5432, database `jobcloud01`). The migration SQL is provably additive —
  only `CREATE TABLE` / `CREATE INDEX` and FKs on the four new tables; **no `ALTER`/`DROP`
  against any existing table**.
- `npx prisma validate` passes. The Prisma client TS types regenerated (the new models are
  present in `node_modules/.prisma/client/index.d.ts`), so downstream libs type-check.

### T2 — Shared Anthropic util + generator + clamp
- [src/lib/sourcing/anthropic.ts](src/lib/sourcing/anthropic.ts): `callAnthropic(prompt, maxTokens)`
  (server-only whitespace-stripped key, `thinking:{type:"disabled"}`, `anthropic-version:
  2023-06-01`, ~55s `AbortController` timeout, `cache:"no-store"`, returns `null` on missing
  key / non-ok / timeout / any throw — never throws) and `parseLlmJson<T>` (fence strip,
  `repairJsonStrings` CR/LF+inner-quote repair, single-element array unwrap, retry once).
  Copied in behavior from `report.ts` — **`report.ts` is untouched**.
- [src/lib/sourcing/questions.ts](src/lib/sourcing/questions.ts): `generateGapQuestions(needs, result)`
  derives gaps as `result.checklist.filter(c => c.status !== "met")`, returns `[]` when no
  gaps or the LLM is unavailable, builds a strict-JSON gap-grounded prompt (≤5 questions),
  then per question shuffles the four options, appends the fifth open "write your own answer"
  option (`isOpen:true, isCorrect:false`), sets `allowCustom:true`, and assigns `orderIndex`
  0..n (capped at 5). Exactly-one-correct is enforced defensively. `stripPublicOptions` is the
  single choke point that drops `gapLabel` and each option's `isCorrect`/`isOpen`.
- [src/lib/sourcing/rescore.ts](src/lib/sourcing/rescore.ts): `rescoreFromAnswers` implements the
  §3 clamp — `max(llmAfter, fitBefore + max(1, goodAnswers))` capped at 100, unchanged when
  `goodAnswers <= 0`.

### T3 — Candidate-scoped DAL + unit tests
- [src/lib/sourcing/session-dal.ts](src/lib/sourcing/session-dal.ts): `createSourcingRun`,
  `queueCandidateQuestions` (persists the FULL options incl. server flags),
  `findActiveCandidate` (newest `pending`/`delivering` set — the one-active-set guard),
  `getPendingCandidate` (newest non-completed set with ordered questions + answers),
  `recordAnswer` (upsert), `completeCandidate`, and `readBackForRecruiter` (per candidate the
  MOST RECENT `SourcingCandidate` by `createdAt` regardless of status; strips
  `isCorrect`/`isOpen`/`gapLabel`/`satisfiedNeed` — only prompt + chosen label / free text
  leave the server). Every candidate read/write is scoped by `candidateUserId`.
- [src/lib/sourcing/questions.test.ts](src/lib/sourcing/questions.test.ts) (5 tests): the
  unmet/partial gap filter (a `met` item is never grounded in the prompt), the 5-option shape
  (1 correct / 3 distractors / 1 open) with `stripPublicOptions` output carrying no
  `isCorrect`/`isOpen`/`gapLabel`, and graceful degradation (no key / non-ok / no gaps → `[]`).
- [src/lib/sourcing/rescore.test.ts](src/lib/sourcing/rescore.test.ts) (3 tests): the visible
  floor, the no-good-answer no-op, and the 100 cap with an above-floor LLM value preserved.

## Verification results

- `npx prisma validate` — PASS.
- `npx prisma migrate dev --name sourcing_sessions` — migration created **and applied** to the
  local Postgres dev DB.
- Migration additive check — only `CREATE TABLE`/`CREATE INDEX` + FKs on new tables; no
  `ALTER`/`DROP` on existing tables.
- `npx tsc --noEmit` — 0 errors in sourcing files (13 pre-existing baseline errors remain in
  unrelated `tests/` files — see Deferred).
- `npx vitest run src/lib/sourcing/questions.test.ts src/lib/sourcing/rescore.test.ts` —
  **8 passed**.
- `npm run build` — **exit 0** (green).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended vitest `include` glob to discover co-located src tests**
- **Found during:** T3
- **Issue:** `vitest.config.ts` `include` was `["tests/**/*.test.ts"]`. The plan locks the two
  unit-test files to `src/lib/sourcing/*.test.ts`; vitest CLI positional args are filters
  applied *within* `include`, so the new tests resolved to "No test files found".
- **Fix:** Added `"src/**/*.test.ts"` to `include` (additive; existing `tests/**` discovery
  unchanged).
- **Files modified:** vitest.config.ts
- **Commit:** 1565b08

## Environment notes

- **Prisma engine DLL (Windows dev lock):** `prisma migrate`/`generate` hit a benign
  `EPERM: operation not permitted, rename ... query_engine-windows.dll.node` because a running
  node/dev process holds the engine binary. The migration still applied and the **client TS
  types regenerated successfully** (new models present in `index.d.ts`), so type-check and the
  mocked unit tests are unaffected. The stale runtime engine binary only matters for live DB
  queries; a `npx prisma generate` with the dev server stopped will swap it. Documented per the
  plan's Windows DLL-lock guardrail.

## Deferred Issues (out of scope — pre-existing)

13 pre-existing `npx tsc --noEmit` errors live in unrelated `tests/` files (e.g.
`tests/integration/domain-guard.test.ts`, `onboarding-workflow.test.ts`,
`guidance-endpoint.test.ts`, `assistant-services.test.ts`, `tests/e2e/onboarding-cv.spec.ts`).
They predate Wave 1, are not caused by the additive sourcing changes (0 sourcing errors), and
do not affect `npm run build` (Next.js does not type-check unimported test files). Logged for a
later cleanup; not fixed here per the executor scope boundary.

## Handoff for later waves

- **Plan 2 (recruiter):** call `createSourcingRun` + `findActiveCandidate` (retire any existing
  non-completed set before queueing) + `queueCandidateQuestions` in the sourcing route;
  `generateGapQuestions(needs, result)` for each ≥60% candidate; `readBackForRecruiter` in the
  read-back endpoint.
- **Plan 3 (candidate):** `getPendingCandidate`/`stripPublicOptions` for one-at-a-time delivery,
  `recordAnswer` (silent `satisfiedNeed`), then `rescoreFromAnswers` + `completeCandidate`.
- **Reminder:** after Plan 3 wiring, run `npx prisma generate` with the dev server stopped so
  the runtime engine binary matches the new schema.

## Self-Check: PASSED

- Files created: all 6 source/test files + migration.sql confirmed on disk.
- Commits confirmed: 377d708 (T1), 5b90471 (T2), 1565b08 (T3).
