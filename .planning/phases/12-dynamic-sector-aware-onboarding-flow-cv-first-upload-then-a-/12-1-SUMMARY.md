---
phase: 12-dynamic-sector-aware-onboarding-flow
plan: 1
subsystem: onboarding
tags: [prisma, anthropic, llm, i18n, sector-fields]
requires: []
provides:
  - "CandidateProfile.sectorPreferences JSON store"
  - "classifySectorAndGenerateFields() + SectorFieldSet contract"
affects:
  - prisma/schema.prisma
  - src/lib/onboarding/sector-fields.ts
  - tests/onboarding/sector-fields.test.ts
tech-stack:
  added: []
  patterns:
    - "Reuse house callAnthropic + parseLlmJson (no new Anthropic wrapper, no SDK)"
    - "Untrusted-input framing + server-side sanitize/slug of all model strings"
key-files:
  created:
    - src/lib/onboarding/sector-fields.ts
    - tests/onboarding/sector-fields.test.ts
    - prisma/migrations/20260720154305_add_sector_preferences/migration.sql
  modified:
    - prisma/schema.prisma
decisions:
  - "sectorPreferences defaults to {} (additive, no backfill) mirroring assistantState (D-03, A5)"
  - "Engineer short-circuit driven by model-signalled usesDefaultFields (D-01 open-ended)"
  - "generatedLocale is stamped from the requested locale; copy passed through, never machine-translated locally (D-08)"
metrics:
  duration: ~15m
  completed: 2026-07-20
status: complete
---

# Phase 12 Plan 1: Schema + LLM Sector Generator + Unit Tests Summary

Additive `sectorPreferences` JSON column plus a null-safe, locale-aware LLM sector
classifier that generates ≤3 cheerful localized preference fields (or short-circuits
for engineering/software roles), reusing the house Anthropic call — proven by six unit tests.

## What Was Built

- **Task 1 — Schema + migration:** Added `sectorPreferences Json @default("{}")` to
  `CandidateProfile` in [prisma/schema.prisma](prisma/schema.prisma), mirroring the
  existing `assistantState` style. Created and applied migration
  `20260720154305_add_sector_preferences` (single additive `ALTER TABLE ... ADD COLUMN`)
  and regenerated the Prisma client. No existing preference column was renamed, retyped, or removed.
- **Task 2 — Sector generator:** [src/lib/onboarding/sector-fields.ts](src/lib/onboarding/sector-fields.ts)
  exports `classifySectorAndGenerateFields()` and the shared `SectorFieldSet` type. It
  frames target role + optional CV context as untrusted data (prompt-injection guard),
  classifies the sector open-endedly (D-01), respects the engineer short-circuit via
  model-signalled `usesDefaultFields` (empty fields), localizes at generation (D-08),
  keeps cheerful/emoji tone in the prompt (D-09), caps at 3 fields (D-04) and ~5 options,
  slugs keys/values to `[a-z0-9_]`, strips control chars/backticks (V5), and returns
  `null` on any call/parse failure without throwing (D-02).
- **Task 3 — Unit tests:** [tests/onboarding/sector-fields.test.ts](tests/onboarding/sector-fields.test.ts)
  mocks `callAnthropic` (keeps `parseLlmJson` real to exercise fence tolerance) and covers
  all six required cases: localized teacher fixture, engineer short-circuit, `callAnthropic`
  null, junk JSON, 6→3 field clamp, and control-char/backtick sanitization. No network call is made.

## Migration

- **Name:** `20260720154305_add_sector_preferences`
- **SQL:** `ALTER TABLE "CandidateProfile" ADD COLUMN "sectorPreferences" JSONB NOT NULL DEFAULT '{}';`

## Verification

- `npx prisma validate` → schema valid; `git diff` shows only the additive column.
- `npx vitest run tests/onboarding/sector-fields.test.ts` → 6 passed / 6.
- `npm run build` → compiled with 0 TypeScript errors.

## Required Follow-up (Pitfall 1)

The Prisma client is a startup singleton cached on `globalThis` in dev
([src/lib/db.ts](src/lib/db.ts)). The client was regenerated during this plan, but a
running `npm run dev` would still hold a stale client — **restart `npm run dev`** before
the new `sectorPreferences` field is used at runtime. The dev server was stopped for this
plan (port 3000 free) so the migration ran without EPERM; it was not restarted here.

## Deviations from Plan

**1. [Rule 3 - Blocking] Test mock hoisting + env isolation**
- **Found during:** Task 3 (first GREEN run).
- **Issue:** The initial `vi.mock` factory used `vi.importActual` and referenced an
  outer `const`, which (a) failed hoisting and (b) loaded the real `@/lib/env`, tripping
  Zod validation of unrelated server vars (`DATABASE_URL`, `AUTH_SECRET`).
- **Fix:** Created the mock fn via `vi.hoisted` and added a `vi.mock("@/lib/env", ...)`
  stub (same pattern as the existing `detect-target-role-llm` test). `parseLlmJson` stays real.
- **Files modified:** tests/onboarding/sector-fields.test.ts
- **Commit:** 1497ee5

## TDD Gate Compliance

- RED: `c1a0f64` (`test(12-1)`) — failing test committed before implementation.
- GREEN: `1497ee5` (`feat(12-1)`) — implementation makes all six cases pass.

## Commits

- `007f6fa` feat(12-1): add additive sectorPreferences JSON column to CandidateProfile
- `c1a0f64` test(12-1): add failing tests for sector classification and field generator
- `1497ee5` feat(12-1): implement null-safe locale-aware sector field generator

## Self-Check: PASSED

- FOUND: prisma/migrations/20260720154305_add_sector_preferences/migration.sql
- FOUND: src/lib/onboarding/sector-fields.ts
- FOUND: tests/onboarding/sector-fields.test.ts
- FOUND commits: 007f6fa, c1a0f64, 1497ee5
