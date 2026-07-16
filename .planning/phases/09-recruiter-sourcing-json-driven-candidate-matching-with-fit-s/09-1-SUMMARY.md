---
phase: 09-recruiter-sourcing
plan: 1
subsystem: recruiter-sourcing
tags: [admin, sourcing, matching, llm, i18n]
requires:
  - src/lib/auth/admin.ts
  - src/lib/profile/summary-builder.ts
  - src/lib/ai/signals/signal-dal.ts
  - src/lib/ai/signals/signal-definitions.ts
provides:
  - src/lib/sourcing/types.ts
  - src/lib/sourcing/recruiter-needs.ts
  - src/lib/sourcing/aggregate.ts
  - src/lib/sourcing/score.ts
  - src/lib/sourcing/report.ts
  - src/app/api/admin/sourcing/route.ts
  - src/app/(app)/admin/sourcing/page.tsx
  - src/components/admin/SourcingPage.tsx
affects:
  - src/components/layout/AppShell.tsx
  - src/app/globals.css
  - messages/en.json
  - messages/de.json
  - messages/fr.json
tech-stack:
  added: []
  patterns:
    - "Reused requireAdmin()/getAdminUserIdOrNull() 404 gate"
    - "Reused Anthropic fetch pattern from extract-phase1 with deterministic fallback"
    - "Server-side qualification parsing mirrors AdminProfilePanel parseQualification"
key-files:
  created:
    - src/lib/sourcing/types.ts
    - src/lib/sourcing/recruiter-needs.ts
    - src/lib/sourcing/aggregate.ts
    - src/lib/sourcing/score.ts
    - src/lib/sourcing/report.ts
    - src/app/api/admin/sourcing/route.ts
    - src/app/(app)/admin/sourcing/page.tsx
    - src/components/admin/SourcingPage.tsx
  modified:
    - src/components/layout/AppShell.tsx
    - src/app/globals.css
    - messages/en.json
    - messages/de.json
    - messages/fr.json
decisions:
  - "preferredSignals is optional; unspecified signals contribute a small confidence-weighted bonus only."
  - "Top-N to LLM = 5, results = 3; deterministic score used when LLM unavailable."
  - "No Prisma schema change; sourcing is stateless per upload."
metrics:
  duration: single-session
  completed: 2026-07-16
status: complete
---

# Phase 9 Plan 1: Recruiter Sourcing Summary

Admin-only `/admin/sourcing` surface that ingests a sanitized recruiter-needs JSON,
aggregates every user's full Admin profile (fields + parsed qualifications +
preferences + 11 invisible signals), deterministically scores and ranks all
candidates, sends only the top 5 to Anthropic for a fact-grounded narrative (with a
deterministic fallback when `ANTHROPIC_API_KEY` is absent), and renders the top 3 with a
fit % bar, why-fit, best-skills chips, pros, and cons — all behind a 404 gate so signals
never reach any job-seeker surface.

## Tasks

- **T1** — `types.ts` (shared contract) + `recruiter-needs.ts` (32 KB payload cap, string
  clamp 200, array cap 50, years clamp 0–60, drops unknown/bogus signal keys, never eval).
- **T2** — `aggregate.ts`: `db.user.findMany` + per-user `candidateProfile` bundle via
  `buildProfileSummary()` + `loadSignalStateWithMeta()`; server-side qualification parser
  mirrors `AdminProfilePanel`; bounded concurrency (batches of 8); profile-less users
  return empty arrays + seeded signals.
- **T3** — `score.ts`: pure weighted 0–100 fit (required/nice skills, experience, education,
  languages, preferences, signals); missing criteria don't penalize; `rankCandidates`
  stable-sorts by score then name and returns all.
- **T4** — `report.ts`: Anthropic `fetch` (2023-06-01, `no-store`, AbortController) with
  sanitized facts-only prompt + strict-JSON parse (truncation salvage); deterministic
  fallback (`grounded:false`) built from the score breakdown.
- **T5** — `route.ts`: `requireAdmin()` is the first statement (404 before any DB read);
  `parseRecruiterNeeds` → 400 on invalid; ranks all → top 5 to LLM → returns top 3 +
  `{ usedLlm, candidateCount }`; Node runtime + `force-dynamic`; raw signals never returned.
- **T6** — `AppShell.tsx`: `sourcing` added to `NavItem` unions; item appended after admin
  when `isAdmin`; `isActive()` fixed so `/admin/sourcing` wins over `/admin`. Server-gated
  page created; `app.sourcing` label added to EN/DE/FR.
- **T7** — `SourcingPage.tsx`: `admin.sourcing` namespace; compact `.json` dropzone,
  replaceable at any moment (re-select resets + re-runs); loading/parse/request/no-result
  states; top-3 cards; `admin.sourcing.*` strings added to EN/DE/FR.
- **T8** — `globals.css`: additive `.sourcing*` block reusing `--admin-*` tokens; no
  existing `.admin-*` rule changed.

## Deviations from Plan

None — plan executed as written. The plan's Assumption §9 (optional `preferredSignals`)
was followed as specified.

## Verification

- `npx tsc --noEmit`: 0 errors in all sourcing/app source. (13 pre-existing errors remain in
  `tests/**` — unrelated to this phase, logged as out-of-scope.)
- `npm run build`: **Compiled successfully, 0 errors.** `/admin/sourcing` (3.19 kB) and
  `/api/admin/sourcing` routes emitted. Only pre-existing lint warnings in unrelated files.
- EN/DE/FR JSON all parse; `app.sourcing` + `admin.sourcing.*` present in all three.

## Known Stubs

None.

## Self-Check: PASSED

- All 8 created files exist; all 8 task commits present on `feature/recruiter-sourcing`.
