---
phase: 12-dynamic-sector-aware-onboarding-flow
plan: 4
subsystem: profile
tags: [profile, preferences, sector, integration-test, i18n]
requires:
  - "CandidateProfile.sectorPreferences JSON store (12-1)"
  - "one-shot sector-generation trigger on target-role-set (12-2)"
  - "sector-questions delivery endpoint + chat sector-mode (12-3)"
provides:
  - "Dynamic sector-field block on Profile > Preferences (render + edit)"
  - "PATCH /api/profile/summary persists sector VALUES onto server-owned defs"
  - "Full-loop sector onboarding integration test (EN/DE/FR)"
affects:
  - src/app/api/profile/summary/route.ts
  - src/components/profile/ProfileSummaryCard.tsx
  - src/lib/profile/summary-builder.ts
  - tests/onboarding/sector-flow.integration.test.ts
  - tests/onboarding/_fixtures.ts
tech-stack:
  added: []
  patterns:
    - "Reuse existing debounced localStorage + PATCH autosave — no new autosave path"
    - "Client sends VALUES only; server maps them onto owned field defs by key (T-12-13)"
    - "Stateful in-memory Prisma mock for a genuine answer->persist->render round-trip"
    - "Shared non-test fixture module (_fixtures.ts) so cross-suite import never re-runs describe blocks"
key-files:
  created:
    - tests/onboarding/_fixtures.ts
    - tests/onboarding/sector-flow.integration.test.ts
  modified:
    - src/app/api/profile/summary/route.ts
    - src/components/profile/ProfileSummaryCard.tsx
    - src/lib/profile/summary-builder.ts
    - tests/onboarding/sector-fields.test.ts
decisions:
  - "Preferences renders the existing universal grid unchanged (D-06 on top), then appends the dynamic sector block ONLY when sectorPreferences has fields — engineer/{} shows no block (Pitfall 5)."
  - "Each sector field is a <select> seeded from options (label->slug, preserving chat-stored slug values) plus a free-text input for type-your-own; a stored free-text value is injected as an extra selected option."
  - "PATCH accepts sectorPreferences VALUES only; it maps them onto existing keys and can never add/rename fields or mutate defs (T-12-13). editorDraft is JSON-serialized to stay Prisma-Json-compatible."
metrics:
  duration: ~40m
  completed: 2026-07-20
status: complete
---

# Phase 12 Plan 4: Preferences Rendering + Full-Loop Test Summary

Closes the sector loop: the persisted `sectorPreferences` fields now render and
edit on Profile > Preferences (universal-6 on top, dynamic sector block beneath),
persist through the EXISTING debounced `PATCH /api/profile/summary` (values-only,
mapped onto server-owned defs), and a stateful full-loop integration test guards
the entire 6-step flow in EN/DE/FR against regression.

## What Was Built

- **Task 1 — PATCH persists sector values**
  ([src/app/api/profile/summary/route.ts](src/app/api/profile/summary/route.ts)):
  extended `ProfileDraftPayload` with an optional `sectorPreferences: { fields: [{ key, value }] }`
  (values only). A new `mergeSectorPreferenceValues` reads the user's current
  `sectorPreferences`, maps incoming values onto matching field keys inside the
  existing `$transaction`, spread-preserving `sector`/`generatedLocale` and every
  field def (label/question/options). The client can ONLY set `value` on keys the
  server already owns — it can never add, rename, or redefine fields (T-12-13).
  Each value is clamped/trimmed and stripped of control characters (V5). Owner-scoped
  to `session.user.id`; all existing preference-column writes and the completion
  recompute are untouched. `editorDraft` is now JSON-serialized so the draft (which
  carries `unknown`-typed sector values) stays Prisma-`Json`-compatible.

- **Task 2 — Dynamic sector block on Preferences**
  ([src/components/profile/ProfileSummaryCard.tsx](src/components/profile/ProfileSummaryCard.tsx),
  [src/lib/profile/summary-builder.ts](src/lib/profile/summary-builder.ts)):
  `buildProfileSummary` now surfaces `sectorPreferences` to the card. A memoized
  `readSectorFieldDefs` parses the ≤3 stored fields; the existing universal
  Preferences grid renders unchanged on top (D-06), then a dynamic grid renders
  each sector field as a `<select>` (options seeded `label`→`slug`, preserving the
  chat-stored slug values) plus a type-your-own free-text input. Labels come
  straight from the store (D-08) as plain strings — React auto-escapes, no
  `dangerouslySetInnerHTML` (T-12-14). Edits flow through the EXISTING debounced
  localStorage + `PATCH` autosave by adding `sectorPreferences.fields` (key+value)
  to the draft payload and hydrating them back from localStorage. When the store is
  empty/`{}` (engineer/default) NO sector block renders (Pitfall 5).

