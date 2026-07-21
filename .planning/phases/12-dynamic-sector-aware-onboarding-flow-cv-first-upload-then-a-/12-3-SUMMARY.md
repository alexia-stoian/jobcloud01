---
phase: 12-dynamic-sector-aware-onboarding-flow
plan: 3
subsystem: onboarding
tags: [onboarding, sector, mcq, chat, resume, i18n]
requires:
  - "CandidateProfile.sectorPreferences JSON store (12-1)"
  - "one-shot sector-generation trigger on target-role-set (12-2)"
provides:
  - "sector-questions delivery endpoint (GET/POST) under the distinct sector: prefix"
  - "confirm-policy sector: allowlist branch"
  - "resume payload surfaces sectorPreferences"
  - "OnboardingCvUploadForm sector-mode (MCQ + type-your-own)"
affects:
  - src/app/api/onboarding/sector-questions/route.ts
  - src/lib/onboarding/confirm-policy.ts
  - src/app/api/onboarding/resume/route.ts
  - src/components/onboarding/OnboardingCvUploadForm.tsx
tech-stack:
  added: []
  patterns:
    - "Clone the Phase 11 sourcing delivery pattern under a distinct sector: prefix + dedicated endpoint (no shared state)"
    - "Owner-scope every read/write to session.user.id; resolve field by key within the user's own sectorPreferences"
    - "Untrusted free-text clamp/trim/strip-control-chars before persist"
key-files:
  created:
    - src/app/api/onboarding/sector-questions/route.ts
    - tests/onboarding/sector-questions.test.ts
  modified:
    - src/lib/onboarding/confirm-policy.ts
    - src/app/api/onboarding/resume/route.ts
    - src/components/onboarding/OnboardingCvUploadForm.tsx
decisions:
  - "GET returns the bare field key as question.id; the form mints field = sector:+id (mirrors sourcing). POST accepts a sector:-prefixed id defensively."
  - "Sector answers persist into sectorPreferences.fields[key].value (chosen option value slug OR free text); no fixed profile column is ever written (D-03)."
  - "On sector done, continuation fetches the next interactive question and APPENDS it (never resume-replace) so sector Q&A stay visible; sector runs before Phase 11 sourcing (A3)."
metrics:
  duration: ~35m
  completed: 2026-07-20
status: complete
---

# Phase 12 Plan 3: Sector MCQ Delivery in Chat Summary

The <=3 persisted sector fields are delivered in the onboarding chat as one
`sector:`-prefixed multiple-choice question at a time (each with a type-your-own
box), cloned from the Phase 11 sourcing delivery pattern under a DISTINCT prefix +
dedicated endpoint so the two modes never collide. Answers persist into
`sectorPreferences.fields[key].value` and survive refresh via resume.

## What Was Built

- **Task 1 — Dedicated delivery endpoint + confirm-policy branch**
  ([src/app/api/onboarding/sector-questions/route.ts](src/app/api/onboarding/sector-questions/route.ts),
  [src/lib/onboarding/confirm-policy.ts](src/lib/onboarding/confirm-policy.ts)):
  `GET` serves the next sector field whose `value` is empty as an
  `InteractiveResponse`-shaped MCQ (`allowCustom: true`), plus the answered
  transcript (chosen-option label or free text), capped at 3 (D-04); returns
  `{ done: true }` when the store is empty (engineer/default `{}`) or every field
  is answered. `POST` accepts `{ questionId, chosenValue? | freeText? }` (XOR
  guard), resolves the field by key from `sectorPreferences.fields`, validates a
  chosen option against the field's options, clamps/trims/strips control chars from
  free text, and writes the resolved value into `sectorPreferences.fields[key].value`
  via `candidateProfile.update` (spread-preserving every other field + sector/locale
  metadata) — NEVER a fixed profile column. Every read/write is owner-scoped to
  `session.user.id` (401 without a session, 404 on an absent/foreign store).
  `confirm-policy.ts` gained a leading `if (field.startsWith("sector:")) return true;`
  branch before the fixed Set (Pitfall 3), distinct from `sourcing:`.

