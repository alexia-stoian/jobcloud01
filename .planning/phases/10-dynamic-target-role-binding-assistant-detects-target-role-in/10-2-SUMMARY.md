# Phase 10 Plan 2: Route Rewire + Cleanup Summary

**One-liner:** Rewired the assistant route to use the LLM target-role detector at the single GLOBAL block (passing `inPractice` from interview practice mode), appended a localized EN/DE/FR acknowledgement at the final response, removed the two duplicate detect blocks (surgically preserving the CV-upload "what role are you targeting?" flow), deleted the dead regex detectors, and fixed the mock-interview role fallback — integration + unit tests green and `npm run build` at 0 errors.

---

## Frontmatter

- **phase:** 10-dynamic-target-role-binding
- **plan:** 2
- **wave:** 2
- **subsystem:** onboarding assistant / target-role detection
- **tags:** llm-detection, route-rewire, i18n, dead-code-removal, regression-safety
- **status:** complete
- **completed:** 2026-07-17

### Dependency graph
- **requires:** Plan 10-1 (`detectTargetRoleIntent`, `getTargetRoleAck`)
- **provides:** live LLM-driven target-role binding across the whole assistant conversation
- **affects:** interview, cover-letter, guidance generation (all read the freshly-updated active role)

### Key files
- **modified:**
  - `src/app/api/onboarding/assistant/route.ts` (GLOBAL block rewired to `await detectTargetRoleIntent`; two duplicate detect blocks removed; CV-upload role-question flow preserved as standalone `if` with its early return; localized ack prepended before the final return)
  - `src/lib/onboarding/detect-target-role.ts` (removed dead `detectTargetRoleFromMessage` + `extractTargetRoleFromHistory`; kept `getTargetRoleQuestion` + `getTargetRoleAck`)
  - `src/app/api/mock-interview/start/route.ts` (fallback fixed to `targetRole || profile.targetRoles || profile.primaryRole`)
  - `tests/integration/onboarding-target-role-detection.test.ts` (turned green; added the practice-mode `inPractice`-forwarding case)

### Requirements
- TRB-01, TRB-02, TRB-03, TRB-04, TRB-05, TRB-06

---

## Locked decisions honored
- **D-01** LLM intent detection replaces the regex — GLOBAL block now `await detectTargetRoleIntent(...)`.
- **D-02** Silent update + localized acknowledgement — `getTargetRoleAck(locale, role)` prepended once at the final `NextResponse.json({ answer })`.
- **D-03** Single active role (replace) — persists to both `onboardingSession.targetRole` and `profile.targetRoles`, then reloads the profile.
- **D-04** Explicit first-person intent only, interview-safe — `inPractice` derived from `state.services?.interviewPrep?.currentMode === "practice"` and forwarded to the detector.
- **D-05** Future-only re-optimization — no artifact regeneration; downstream reads use the reloaded role.

## Verification
- `tests/integration/onboarding-target-role-detection.test.ts`: 7/7 green (incl. the required practice-mode discrimination case).
- `tests/unit/detect-target-role-llm.test.ts`: 6/6 green.
- `npm run build`: 0 errors; all routes compiled; EN/DE/FR preserved.

## Deviations / deferred
- See `deferred-items.md`: `onboarding-assistant-cover-letter.test.ts` fails 7/7 as a **pre-existing** issue (verified failing at `HEAD~2`, before any Phase 10 commit) — its `dbMock` omits the `onboardingSession` model the route now loads. Out of scope for target-role binding; flagged for a dedicated fixture-modernization follow-up.