- **Task 3 — Full-loop integration test**
  ([tests/onboarding/sector-flow.integration.test.ts](tests/onboarding/sector-flow.integration.test.ts),
  [tests/onboarding/_fixtures.ts](tests/onboarding/_fixtures.ts)):
  12 tests drive the REAL route handlers (`sector-questions` GET/POST,
  `profile/summary` PATCH) and library functions (`generateTargetRoleQuestion`,
  `classifySectorAndGenerateFields`, `selectPostCvPreferenceFlow`) against a
  STATEFUL in-memory Prisma store so the answer→persist→render round-trip actually
  asserts (review concern D). Coverage: (1) universal-6 on top + engineer full-flow
  short-circuit; (2) CV branch (open-ended vs CV-tailored MCQ); (3) non-engineer
  trigger persists ≤3 defs; (4) engineer role keeps `{}`; (5) MCQ delivery persists
  option AND free-text; (6) resume re-attaches only the unanswered field; (7) PATCH
  updates a value AND cannot inject a new field (T-12-13); (8) EN/DE/FR locale
  matrix round-trips `generatedLocale` + localized labels; plus D-02 LLM-null
  degradation. Only `callAnthropic` is mocked; `parseLlmJson` stays real; no network.

## Review Concerns Folded In

- **B (fixture reuse):** `makeSectorFixture()` moved out of `sector-fields.test.ts`
  into the shared non-test module [tests/onboarding/_fixtures.ts](tests/onboarding/_fixtures.ts);
  both suites import it, so no `.test.ts` cross-import re-runs another suite's
  `describe` blocks. `sector-fields.test.ts` still passes 6/6.
- **D (stateful store):** the integration test uses a single mutable
  `Map`-backed Prisma mock whose `update` writes are readable by later `findUnique`
  reads — the round-trip assertions are real, not static per-route stubs.

## Verification

- `npm run build` → compiled successfully, 0 TypeScript errors (only pre-existing
  unused-var / exhaustive-deps warnings remain).
- `npx vitest run tests/onboarding/sector-flow.integration.test.ts` → 12/12 passed.
- Cross-file regression: `tests/onboarding/` + `tests/integration/sourcing-delivery.test.ts`
  → 50/50 passed (sector-fields 6, target-role-question 7, sector-questions 17,
  sourcing-delivery 8, full-loop 12).
- The ~22-25 pre-existing unrelated failures (assistant-route / cover-letter /
  domain-guard / onboarding-upload `findUnique`/`count`/`fetch failed`) were NOT
  touched and are out of scope per the plan.

## Deviations from Plan

**1. [Rule 3 — Blocking] editorDraft JSON typing**
- **Found during:** Task 1 build.
- **Issue:** Adding `sectorPreferences` (with `unknown`-typed values) to the draft
  broke `editorDraft: draft` against Prisma's `InputJsonValue` index signature.
- **Fix:** `editorDraft: JSON.parse(JSON.stringify(draft))` — serializes the draft
  to a plain JSON value (also strips `undefined`), no behavior change.
- **Files modified:** src/app/api/profile/summary/route.ts
- **Commit:** 11930c3

## Known Stubs

None — sector labels/options are model-generated and read from the persisted store;
no hardcoded empty values flow to the UI. Engineer/default correctly renders no block.

## Threat Flags

None — no new network surface. PATCH reuses the existing owner-scoped profile
endpoint; sector values are values-only and mapped onto server-owned defs.

## Commits

- `11930c3` feat(12-4): accept + persist sectorPreferences values in PATCH profile summary
- `1a1e591` feat(12-4): render + edit dynamic sector fields on Profile > Preferences
- `9fe9992` test(12-4): full-loop sector onboarding integration test (EN/DE/FR)

## Self-Check: PASSED

- FOUND: src/app/api/profile/summary/route.ts (mergeSectorPreferenceValues)
- FOUND: src/components/profile/ProfileSummaryCard.tsx (dynamic sector block)
- FOUND: src/lib/profile/summary-builder.ts (sectorPreferences surfaced)
- FOUND: tests/onboarding/_fixtures.ts
- FOUND: tests/onboarding/sector-flow.integration.test.ts
- FOUND commits: 11930c3, 1a1e591, 9fe9992