- **Task 2 — Resume surfaces sectorPreferences**
  ([src/app/api/onboarding/resume/route.ts](src/app/api/onboarding/resume/route.ts)):
  the profile `select` now includes `sectorPreferences`, and the resume payload
  returns it (defs + values) so the chat and the Profile > Preferences page can
  rehydrate. A still-unanswered sector question re-attaches chronologically
  client-side (via `checkSectorQuestions`, mirroring the sourcing resume fix);
  answered sector Q&A already live inline in `conversationHistory` and stay in
  place; the sourcing resume path is unaffected.

- **Task 3 — OnboardingCvUploadForm sector-mode wiring**
  ([src/components/onboarding/OnboardingCvUploadForm.tsx](src/components/onboarding/OnboardingCvUploadForm.tsx)):
  added `applySectorResponse` + `checkSectorQuestions` parallel to the sourcing
  helpers. `checkSectorQuestions` fetches `/api/onboarding/sector-questions`, mints
  a synthetic `field = "sector:"+question.id` so the EXISTING option UI + free-text
  box render (D-07), and re-attaches only a still-pending question chronologically.
  `submitAnswerValue` branches on `field.startsWith("sector:")` (parallel to
  `sourcing:`, never merged), POSTing option vs free-text; on `done` it appends the
  next interactive (universal) question rather than resume-replacing history. The
  sector check runs after the sourcing check (skipped if sourcing took over) and the
  normal init waits for both checks so a pending sector question takes priority.

## Verification

- `npm run build` → compiled successfully, 0 TypeScript errors (only pre-existing
  `react-hooks/exhaustive-deps` and unused-var warnings remain).
- `npx vitest run tests/onboarding/sector-questions.test.ts` → 17/17 passed.
- Cross-mode regression check: `tests/integration/sourcing-delivery.test.ts` → 8/8
  passed; `tests/onboarding/sector-fields.test.ts` (6/6) and
  `target-role-question.test.ts` (7/7) still green — 38/38 across the relevant
  suites.
- The ~22-25 pre-existing unrelated failures (assistant-route/cover-letter/
  domain-guard/onboarding-upload `findUnique`/`count`/`fetch failed`) were NOT
  touched and are out of scope per the plan.

## Deviations from Plan

**1. [Rule 3 — Blocking] questionId prefix contract disambiguated**
- **Found during:** Task 1.
- **Issue:** The plan's Task 1 GET spec (`id: "sector:"+key`) and Task 3
  description (form mints `field = "sector:"+question.id`) would double-prefix the
  minted field.
- **Fix:** GET returns the BARE field key as `question.id` (mirroring sourcing,
  where the form mints the prefix); `POST` strips an optional leading `sector:` from
  `questionId` defensively so both a bare key and a `sector:`-prefixed id resolve.
  A test covers the prefixed-id path.
- **Files modified:** src/app/api/onboarding/sector-questions/route.ts
- **Commit:** 8cc39a2

**2. [Rule 3 — Blocking] Sector-done continuation appends instead of resume-replace**
- **Found during:** Task 3.
- **Issue:** `loadInteractiveQuestion` resumes by REPLACING history with the
  server transcript, which could drop just-answered sector Q&A on the sector→universal
  hand-off (background history sync is fire-and-forget).
- **Fix:** On sector `done`, fetch the interactive GET directly and
  `applyInteractiveResponse` (which APPENDS the next question), preserving the
  visible sector Q&A.
- **Files modified:** src/components/onboarding/OnboardingCvUploadForm.tsx
- **Commit:** 4415313

## Known Stubs

None — no hardcoded empty values flow to the UI; sector copy is model-generated and
read from the persisted store.

## Threat Flags

None — no new network surface beyond the planned owner-scoped sector endpoint.

## Commits

- `8cc39a2` feat(12-3): dedicated sector-questions delivery endpoint + confirm-policy sector: branch
- `a786b4e` feat(12-3): resume surfaces sectorPreferences for chat + preferences rehydration
- `4415313` feat(12-3): OnboardingCvUploadForm sector-mode wiring parallel to sourcing

## Self-Check: PASSED

- FOUND: src/app/api/onboarding/sector-questions/route.ts
- FOUND: tests/onboarding/sector-questions.test.ts
- FOUND: src/lib/onboarding/confirm-policy.ts (sector: branch)
- FOUND: src/app/api/onboarding/resume/route.ts (sectorPreferences)
- FOUND: src/components/onboarding/OnboardingCvUploadForm.tsx (sector-mode)
- FOUND commits: 8cc39a2, a786b4e, 4415313
