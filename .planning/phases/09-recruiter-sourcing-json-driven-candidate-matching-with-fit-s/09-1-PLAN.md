---
phase: 09-recruiter-sourcing
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/layout/AppShell.tsx
  - src/app/(app)/admin/sourcing/page.tsx
  - src/lib/sourcing/types.ts
  - src/lib/sourcing/recruiter-needs.ts
  - src/lib/sourcing/aggregate.ts
  - src/lib/sourcing/score.ts
  - src/lib/sourcing/report.ts
  - src/app/api/admin/sourcing/route.ts
  - src/components/admin/SourcingPage.tsx
  - src/app/globals.css
  - messages/en.json
  - messages/de.json
  - messages/fr.json
autonomous: true
requirements:
  - SOURCING-NAV-01
  - SOURCING-UPLOAD-02
  - SOURCING-MATCH-03
  - SOURCING-REPORT-04
  - SOURCING-GUARD-05

must_haves:
  truths:
    - "Admins see a 'Sourcing' link directly under 'Admin'; non-admins never see it and get a 404 at /admin/sourcing."
    - "The Sourcing page shows a compact box accepting a recruiter-needs .json file that can be replaced at any moment; results recompute on each upload."
    - "On submit, every user's full Admin profile (profile fields, qualifications parsed into skills/experience/education/languages, preferences, 11 signals) is aggregated and deterministically scored, and all users are ranked."
    - "The top 3 candidates render with a fit percentage (visual bar), a fact-grounded why-fit narrative, best-skills chips, a pros list, and a cons list."
    - "A deterministic fallback ranks and explains from facts when ANTHROPIC_API_KEY is absent; signals never reach any job-seeker surface; `npm run build` passes 0 errors; EN/DE/FR do not regress."
  artifacts:
    - src/app/(app)/admin/sourcing/page.tsx
    - src/lib/sourcing/recruiter-needs.ts
    - src/lib/sourcing/aggregate.ts
    - src/lib/sourcing/score.ts
    - src/lib/sourcing/report.ts
    - src/app/api/admin/sourcing/route.ts
    - src/components/admin/SourcingPage.tsx
  key_links:
    - "getAdminUserIdOrNull() → notFound() gates the page; requireAdmin() gates POST /api/admin/sourcing (both 404 for non-admins)."
    - "loadSignalStateWithMeta(userId) + buildProfileSummary() feed the aggregator; the aggregator feeds deterministic scoring; scoring feeds the LLM report (top N only)."
    - "isActive() resolves /admin vs /admin/sourcing with the more-specific route winning."
---

<objective>
Deliver the MVP Recruiter Sourcing surface: an admin-only `/admin/sourcing` page whose
compact upload box accepts a recruiter-needs JSON file, aggregates EVERY user's full
Admin profile (profile fields + parsed qualifications + preferences + the 11 invisible
signals), deterministically scores and ranks all candidates, sends only the top
candidates to Anthropic for a fact-grounded narrative report (with a deterministic
fallback when no API key), and renders the top 3 with a fit percentage, why-fit, best
skills, pros, and cons.

Purpose: Give recruiters a stateless, one-shot "who fits this role?" tool grounded only
in real profile facts, without exposing any signal data to job seekers.
Output: One sidebar link, one server-gated route + client page, four sourcing libs, one
admin-gated API route, scoped CSS, and EN/DE/FR strings. No schema change.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/09-recruiter-sourcing-json-driven-candidate-matching-with-fit-s/CONTEXT.md

# Reuse — do not rebuild
@src/lib/auth/admin.ts
@src/components/layout/AppShell.tsx
@src/components/layout/AppShellServer.tsx
@src/app/(app)/admin/page.tsx
@src/app/api/admin/users/route.ts
@src/app/api/admin/users/[userId]/route.ts
@src/lib/profile/summary-builder.ts
@src/lib/ai/signals/signal-definitions.ts
@src/lib/ai/signals/signal-dal.ts
@src/components/admin/AdminProfilePanel.tsx
@src/lib/cv/extract-phase1.ts
</context>

