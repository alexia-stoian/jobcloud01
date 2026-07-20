# Phase 11 Plan 3: Candidate Delivery + Re-score Summary

**One-liner:** Added the candidate-facing Sourcing-mode delivery — a dedicated `/api/onboarding/sourcing-questions` endpoint that serves the queued gap questions one at a time as 5-option MCQs (correctness never sent), judges answers silently, enforces the ≤5 cap, re-scores with the visible-increase clamp on completion, and exits — wired into the onboarding form ahead of the interactive init, with a cheerful "a recruiter is interested" notice and thank-you.

---

## Frontmatter
- **phase:** 11-sourcing-skill-gap-questions
- **plan:** 3
- **wave:** 3
- **subsystem:** onboarding assistant / sourcing delivery
- **status:** complete
- **completed:** 2026-07-20

### Requirements
- SGQ-03, SGQ-04, SGQ-05, SGQ-06

### Key files
- **created:** `src/app/api/onboarding/sourcing-questions/route.ts`, `tests/integration/sourcing-delivery.test.ts`
- **modified:** `src/components/onboarding/OnboardingCvUploadForm.tsx`

## What was built
- **Delivery endpoint** (`GET`/`POST /api/onboarding/sourcing-questions`): GET returns the next pending question one-at-a-time in the existing `InteractiveResponse` MCQ shape via `stripPublicOptions` (1 correct hidden among 3 distractors + 1 open; correctness NEVER sent), with a first-delivery "recruiter is interested" notice. POST distinguishes `{questionId, chosenValue}` (option) vs `{questionId, freeText}` (open) explicitly, records via `recordAnswer` (silent judge), advances, enforces ≤5. Owner-scoped (cross-user → 404). On the last question: `rescoreFromAnswers` (persists `fitAfter` with the visible-increase clamp), `completeCandidate`, returns the cheerful thank-you + "if the recruiter chooses you, you'll be contacted", and signals exit of sourcing mode. Separate from `/assistant`, so it bypasses Phase 10 target-role detection + interview practice routing.
- **Onboarding form**: on mount, checks pending sourcing questions BEFORE the interactive init effect (gated on a `sourcingChecked` flag that flips only after the async GET resolves). Renders the sourcing MCQs through the existing option-button UI using a synthetic stable `field = sourcing:<questionId>` on both `currentQuestion` and each history entry; option clicks vs the "write your own" input tag the submit source explicitly; the off-track nudge is bypassed in sourcing mode. Cheerful emoji tone; correctness never revealed; returns to normal onboarding after the thank-you.

## Locked decisions honored
- D2 delivery on next onboarding visit; D3 visible-increase re-score; D4 silent open judging; D5 answers persisted to the session; behavioral rules (notify-first, one-at-a-time, 5 options, no correctness feedback, ≤5 cap, thank-you + exit, cheerful tone).

## Verification
- `tests/integration/sourcing-delivery.test.ts`: 6/6 (trigger, one-at-a-time 5-option MCQ, correctness never revealed, ≤5 cap, owner-scoped 404, before→now visible increase, Phase 10 detector not invoked).
- All Phase 11 suites: 19/19 green. `npm run build`: 0 errors.

## Deviations
- Minor: locale param read via `new URL(request.url).searchParams` (committed follow-up).
- Pre-existing unrelated `tsc` errors in other `tests/` files remain (baseline, don't affect the build).
