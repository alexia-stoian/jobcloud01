---
phase: 11-sourcing-skill-gap-questions
plan: 2
subsystem: recruiter-sourcing
tags: [sourcing, questions, i18n, admin, read-back]
requires:
  - 11-1 (session-dal, generateGapQuestions, Prisma models)
provides:
  - sourcing run persistence + gap-question queueing (>=60 gate, one-active-set)
  - GET /api/admin/sourcing/session read-back endpoint (admin-gated, stripped)
  - Sourcing card Profile slide-over + Q&A/before->now section
  - EN/DE/FR recruiter + candidate-facing message keys
affects:
  - src/app/api/admin/sourcing/route.ts
  - src/app/api/admin/sourcing/session/route.ts
  - src/components/admin/SourcingPage.tsx
tech-stack:
  added: []
  patterns:
    - "Generation hook wrapped in try/catch so it never alters/fails the SourcingResponse"
    - "Partial vi.mock (importActual) to keep real readBackForRecruiter while spying writes"
key-files:
  created:
    - src/app/api/admin/sourcing/session/route.ts
    - tests/integration/sourcing-session-readback.test.ts
  modified:
    - src/app/api/admin/sourcing/route.ts
    - src/components/admin/SourcingPage.tsx
    - src/app/globals.css
    - messages/en.json
    - messages/de.json
    - messages/fr.json
decisions:
  - "Read-back route shapes the DAL output to { candidateUserId, fitBefore, fitAfter, answered, questions:[{prompt, answer}] } — answer = chosen label ?? free text ?? null."
  - "Q&A card section only renders when the candidate has answered (session.answered)."
metrics:
  duration: ~35m
  completed: 2026-07-20
status: complete
---

# Phase 11 Plan 2: Recruiter Surface (Generate + Queue, Read-back, Profile Slide-over) Summary

Wired the recruiter side of Phase 11: a sourcing run now mints a persisted `SourcingSession`
keyed to `gate.userId` and, for every shown candidate whose displayed `fitPercent >= 60`,
queues ≤5 grounded gap questions (`fitBefore = fitPercent`) after retiring any prior
non-completed set (one active set per candidate); an admin-gated read-back endpoint returns
before→now + Q&A with no correctness leakage; and each Sourcing card gains a Profile
slide-over (reusing `AdminProfilePanel`) plus a Q&A + "[before] -> [now]" section.

## Tasks

- **T1** — Generation hook in `sourcing/route.ts` (after `results.sort`, wrapped in try/catch,
  `>= 60` gate on displayed `fitPercent`, one-active-set guard via
  `findActiveCandidate`→`completeCandidate`) + new `sourcing/session/route.ts` (`requireAdmin`
  first, then `readBackForRecruiter`, shaped to the public §3 contract). Commit `aea62bb`.
- **T2** — `SourcingPage.tsx`: `profileUserId` state + per-card Profile button opening the
  `admin-scrim` + `AdminProfilePanel` slide-over (mirrors `AdminDashboard`); mount/results-effect
  fetch of `/api/admin/sourcing/session?userIds=…` merged into a `sessionByUser` map; Q&A +
  delta section per answered candidate. Scoped CSS in `globals.css`. Base-ranking
  `localStorage` restore left intact. Commit `933ff29`.
- **T3** — EN/DE/FR keys: recruiter (`profileButton`, `qaHeading`, `answerLabel`,
  `beforeAfterLabel`) under `admin.sourcing` + cheerful candidate-facing top-level `sourcing`
  section (`recruiterInterested`, `thankYou`, `questionProgress`) for Plan 3. Integration test
  proving read-back gating + zero leakage + the ≥60 trigger. Commit `c1b5d34`.

## Verification

- `npx tsc --noEmit`: 0 errors in all Plan 2 files (pre-existing failures remain only in
  unrelated test files — see Deferred Issues).
- `npx vitest run tests/integration/sourcing-session-readback.test.ts`: **5/5 passing**.
  - (a) admin read-back returns `fitBefore`/`fitAfter`/`questions[].answer`, and the JSON
    contains none of `isCorrect`/`isOpen`/`satisfiedNeed`/`needsSnapshot`/`gapLabel`.
  - (b) non-admin → 404 with `db.sourcingCandidate.findFirst` never called.
  - (c) 58% candidate NOT passed to `queueCandidateQuestions`.
  - (d) 60% and 62% each queued exactly once with `fitBefore === fitPercent`, questions ≤5.
  - (e) prior active set retired (`completeCandidate({ fitAfter: 55 })`) BEFORE the fresh
    queue for that candidate; only one live set results.
- `npm run build`: passes, 0 errors.
- Greps confirm: `createSourcingRun` keyed to `gate.userId`, `findActiveCandidate` before
  `queueCandidateQuestions`, `>= 60` gate; session route calls `requireAdmin` before
  `readBackForRecruiter`; `SourcingPage` imports `AdminProfilePanel`, renders `admin-scrim`,
  fetches `/api/admin/sourcing/session`.
- All three `messages/*.json` parse valid.

## Deviations from Plan

None — plan executed as written. The read-back route shapes the DAL's
`{prompt, chosenLabel, freeText}` into the plan's §3 `{prompt, answer}` + `answered` contract
(explicitly specified in §3), which is a specification detail rather than a deviation.

## Deferred Issues

Pre-existing `npx tsc --noEmit` failures exist in unrelated test files (`tests/e2e/onboarding-cv.spec.ts`,
`tests/integration/{assistant-services,domain-guard,guidance-endpoint,onboarding-workflow,profile-memory}.test.ts`).
These are outside this plan's scope (untouched files, unrelated APIs) and do not affect
`npm run build` (tests are excluded from the production build). Consistent with the 11-1
SUMMARY note ("tsc 0 sourcing errors").

## Notes for Wave 3 (Plan 3)

- Candidate-facing keys are already in all three locales under the top-level `sourcing`
  section: `recruiterInterested`, `thankYou`, `questionProgress`. Plan 3 consumes (does not
  edit) `messages/*.json`.
- Wave 1 delivery-side exports still unconsumed by production: `getPendingCandidate`,
  `recordAnswer` (and `stripPublicOptions` in questions.ts) — these are Plan 3's callers.
- The candidate delivery endpoint + re-score + `OnboardingCvUploadForm` remain OUT of scope
  here (Plan 3 owns them). `completeCandidate` currently only retires with no visible change;
  Plan 3 supplies the real re-scored `fitAfter` on genuine completion.

## Self-Check: PASSED

- src/app/api/admin/sourcing/session/route.ts — FOUND
- tests/integration/sourcing-session-readback.test.ts — FOUND
- Commits aea62bb, 933ff29, c1b5d34 — FOUND in git log
