---
status: resolved
trigger: "Sourcing report: estimatedYearsExperience=0 and experience entries lack startYear/endYear, contradicting 5-year skill tenures. Admin > Profile DOES show start/end year for the candidate."
created: 2026-07-20
updated: 2026-07-20
---

## Current Focus

reasoning_checkpoint:
  hypothesis: "The 0-years candidates have experience entries with NO captured dates (period:null) or current-role-only (isCurrentRole:true, no start). Reads already parse `period`, so entries WITH a year (real Alexia: '2026-03 - Present') correctly compute 1.5 yrs. The mismatch the user sees is Admin rendering a 'present' token / period string while Sourcing correctly yields 0 for genuinely date-less entries. Additionally, the editor save path stores ONLY free-text `period`, not structured startDate/endDate/isCurrentRole — a data-model inconsistency vs CV extraction."
  confirming_evidence:
    - "DB compute: Julien/Camille/Test Candidate/period-null Alexia dups = 0 yrs, reportYears ''–''; real Alexia with periods = 1.5 yrs, reportYears 2026–present."
    - "Test Candidate entry {isCurrentRole:true, no dates} → Admin renders 'present' (endDate ?? isCurrentRole?'present'), Sourcing yields startYear='' and 0 yrs."
    - "buildQualificationsFromDraft (route.ts) stores experience as {title,company,location,description,period} only; CV path stores structured startDate/endDate/isCurrentRole."
  falsification_test: "If a 0-years candidate's blob contained a parseable start year in period/startDate, aggregate would already be non-zero — it is not, confirming the data is date-less."
  fix_rationale: "Persist structured startDate/endDate/isCurrentRole in the save path (parsed from the editor period) so the data model is consistent and any year signal is retained in structured form; dedupe the period parser into a shared helper so Admin/editor/Sourcing agree. Cannot fabricate years for genuinely date-less entries — that is a data-capture gap, documented."
  blind_spots: "Cannot recover years for existing period:null rows; those require re-onboarding/CV re-extraction. Non-date free-text periods are guarded so they do not pollute structured startDate."
test: Implement shared parser + save-path preservation + tests.
next_action: Create src/lib/profile/experience-period.ts, wire into aggregate.ts and route.ts, add test.

## Symptoms

expected: When experience dates exist (structured startDate/endDate, isCurrentRole, or a period string), Sourcing `estimatedYearsExperience` and report startYear/endYear reflect them, consistent with Admin > Profile.
actual: estimatedYearsExperience=0; report says entries lack startYear/endYear; but Admin > Profile shows start/end year.
errors: none (logic bug)
reproduction: Run Sourcing report for a candidate whose experience was saved via the profile editor.
started: Unknown; data-shape dependent.

## Eliminated

## Evidence

- checked: `src/app/api/profile/summary/route.ts` buildQualificationsFromDraft
  found: experience saved as `{title,company,location,description,period}` ONLY. No startDate/endDate/isCurrentRole. `period` = normalizeString(row.period), null when empty.
  implication: Editor save path is lossy — structured dates never persisted from the editor.

- checked: `src/components/profile/ProfileSummaryCard.tsx` parseQualifications experience branch (~L235-245)
  found: When loading a CV-extracted entry, it converts startDate/endDate/isCurrentRole into a single free-text `period` via `formatDateRange`. `formatDateRange(null,null,true)` → "Present"; `formatDateRange(null,null,false)` → "".
  implication: Round-trip loss. A CV entry with only isCurrentRole=true becomes period="Present" (no year); an entry with no dates becomes period="" → saved as null.

- checked: `src/lib/cv/extract-with-phase1.ts` (~L98)
  found: CV extraction stores `{company,title,location,startDate,endDate,isCurrentRole,description,achievements}` — structured dates, no period.
  implication: Fresh CV data has dates; they survive UNTIL the user saves the profile editor.

