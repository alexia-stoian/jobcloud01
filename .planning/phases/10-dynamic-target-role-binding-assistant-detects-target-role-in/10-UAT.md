---
phase: 10-dynamic-target-role-binding
status: testing
created: 2026-07-17
current_test: 1
total_tests: 6
passed: 0
failed: 1
---

# Phase 10 — Dynamic Target-Role Binding — UAT

Conversational UAT. One test at a time. "Here's what should happen — does it?"

## Test scenarios

| # | Scenario | Expected | Result |
|---|----------|----------|--------|
| 1 | State a target role in the assistant chat ("I want to become a Product Manager") | Assistant acknowledges ("optimizing for Product Manager"); Profile > Preferences > Target Roles shows "Product Manager" | FAIL → fixed (see log) |
| 2 | Switch role mid-conversation ("Actually, I want to move into Data Engineering") | Target Roles updates to "Data Engineering"; acknowledgement reflects the new role | pending |
| 3 | Mention a role inside an interview practice answer (e.g. "...I worked as a project manager on...") | Target Roles does NOT change (no false switch) | pending |
| 4 | Non-intent message ("What jobs are trending in Zurich?") | No target-role change; normal answer | pending |
| 5 | Downstream re-optimization: after switching, request a cover letter / interview | New generation reflects the new target role | pending |
| 6 | Localized acknowledgement (DE/FR): switch role while the app locale is German/French | Acknowledgement appears in the active language | pending |

## Log
(results recorded here as we go)

### Test 1 — FAIL then fixed
- **Observed:** In the STRUCTURED onboarding quick-flow, the assistant asked "Which role should we optimize your profile for first?" with multiple-choice options. Selecting "Product Manager" did NOT update Profile > Preferences > Target Roles.
- **Root cause:** That question (`src/lib/onboarding/interactive.ts`) has `field: "primaryRole"`, so the answer wrote `primaryRole` (current role), not `targetRoles`. Phase 10's LLM detection only covers the FREE-FORM assistant chat, not this structured `/api/onboarding/interactive` path (the two-state-system split).
- **Fix:** `src/app/api/onboarding/interactive/route.ts` — when a structured answer sets `primaryRole`, mirror it into `targetRoles` if Target Roles is still empty. Kept `primaryRole` writing (required by the completion gate); only-when-empty avoids clobbering an explicitly-set `targetRoles`; scoped to this structured endpoint so CV-derived current roles are unaffected.
- **Status:** awaiting user re-test.