---

## 1. Scope

### In scope
- "Sourcing" sidebar link under "Admin" (admin-only, i18n EN/DE/FR) + `isActive()` fix so
  `/admin` and `/admin/sourcing` resolve correctly (more-specific route wins).
- `/admin/sourcing` server-gated route (`getAdminUserIdOrNull()` → `notFound()`,
  `dynamic = "force-dynamic"`, wrapped in `AppShellServer`).
- Client Sourcing page with a compact `.json` upload box (replaceable at any moment;
  results recompute on new upload).
- `requireAdmin()`-gated `POST /api/admin/sourcing` that aggregates every user's full
  Admin profile, deterministically scores + ranks all users, sends only the top N to the
  LLM for a fact-grounded report + refined %, and returns the top 3.
- Deterministic fallback (rank + fact-derived explanation) when `ANTHROPIC_API_KEY` is
  absent or the LLM call fails.
- Top-3 result cards (name, fit % bar, why-fit, best-skills chips, pros, cons) + scoped
  CSS reusing existing `.admin-*` tokens.
- EN/DE/FR strings for all new UI labels.

### Explicitly OUT of scope
- ❌ Persisting sourcing searches / history (stateless per upload).
- ❌ Editing candidate profiles from the sourcing page.
- ❌ Exporting / team-sharing of results.
- ❌ Real-time recompute while candidates change (one-shot per upload).
- ❌ Any Prisma schema change / migration (MVP is stateless).

### Guardrails (non-negotiable)
- Every sourcing endpoint is `requireAdmin()`-gated; the page uses
  `getAdminUserIdOrNull()` → `notFound()`. Non-admins get `404` (never `403`). Signals
  must NEVER appear on any job-seeker surface — they exist only inside the admin-gated
  POST response and the deterministic scorer.
- `userId` is `String` (cuid/TEXT) → `User.id`. No `@db.Uuid` anywhere.
- Reports are grounded ONLY in real profile facts. The LLM prompt forbids fabrication and
  must state when a fact is missing rather than invent one.
- Uploaded JSON is untrusted input: validate shape + size, cap string lengths, ignore
  unknown keys, never `eval`, and sanitize every value before embedding it in a prompt.
- `npm run build` passes 0 errors; EN/DE/FR not regressed. Windows dev locks the Prisma
  DLL — type-check with `npx tsc --noEmit` while the dev server is running.

---

## 2. Recruiter-needs JSON contract (parsed, best-effort)

