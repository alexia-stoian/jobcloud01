# Plan 12-2 Summary — CV-first ordering, target-role question, sector trigger

**Status:** Complete
**Wave:** 2 · **Depends on:** 12-1

## What was delivered

- **Task 1 — CV-tailored vs open-ended target-role question** (`src/lib/onboarding/detect-target-role.ts`, `tests/onboarding/target-role-question.test.ts`): `generateTargetRoleQuestion({ locale, cvFacts })` — open-ended (no options) when CV facts are absent; CV-tailored localized MCQ (+ type-your-own) when present; null-safe fallback to the static open-ended question when the LLM returns null. Options localized + sanitized. `getTargetRoleAck` and the Phase 10 assistant path left untouched.
- **Task 2 — Universal-6 subset + engineer short-circuit** (`src/lib/onboarding/interactive.ts`): a `usesDefaultFields` decision selects either the unchanged full `POST_CV_PREFERENCE_FLOW` (engineer/default) or the universal-6 subset (current situation, work rate, contract type, work permit, salary expectation, preferred location) reusing existing question copy verbatim. No `InteractiveQuestion.field` union change; existing callers compile.
- **Task 3 — CV-first ordering + sector trigger** (`src/app/api/onboarding/interactive/route.ts`): `resolveInteractiveAsk` surfaces the target-role question first (CV-tailored vs open-ended), rendered on the `primaryRole` field so existing persistence + the `primaryRole`→`targetRoles` mirror handle the answer. `maybeGenerateSectorFields` fires exactly once on the Phase 10 dual-write target-role-set event — idempotent (skips when `sectorPreferences` already set for the same role+locale), owner-scoped writes, LLM-null/engineer → leaves `sectorPreferences` `{}`. Flow selection reads the persisted sector decision.

## Verification

- `npm run build` → 0 TypeScript errors.
- `npx vitest run tests/onboarding/target-role-question.test.ts` → 7/7 passed.
- Pre-existing unrelated suites (assistant-route `findUnique`/`fetch failed` mocks) fail identically on `main` — not touched by this plan.

## Commits

- `492b556` test(12-2): failing tests (RED)
- `c1f6b18` feat(12-2): CV-tailored vs open-ended target-role question generator
- `88a5acb` feat(12-2): universal-6 subset flow + engineer short-circuit
- `81…` feat(12-2): CV-first ordering + one-shot sector-generation trigger

## Deviations

- Executor stalled on verification (misread pre-existing assistant-route mock failures as blocking); Task 3 was verified (build + 12-2 tests green) and committed, and this summary written, to finish the plan cleanly. No code change to Task 3 beyond what the executor produced.

## Notes for downstream (12-3 / 12-4)

- `sectorPreferences` persisted shape: `{ sector, generatedLocale, generatedForRole, fields:[...] }`; empty `{}` = engineer/default or LLM-null.
- Prisma client is a dev singleton — restart `npm run dev` before runtime use of the new field.
