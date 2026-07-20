# Deferred Items — Phase 10

Out-of-scope discoveries found during execution. Not fixed here.

## Pre-existing: `onboarding-assistant-cover-letter.test.ts` fails (7/7)

- **Discovered during:** Plan 10-2, T3 (running the T3 regression gate).
- **Status:** Pre-existing — NOT caused by Plan 2. Verified by running the test against
  `HEAD~2` (before any Plan 2 commit) in a throwaway worktree: **7/7 failed with HTTP 502**
  there as well.
- **Root cause:** The test's `dbMock` only defines `candidateProfile` and omits the
  `onboardingSession` model. The assistant route loads the onboarding session separately
  (`src/app/api/onboarding/assistant/route.ts:121` — `db.onboardingSession.findUnique`),
  which throws `TypeError: Cannot read properties of undefined (reading 'findUnique')` →
  outer catch returns 502. This route behavior was introduced in commit `02661b4`
  ("Major progress: OnboardingSession now persists and queries correctly"), which predates
  Phase 10; the cover-letter test (last touched in `a396031`) was never updated to match.
- **Deeper issues (beyond the 502):** After locally adding the missing `onboardingSession`
  mock, the test still failed on cover-letter-handler behavior unrelated to target-role
  detection — the profile no longer reaches the services phase
  (`computeCompletion(...).isMinimallyComplete` is false with a null session, so the route
  returns the greeting), and the "switch role to Data Analyst" regeneration case does not
  apply the new role. These are cover-letter-handler / completion-gate concerns, independent
  of Plan 2's target-role work.
- **Why deferred:** Not in Plan 10-2 `files_modified`; the failures are pre-existing and
  in an unrelated subsystem. Fixing requires rebuilding the cover-letter test's fixtures
  (services-phase `assistantState`, `onboardingSession` model, completion-gate inputs) and
  is out of scope for target-role binding.
- **Suggested follow-up:** Dedicated task to modernize `onboarding-assistant-cover-letter.test.ts`
  fixtures against the current route (separate `onboardingSession` load + services-phase state),
  or move it to a phase that owns the cover-letter handler.

The Plan 2 target-role deliverable tests are green:
`tests/unit/detect-target-role-llm.test.ts` (6/6) and
`tests/integration/onboarding-target-role-detection.test.ts` (7/7, including the required
practice-mode `inPractice`-forwarding case).