Accepted keys (all optional; unknown keys ignored; missing keys simply don't score):

```
role, seniority, requiredSkills[], niceToHaveSkills[], minYearsExperience,
education[], languages[], location, workModel, contract, notes,
preferredSignals { <signalKey>: "high" | "low" }   // optional
```

`preferredSignals` keys must match the canonical 11 keys in
`src/lib/ai/signals/signal-definitions.ts` (`SIGNAL_REGISTRY`); any other key is dropped.
See Section 9 (Assumptions) for the CONTEXT "at least one signal" note.

---

## 3. Task Breakdown (wave-ordered, atomically committable)

### Wave 1 — Sourcing libraries (independent, no route wiring)

- **T1 — Recruiter-needs types + parser/sanitizer**
  - **Files**: `src/lib/sourcing/types.ts`, `src/lib/sourcing/recruiter-needs.ts`
  - **Action**: In `types.ts` define the shared types: `RecruiterNeeds` (Section 2 keys,
    all optional, `preferredSignals?: Record<string, "high" | "low">`),
    `CandidateBundle` (userId, name, profile fields, parsed
    `skills`/`experience`/`education`/`languages`, preferences, `signals: SignalRecord[]`),
    `ScoredCandidate` (bundle + `score` 0–100 + `breakdown` per component + matched/missing
    skill lists), and `CandidateReport` (`fitPercent`, `whyFit`, `bestSkills[]`, `pros[]`,
    `cons[]`, `grounded: boolean`). In `recruiter-needs.ts` export
    `parseRecruiterNeeds(raw: unknown): { needs: RecruiterNeeds } | { error: string }`:
    reject non-objects; reject a serialized payload larger than a fixed cap
    (e.g. 32 KB — measure `JSON.stringify(raw).length`); coerce arrays to `string[]`,
    trimming and dropping empties; clamp every string to a max length (e.g. 200 chars);
    clamp `minYearsExperience` to a sane `0–60`; keep only `preferredSignals` keys present
    in `SIGNAL_REGISTRY` (import the registry) with values `"high"|"low"`; drop all unknown
    keys. Do NOT `eval` or execute anything from the payload. Return a typed `error` string
    on invalid input.
  - **Verify**: `npx tsc --noEmit` passes; a unit-style REPL/`node -e` (or a scratch import)
    confirms `parseRecruiterNeeds({ requiredSkills: ["SQL", ""], preferredSignals: { bogus: "high" } })`
    strips the empty skill and the bogus signal key; oversized/`null`/array inputs return
    `{ error }`.
  - **Done**: Untrusted JSON is normalized to a bounded, typed `RecruiterNeeds`; malformed
    or oversized input is rejected without throwing.

- **T2 — Candidate aggregation across all users**
  - **Files**: `src/lib/sourcing/aggregate.ts`
  - **Action**: Export `async function aggregateCandidates(): Promise<CandidateBundle[]>`.
    Enumerate every user (mirror `src/app/api/admin/users/route.ts` — `db.user.findMany`),
    then for each load the profile via `db.candidateProfile.findUnique({ where: { userId },
    include: { qualifications: true, historyEvents: { orderBy: { createdAt: "desc" } } } })`,
    build the canonical summary with `buildProfileSummary()` from
    `src/lib/profile/summary-builder.ts`, and load signals with
    `loadSignalStateWithMeta(userId)` from `src/lib/ai/signals/signal-dal.ts`. Add a small
    server-side qualification parser that MIRRORS the approach in
    `src/components/admin/AdminProfilePanel.tsx` (`parseQualification`): treat
    `skill`/`language`/`tool` categories as plain tag strings; `JSON.parse` the
    `experience`/`education`/`degree`/`diploma`/`certification` blobs defensively (wrap in
    try/catch, fall back to the raw string). Derive `skills[]`, `languages[]`,
    `education[]`, and `experience[]` (with any `startDate`/`endDate`/`isCurrentRole` for a
    years estimate). Skip users with no profile gracefully (empty arrays, signals still
    seeded by the DAL). To bound cost on large user tables, aggregate with a small
    concurrency limit (e.g. batches) rather than one giant `Promise.all`.
  - **Verify**: `npx tsc --noEmit` passes; grep confirms `aggregate.ts` imports
    `buildProfileSummary`, `loadSignalStateWithMeta`, and reads `qualifications`.
  - **Done**: `aggregateCandidates()` returns one `CandidateBundle` per user with parsed
    skills/experience/education/languages, preferences, and 11 signals; no throw on
    profile-less users.

- **T3 — Deterministic scoring + ranking**
  - **Files**: `src/lib/sourcing/score.ts`
  - **Action**: Export `scoreCandidate(needs: RecruiterNeeds, bundle: CandidateBundle):
    ScoredCandidate` and `rankCandidates(needs, bundles): ScoredCandidate[]`. Compute a
    weighted 0–100 fit from independent components, each contributing only when the
    recruiter specified it (missing criteria don't penalize): required-skills overlap
    (case-insensitive set intersection, weighted higher than nice-to-have), nice-to-have
    overlap, experience (candidate estimated years vs `minYearsExperience`), education
    (keyword match against parsed education), languages (set overlap), and
    location/workModel/contract preference match against the profile fields
    (`preferredLocation`, `preferredWorkModel`, `contractPreference`). Signal alignment:
    for each `preferredSignals` entry, reward when the candidate's `inferredValue`/direction
    agrees, weighted by `confidence/100`; when `preferredSignals` is absent, apply only a
    small confidence-weighted bonus for high-confidence positive signals
    (e.g. `sustained_vs_fading_effort`, `true_vs_claimed_proficiency`) so signals still
    contribute without a stated preference. Record a `breakdown` and matched/missing skill
    lists on each result. `rankCandidates` sorts descending by score (stable tiebreak by
    name) and returns ALL candidates. Keep the scorer pure/deterministic (no I/O, no
    `Date.now()` in the math).
  - **Verify**: `npx tsc --noEmit` passes; a scratch check confirms a candidate matching
    all required skills outscores one matching none, and identical inputs produce identical
    scores across runs.
  - **Done**: Every candidate gets a stable 0–100 fit with an explainable breakdown; the
    full ranked list is returned.

### Wave 2 — Report + API (depend on Wave 1 libs)

- **T4 — LLM narrative report + deterministic fallback**
  - **Files**: `src/lib/sourcing/report.ts`
  - **Action**: Export `async function buildReports(needs: RecruiterNeeds, top:
    ScoredCandidate[]): Promise<Map<string, CandidateReport>>`. Reuse the Anthropic
    `fetch("https://api.anthropic.com/v1/messages")` pattern from
    `src/lib/cv/extract-phase1.ts` (`callAnthropic`) — read `ANTHROPIC_API_KEY` /
    `ANTHROPIC_MODEL` via `process.env` + `@/lib/env` `env`, set
    `anthropic-version: 2023-06-01`, `cache: "no-store"`, and an `AbortController` timeout.
    Build ONE prompt containing the recruiter needs and a compact, SANITIZED facts block
    per top candidate (only fields present in the bundle — parsed skills/experience/
    education/languages/preferences and signal `inferredValue`+`confidence`). Instruct the
    model to (a) ground every statement ONLY in the supplied facts, (b) explicitly say when
    a required fact is missing instead of inventing it, and (c) return STRICT JSON: an array
    of `{ userId, fitPercent, whyFit, bestSkills[], pros[], cons[] }`. Parse defensively
    (JSON-only, salvage on truncation like `src/lib/ai/signals/engine.ts`); on any failure
    or when `callAnthropic` returns `null` (no key), fall back to a deterministic report per
    candidate built from the `ScoredCandidate` breakdown: `bestSkills` = matched required +
    nice-to-have skills, `pros` = satisfied criteria, `cons` = missing/weak criteria,
    `whyFit` = a templated fact summary, `fitPercent` = the deterministic score,
    `grounded: false` marks the fallback path. Never place raw uploaded strings directly
    into the prompt without the T1 sanitization.
  - **Verify**: `npx tsc --noEmit` passes; with `ANTHROPIC_API_KEY` unset, `buildReports`
    returns a fallback `CandidateReport` for every top candidate (no throw, `grounded:false`).
  - **Done**: Top candidates get a fact-grounded report; the feature still ranks + explains
    from facts when the LLM is unavailable.

- **T5 — Admin-gated matching API route**
  - **Files**: `src/app/api/admin/sourcing/route.ts`
  - **Action**: `export async function POST(request: Request)`. FIRST line of work:
    `const gate = await requireAdmin(); if ("response" in gate) return gate.response;`
    (404 for non-admins, before any DB read — mirror
    `src/app/api/admin/users/route.ts`). Parse the JSON body, run
    `parseRecruiterNeeds(...)`; on `error` return `NextResponse.json({ error }, { status:
    400 })`. Then `aggregateCandidates()` → `rankCandidates(needs, bundles)` → take a
    bounded top N (e.g. 5) for the LLM → `buildReports(needs, topN)` → assemble the top 3
    results as `{ userId, name, fitPercent, whyFit, bestSkills, pros, cons }` (prefer the
    report's refined `fitPercent`, else the deterministic score). Return
    `{ results, usedLlm: boolean, candidateCount }`. Set the route to Node runtime and
    `export const dynamic = "force-dynamic"`. Do NOT expose raw signal objects in the
    response — only the derived report text.
  - **Verify**: `npm run build` passes; grep confirms the route imports `requireAdmin` and
    calls it before any `db.` access; a non-admin `POST /api/admin/sourcing` returns 404, a
    malformed body returns 400.
  - **Done**: One admin-gated endpoint ranks all users and returns the top 3 with
    percentage + report; signals never appear verbatim in the response.

### Wave 3 — Route, page, UI, styles, i18n (depend on Wave 1–2)

- **T6 — Sidebar link + server-gated route + isActive fix + label**
  - **Files**: `src/components/layout/AppShell.tsx`,
    `src/app/(app)/admin/sourcing/page.tsx`, `messages/en.json`, `messages/de.json`,
    `messages/fr.json`
  - **Action**: In `AppShell.tsx` extend `type NavItem`: add `"sourcing"` to `labelKey` and
    `"/admin/sourcing"` to the `href` union; in the `items` memo append the sourcing item
    directly AFTER the admin item when `isAdmin`
    (`{ labelKey: "sourcing", icon: "⌗", href: "/admin/sourcing" }`). Fix `isActive()` so
    the more-specific route wins: add a `/admin/sourcing` branch (`pathname.startsWith(
    "/admin/sourcing")`) BEFORE the `/admin` branch, and change the `/admin` branch to match
    only when NOT under `/admin/sourcing` (e.g. `pathname === "/admin" || (pathname.
    startsWith("/admin") && !pathname.startsWith("/admin/sourcing"))`). Create
    `src/app/(app)/admin/sourcing/page.tsx` mirroring `src/app/(app)/admin/page.tsx`:
    `export const dynamic = "force-dynamic"`; `const adminUserId = await
    getAdminUserIdOrNull(); if (!adminUserId) notFound();`; render `<AppShellServer>` wrapping
    `<main className="img3-stack"><SourcingPage /></main>`. Add the `app.sourcing` label to
    all three locale files next to `app.admin` (EN "Sourcing", DE "Sourcing", FR "Sourcing").
  - **Verify**: `npm run build` passes; an admin session shows "Sourcing" under "Admin" and
    it is the only active link on `/admin/sourcing` (Admin not co-active); a non-admin `GET
    /admin/sourcing` yields `notFound()` (404); `app.sourcing` resolves in EN/DE/FR with no
    missing-key warnings.
  - **Done**: Route is server-gated and reachable only by admins; nav link + active-state
    are correct; label localized.

- **T7 — Client Sourcing page: upload box + top-3 result cards + i18n strings**
  - **Files**: `src/components/admin/SourcingPage.tsx`, `messages/en.json`,
    `messages/de.json`, `messages/fr.json`
  - **Action**: `"use client"` component under an `admin.sourcing` i18n namespace. Render a
    compact upload box accepting a single `.json` file (`<input type="file" accept=".json,
    application/json">` inside a labeled dropzone). On selection, read the file
    (`file.text()`), `JSON.parse` in a try/catch (show a friendly parse error), and `POST`
    the parsed object to `/api/admin/sourcing`. Allow replacing the file at any moment — a
    new selection resets state and re-runs matching (results recompute). Show loading and
    error states. Render the top-3 results as cards, each with: candidate name, a fit-%
    visual bar (`fitPercent`), the why-fit narrative, best-skills chips, a pros list, and a
    cons list. Never render signal internals — only report text. Add all UI strings under a
    new `sourcing` object inside the existing `admin` namespace in EN/DE/FR (upload prompt,
    replace hint, run/analyzing, parse-error, no-results, fitLabel, whyFitHeading,
    bestSkillsHeading, prosHeading, consHeading, and a fallback-mode note for `usedLlm:false`).
  - **Verify**: `npm run build` passes; type-check clean; uploading a valid recruiter JSON
    renders up to 3 cards with a % bar + why-fit + skills + pros + cons; an invalid file
    shows the parse error without crashing; all new keys resolve in EN/DE/FR.
  - **Done**: Recruiters upload/replace a JSON and see the top-3 fact-grounded results;
    signals never surface in the UI.

- **T8 — Scoped CSS for the sourcing surface**
  - **Files**: `src/app/globals.css`
  - **Action**: Append a scoped block (e.g. `.sourcing { ... }`) reusing the existing
    `.admin` design tokens (`--admin-card`, `--admin-border`, `--admin-ink`, `--admin-muted`,
    `--admin-accent`, `--admin-accent-soft`, `--admin-ok`, etc. defined at the top of the
    Phase 8 admin block). Style the upload box, the results grid, each result card, the
    fit-% bar (width driven by an inline `--fit` custom property or `style={{ width }}`),
    the skills chips (reuse the `.admin-chip` visual language), and the pros/cons lists.
    Do not modify existing `.admin-*` rules — add new `.sourcing*` selectors only.
  - **Verify**: `npm run build` passes; grep confirms new `.sourcing` selectors exist and no
    existing `.admin-*` rule was changed.
  - **Done**: The sourcing page matches the admin design system with no regression to
    existing admin styling.

---

## 4. Dependency graph & waves

| Wave | Tasks | Depends on |
|------|-------|-----------|
| 1 | T1 (types/parser), T2 (aggregate), T3 (score) | — |
| 2 | T4 (report), T5 (API route) | T1–T3 |
| 3 | T6 (nav/route/i18n label), T7 (client page + strings), T8 (CSS) | T1–T5 |

T2 and T3 both consume T1's `types.ts`; T4/T5 consume T1–T3; T7 consumes T5's endpoint.
No two tasks in the same wave write the same file (T6 and T7 both touch `messages/*` — run
them sequentially within the wave to avoid a merge conflict, T6 adds `app.sourcing`, T7 adds
the `admin.sourcing` block).

---

## 5. Threat model

**Trust boundaries**

| Boundary | Description |
|----------|-------------|
| browser → `/admin/sourcing` page | Server component; must reject non-admins. |
| browser → `POST /api/admin/sourcing` | Untrusted JSON body crosses here. |
| server → Anthropic API | Sanitized facts leave the app; PII must be minimized. |

**STRIDE register**

| Threat ID | Category | Component | Severity | Disposition | Mitigation |
|-----------|----------|-----------|----------|-------------|-----------|
| T-09-01 | Elevation of Privilege | `/admin/sourcing` page + POST route | critical | mitigate | `getAdminUserIdOrNull()` → `notFound()` on the page; `requireAdmin()` as the first statement in POST (before any DB read); both return 404, never 403. |
| T-09-02 | Information Disclosure | 11 recruiter signals | high | mitigate | Signals are read only inside the admin-gated aggregator/scorer; the API response returns derived report text only, never raw signal objects; no signal reaches any job-seeker surface. |
| T-09-03 | Tampering / Injection | uploaded recruiter JSON | high | mitigate | `parseRecruiterNeeds` validates shape, caps payload size (32 KB) and string lengths, drops unknown keys, never `eval`s; sanitized values only are embedded in the LLM prompt (prompt-injection containment). |
| T-09-04 | Information Disclosure | facts sent to Anthropic (PII) | medium | mitigate | Only fields already present in the admin bundle are sent; prompt forbids fabrication and requires "fact missing" statements; no email/contact identifiers included beyond display name; `cache: "no-store"`. |
| T-09-05 | Denial of Service | aggregate-all-users on every upload | low | accept | Deterministic scorer runs in-process; LLM is called for only the top N (≤5); aggregation uses bounded concurrency. Acceptable for MVP scale (stateless, admin-only caller). |

---

## 6. Goal-Backward Verification

Goal (outcome): *Admins upload a recruiter-needs JSON and get the top-3 fact-grounded,
signal-aware candidate matches; job seekers see nothing.*

Truths that must hold, and where they are satisfied:

1. **Admins (and only admins) can reach Sourcing.** — T6 (`getAdminUserIdOrNull()` →
   `notFound()`, nav link gated by `isAdmin`) + T5 (`requireAdmin()` on POST). → **SC-1**
2. **A compact box accepts a replaceable recruiter JSON.** — T7 (file input, re-upload
   resets + re-runs). → **SC-2**
3. **All users' full Admin profiles + signals are compared and ranked.** — T2 (aggregate
   profile + qualifications + signals for every user) + T3 (deterministic ranking of all).
   → **SC-3**
4. **Each top-3 shows a fit % and a fact-grounded report (why-fit, best skills, pros,
   cons).** — T4 (LLM report + fallback) + T5 (returns top 3) + T7 (cards render % bar +
   sections). → **SC-4**
5. **Signals stay invisible; no regressions; build 0 errors; EN/DE/FR intact.** — T2/T5
   (signals never leave the admin-gated path), T8 (additive CSS), T6/T7 (additive i18n),
   build gate on every task. → **SC-5**

**Reachability**: `/admin/sourcing` is reachable via the new nav link and by URL (both
server-gated). The POST endpoint is reachable from `SourcingPage` on upload.
`aggregateCandidates()` is reachable from the endpoint; `rankCandidates` and `buildReports`
from there in sequence. Every must-have artifact has a concrete caller — no orphaned code.

**Non-regression checks**: only additive i18n keys (`app.sourcing`, `admin.sourcing.*`);
only additive `.sourcing*` CSS; no schema change; existing admin/users/signals routes
untouched; `npm run build` = 0 errors; `npx tsc --noEmit` clean while dev runs.

---

## 7. Verification (phase-level)

- `npx tsc --noEmit` passes (use while dev server holds the Prisma DLL on Windows).
- `npm run build` passes with 0 errors.
- Admin: sidebar shows "Sourcing" under "Admin"; `/admin/sourcing` renders; upload → top-3
  cards with % bar, why-fit, best skills, pros, cons.
- Non-admin: nav link absent; `GET /admin/sourcing` = 404; `POST /api/admin/sourcing` = 404.
- With `ANTHROPIC_API_KEY` unset: results still rank + explain (fallback, `usedLlm:false`).
- EN/DE/FR: all new keys resolve, no missing-key console warnings.

## 8. Deliverables
1. `src/lib/sourcing/types.ts` + `recruiter-needs.ts` — bounded, sanitized needs parser.
2. `src/lib/sourcing/aggregate.ts` — every-user profile + qualifications + signals bundle.
3. `src/lib/sourcing/score.ts` — deterministic fit scoring + ranking.
4. `src/lib/sourcing/report.ts` — LLM report (Anthropic) + deterministic fallback.
5. `src/app/api/admin/sourcing/route.ts` — `requireAdmin()`-gated POST returning top 3.
6. `src/app/(app)/admin/sourcing/page.tsx` — server-gated route.
7. `src/components/admin/SourcingPage.tsx` — upload box + top-3 result cards.
8. `src/components/layout/AppShell.tsx` — Sourcing nav item + `isActive()` fix.
9. `src/app/globals.css` — scoped `.sourcing*` styles.
10. `messages/{en,de,fr}.json` — `app.sourcing` + `admin.sourcing.*` strings.

---

## 9. Assumptions & open risks
- **CONTEXT "at least one signal" wording**: the sample JSON has no signal field, so this
  reads as a soft recommendation, not a hard requirement. Decision: support an OPTIONAL
  `preferredSignals` map and never hard-require it; unspecified signals contribute only a
  small confidence-weighted bonus. Flag for confirmation.
- **Years-of-experience estimate** is derived from parsed `experience` qualification
  dates; entries with missing dates contribute 0 years (documented as a known gap the
  report may surface as "missing").
- **Top-N to LLM = 5, results = 3** are fixed constants chosen to bound cost; adjustable
  without contract change.
- **Report language**: the LLM narrative may be produced in English for MVP even under a
  DE/FR UI (per CONTEXT); only the UI chrome is localized. Flag if full localization of the
  narrative is required.
- **No schema change**: MVP is stateless; if search history/persistence is later wanted, a
  new phase adds a table (out of scope here).

<output>
Create `.planning/phases/09-recruiter-sourcing-json-driven-candidate-matching-with-fit-s/09-1-SUMMARY.md` when done.
</output>
