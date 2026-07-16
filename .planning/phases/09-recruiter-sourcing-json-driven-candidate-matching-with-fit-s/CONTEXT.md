# Phase 9 — Recruiter Sourcing (JSON-driven candidate matching)

## Intent (from user)

Admins/recruiters get a new **Sourcing** page, reachable from a **"Sourcing"** link in
the left sidebar directly **under "Admin"**. The page shows a small box that accepts a
**JSON file** describing what a recruiter is looking for in a candidate for a role at
their company. The JSON can be **replaced with a different one at any moment**.

When a JSON is submitted, **every app user's full Admin profile** is compared against
the recruiter's needs and the **top 3 best-fit candidates** are surfaced. Each candidate
shows:
- a **fit percentage** (how well they match the recruiter's needs), and
- a **thorough, fact-grounded report**: why they are a good fit, the **best/most-relevant
  skills** they bring for the role, and clear **pros and cons** of hiring them.

"Admin profile" for matching means **everything**: skills, education, experience,
languages, preferences, AND the invisible recruiter **signals** (0–1, never shown to the
job seeker).

## Scope

**In scope**
- Admin-only `/admin/sourcing` route + server authz gate (identical pattern to `/admin`).
- "Sourcing" sidebar link under "Admin", admin-only (isAdmin), i18n EN/DE/FR.
- Upload box accepting a `.json` file; validates + parses recruiter needs; replaceable at
  any time (re-upload swaps the criteria; results recompute).
- Aggregation endpoint that assembles every user's full Admin profile bundle
  (profile fields, qualifications → skills/experience/education/languages, preferences,
  and 11 signals) for matching. Admin-gated.
- Matching + scoring: produce a fit percentage per user; select top 3.
- Per-candidate report: why-fit, best skills for the role, pros, cons — grounded in
  ACTUAL profile facts (no invented data).
- Preserve signal invisibility to job seekers; no regressions; `npm run build` 0 errors.

**Out of scope**
- Persisting sourcing searches / history (stateless per upload is fine for MVP).
- Editing candidate profiles from the sourcing page.
- Exporting/among-team sharing of results.
- Real-time recompute while candidates change (one-shot per JSON upload).

## Recruiter JSON shape (proposed contract)

Flexible, best-effort parse. Recommended fields (all optional except at least one signal):
```json
{
  "role": "Senior Data Analyst",
  "seniority": "senior",
  "requiredSkills": ["Python", "SQL", "Power BI"],
  "niceToHaveSkills": ["dbt", "Snowflake"],
  "minYearsExperience": 4,
  "education": ["BSc Computer Science or related"],
  "languages": ["English", "German"],
  "location": "Zurich",
  "workModel": "hybrid",
  "contract": "permanent",
  "notes": "Must be comfortable owning dashboards end-to-end."
}
```
Unknown keys are ignored; missing keys simply don't contribute to the score.

## Existing building blocks to REUSE (do not rebuild)

- **Authz:** `src/lib/auth/admin.ts` — `requireAdmin()` (returns `{ userId } | { response }`,
  404 for non-admins), `getAdminUserIdOrNull()` for server pages, `resolveIsAdmin()`.
- **Admin nav:** `src/components/layout/AppShell.tsx` appends
  `{ labelKey: "admin", icon: "◈", href: "/admin" }` when `isAdmin`. Add a `sourcing`
  item right after it. `AppShellServer.tsx` computes `isAdmin`. `isActive()` needs a
  `/admin/sourcing` branch (and `/admin` must not match `/admin/sourcing` as active-both;
  order the checks so the more specific route wins).
- **Admin page pattern:** `src/app/(app)/admin/page.tsx` — `getAdminUserIdOrNull()` →
  `notFound()`, wrapped in `AppShellServer`, `export const dynamic = "force-dynamic"`.
- **User list:** `src/app/api/admin/users/route.ts` — enumerates all users.
- **Per-user bundle:** `src/app/api/admin/users/[userId]/route.ts` — returns
  `{ user, profile, completion, qualifications, history, onboarding, signals[11], ... }`
  via `buildProfileSummary()` + `loadSignalStateWithMeta()`.
- **Profile summary:** `src/lib/profile/summary-builder.ts` — canonical profile field set.
- **Qualifications:** `ProfileQualification { category, value }`; categories include
  `skills`/skill tags, `experience`, `diploma|education|degree`, `certifications`,
  and languages live among qualifications/preferences. Parsing patterns already exist in
  `src/components/admin/AdminProfilePanel.tsx` (`parseQualification`, `groupQualifications`).
- **Signals (11):** `src/lib/ai/signals/signal-definitions.ts` keys: money_driven,
  stability_driven, personal_growth_driven, technical_growth_driven,
  job_hopper_vs_circumstantial, real_vs_stated_motivation, stress_behavior,
  true_vs_claimed_proficiency, independent_vs_supervised, sustained_vs_fading_effort,
  (+1 more). Each: `inferredValue`, `confidence 0-100`, evidence, contradictions.
  Loaded via `loadSignalStateWithMeta(userId)`.
- **LLM call pattern:** Anthropic via `fetch("https://api.anthropic.com/v1/messages")`
  using `ANTHROPIC_API_KEY` + `ANTHROPIC_MODEL` (see `src/lib/cv/extract-phase1.ts`
  `callAnthropic(prompt)` and `src/lib/ai/signals/engine.ts`). Reuse this pattern for the
  report; return strict JSON and parse defensively (salvage on truncation exists in
  `engine.ts`). Provide a deterministic fallback score if the API key is absent.

## Design decisions / constraints

- **Scoring approach:** deterministic pre-score (skills overlap, experience, education,
  language, location/preference match, signal alignment) to rank ALL users cheaply, then
  send only the **top candidates** to the LLM for the narrative report + refined %.
  This bounds cost (don't LLM every user) and keeps ranking explainable.
- **Fact-grounding:** the report MUST cite only facts present in the candidate's bundle.
  Prompt the model to avoid fabrication; if a fact is missing, say so.
- **Signals stay invisible to seekers:** all sourcing endpoints are `requireAdmin()`-gated;
  nothing is exposed on any job-seeker surface.
- **i18n:** new UI strings under an `admin` (or new `sourcing`) namespace in
  `messages/{en,de,fr}.json`. The generated report body may remain in the recruiter's
  language / English for MVP.
- **userId is String (cuid/TEXT)** → `User.id`. Never `@db.Uuid`.
- **Build discipline:** dev server locks Prisma DLL on Windows; use `npx tsc --noEmit`
  for type-checks while dev runs. No schema change is required for MVP (stateless search).

## Success criteria (from ROADMAP)

1. Admins see "Sourcing" under "Admin"; non-admins never see it and can't reach the route
   (server-enforced 404).
2. Sourcing page shows a compact box accepting a recruiter-needs JSON file; replaceable at
   any moment.
3. On submit, all users' full Admin profiles (skills, education, experience, languages,
   preferences, signals) are compared and the top 3 best-fit candidates are shown.
4. Each of the top 3 shows a fit % and a thorough, fact-grounded report (why-fit, best
   skills, pros, cons).
5. Signals remain invisible to seekers; no regressions; `npm run build` passes 0 errors;
   EN/DE/FR not regressed.