- checked: `src/lib/sourcing/aggregate.ts` parseQualifications + estimateYears + parsePeriod
  found: Uses startDate first; else parsePeriod(period). parsePeriod("Present") → isCurrent=true but start=undefined → estimateYears not called → 0. parsePeriod(null) → skipped. estimateYears returns 0 when no start.
  implication: Any current-role entry with no explicit start year yields 0 years.

- checked: `src/lib/sourcing/report.ts` experienceYears
  found: Extracts 4-digit years from `startDate+endDate+period`; if none present → startYear/endYear "". isCurrentRole/"present" → endYear="present" but startYear still "".
  implication: period="Present" or null → startYear="" → report says "lack startYear/endYear".

- checked: `src/components/admin/AdminProfilePanel.tsx` parseQualification experience branch
  found: dates = [startDate, endDate ?? (isCurrentRole?"present":undefined)].join(" – "); sub uses `dates || period`. So Admin renders "present" for isCurrentRole entries, or the raw `period` string (which may contain years) — even when the aggregate parser can't extract a start year.
  implication: Admin can display a date token ("present" or a period with years) while Sourcing computes 0 — the reported mismatch.

## Resolution

root_cause: |
  TWO distinct causes, confirmed by computing the real aggregate/report logic over the DB:
  1. DATA (dominant): The 0-years candidates (Julien Moreau, Camille Dubois, Product Manager, Test
     Candidate, and the period:null Alexia duplicates) have experience blobs with NO captured dates
     — `period` is null and there are no startDate/endDate. estimatedYearsExperience=0 and
     report startYear/endYear="" is the CORRECT output for genuinely date-less data. The reads
     ALREADY parse `period`, so the real Alexia profile whose entries carry "2026-03 - Present"
     computes 1.5 yrs with startYear 2026 / endYear present — consistent with Admin. The
     "5-year tenures" come from SKILLS ("<skill> - 5 years"), unrelated to experience dates.
  2. CODE (display/model): AdminProfilePanel.parseQualification renders `endDate ?? (isCurrentRole?
     "present")` and falls back to the raw `period`, so Admin shows a "present"/period token even
     when no start year exists (e.g. Test Candidate {isCurrentRole:true}) — which the user reads as
     "a date is shown" while Sourcing legitimately reports 0 (no start = uncomputable tenure).
     Separately, the editor save path (buildQualificationsFromDraft) persisted experience with ONLY
     a free-text `period`, dropping the structured startDate/endDate/isCurrentRole that CV extraction
     produces — a data-model inconsistency (not an actual year loss, since formatDateRange embeds
     the year into `period` and the reads parse it).
fix: |
  - New shared pure parser src/lib/profile/experience-period.ts (parseExperiencePeriod +
    structuredDatesFromPeriod) — single source of truth for period → start/end/current-role.
  - aggregate.ts now imports the shared parser (removed the duplicated local parsePeriod); behavior
    identical, dedup only.
  - route.ts buildQualificationsFromDraft now persists structured startDate/endDate/isCurrentRole
    (derived from the period, year-guarded so free-text labels never pollute date fields) ALONGSIDE
    `period`, so editor-saved entries match CV-extracted shape and every consumer reads a consistent
    date signal.
  - Added tests/unit/experience-period.test.ts (9 cases).
  NOTE: existing period:null rows cannot be back-filled — those candidates must re-onboard / re-extract
  a CV that actually contains dates. The parsing is now maximally robust: any present year or
  current-role marker yields a consistent, non-zero-where-possible estimate.
verification: |
  - npm run build → 0 errors.
  - npx vitest run (sourcing suite + new unit test) → 28 passed.
  - Pre-fix DB compute reproduced: date-less candidates = 0; period-bearing Alexia = 1.5 yrs.
files_changed:
  - src/lib/profile/experience-period.ts (new)
  - src/lib/sourcing/aggregate.ts
  - src/app/api/profile/summary/route.ts
  - tests/unit/experience-period.test.ts (new)
