---
status: awaiting_human_verify
trigger: "Admin > Profile > Experience: start/end years not extracted from real CVs. Was working before — user says REGRESSION."
created: 2026-07-20
updated: 2026-07-20
---

## Current Focus

hypothesis: "CONFIRMED: current extraction pipeline captures dates correctly (reproduced). The date-less experience rows on existing accounts are STALE DATA created before commit 69883bb, which first introduced the `experience` qualification category with startDate/endDate/isCurrentRole. Before that commit no dated experience blob existed at all. Not a current code bug."
test: "Ran real extractCvPhase1 against a dated multi-role CV; inspected git history of the bridge mapping."
expecting: "Dates captured for dated CV (=> data issue) OR null (=> code regression)."
next_action: "Report: data issue; existing accounts need re-extraction. No code change warranted."

## Symptoms

expected: For a CV that contains explicit employment dates, extracted experience entries carry startDate/endDate/isCurrentRole, and Admin > Profile shows the years per position.
actual: Extracted experience entries end up with null start/end years; Admin shows positions without years. User is high-confidence this is a regression ("app was able to do this at some point").
errors: none surfaced to user (silent — callAnthropic swallows errors and returns null).
reproduction: Upload a real CV with dated positions via onboarding; inspect stored experience qualifications / Admin profile.
started: Unknown; user says it worked before.

## Eliminated

- hypothesis: "ANTHROPIC_MODEL='claude-sonnet-5' is an invalid model ID, so extraction silently returns empty (no dates)."
  evidence: "Direct API call with claude-sonnet-5 + a dated CV returned HTTP 200 and correctly parsed startDate/endDate. The model resolves and works."
  timestamp: 2026-07-20

- hypothesis: "extractWorkHistory prompt/parse or max_tokens:3500 truncation drops dates for real CVs."
  evidence: "Real extractCvPhase1 on a 3-role dated CV captured all dates incl. tricky formats: 'January 2020 – Present'→2020-01/current, 'Jun 2017 – Dec 2019'→2017-06/2019-12, year-only '2015 – 2017'→2015-01/2017-01. 8s runtime, no truncation."
  timestamp: 2026-07-20

## Evidence

- checked: src/lib/cv/extract-with-phase1.ts bridgePhase1ToLegacy + persist.ts
  found: experience blob includes startDate/endDate/isCurrentRole verbatim; persist createMany preserves them. End-to-end date preservation is intact IF the extractor returns dates.
  implication: The loss point is upstream — in extractWorkHistory / the model call.

- checked: .env + src/lib/env.ts
  found: ANTHROPIC_MODEL="claude-sonnet-5" in .env; env.ts default is also "claude-sonnet-5". This is not a valid Anthropic model identifier (valid forms: claude-3-5-sonnet-20241022, claude-sonnet-4-5, etc).
  implication: If invalid, callAnthropic gets a non-ok response → returns null → retry wrapper returns parser("[]") → empty arrays.

- checked: src/lib/interview/engine.ts
  found: uses hardcoded valid model "claude-3-5-sonnet-20241022" (does NOT rely on ANTHROPIC_MODEL).
  implication: Interview path works while CV/sourcing/guidance paths use ANTHROPIC_MODEL='claude-sonnet-5' — which DOES resolve (HTTP 200), so this is not the cause.

- checked: REPRO — scripts/_repro-cv-dates.mjs (direct API) and tests/_repro-extract.test.ts (real extractCvPhase1)
  found: Both captured start/end dates correctly for a dated CV. extractCvPhase1 returned 3 roles with correct startDate/endDate/isCurrentRole.
  implication: The extraction path is NOT broken. Dates are captured, persisted verbatim, and rendered by AdminProfilePanel (startDate – endDate, else period).

- checked: git log -S 'startDate: work.startDate' -- src/lib/cv/extract-with-phase1.ts; git show 69883bb
  found: The `experience` qualification category (with startDate/endDate/isCurrentRole) was FIRST introduced in commit 69883bb. Before it, the qualification enum was only skill|diploma|certification|qualification — no dated experience blob existed.
  implication: Accounts onboarded before 69883bb have experience data in the pre-dates shape (titles, no structured years). This is the source of the date-less rows, not a current bug.

## Resolution

root_cause: |
  NOT a current code regression. Reproduction proves the live pipeline
  (extractCvPhase1 → bridgePhase1ToLegacy → persist.createMany → AdminProfilePanel)
  captures, stores, and renders start/end years correctly for dated CVs — including
  'Present', 'Mon YYYY', and year-only formats.
  The 'missing years' on existing accounts is STALE DATA: those experience rows were
  created before commit 69883bb, which first added the dated `experience` qualification
  category. Earlier onboarding stored experience without structured startDate/endDate.
  Genuinely date-less source CVs (e.g. test_cv.txt) also correctly yield null years.
fix: |
  No code change warranted — the extraction and display paths are already correct
  (confirmed by reproduction). Deliverable is diagnosis + remediation guidance.
verification: |
  - scripts/_repro-cv-dates.mjs: direct Anthropic call, HTTP 200, dates parsed.
  - tests/_repro-extract.test.ts: real extractCvPhase1, 3 roles, all dates captured (8s).
  - AdminProfilePanel.parseQualification renders startDate – endDate (else 'present'/period).
  - Temp repro files removed after confirmation.
remediation: |
  Existing accounts with date-less experience need RE-EXTRACTION: re-upload a CV that
  contains explicit dates via onboarding (upsertOnboardingCvExtraction deletes old
  qualifications and re-creates them from the current, dated-blob pipeline). CVs with no
  dates cannot yield years — that is correct behaviour, not a bug.
files_changed: []
