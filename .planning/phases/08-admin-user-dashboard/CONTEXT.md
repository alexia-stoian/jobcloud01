# Phase 8 Context: Admin User Dashboard (Recruiter-Facing)

Source brief: `prompts/admin-dashboard.txt`

## What we are building
An **admin/recruiter-only** dashboard that surfaces the whole user base and, per user, their full candidate profile plus the invisible recruiter signals computed in Phase 7 — all updating in real time. This is the recruiter-facing "reveal" surface for signals that job seekers must never see.

## Deliverables
1. **Left-nav "Admin" entry** directly under "Notifications" in the primary sidebar (`AppShell`), matching the existing nav link style and active state. Rendered only for admins; route protected server-side.
2. **Admin authorization** — a durable admin concept (User `role`/`isAdmin` Prisma field + seed), reconciled with the existing `SIGNALS_ADMIN_ENABLED` gate so the whole admin area shares one server-enforced rule. Non-admins get 403/404 and never see the link.
3. **Admin users list page** (`/admin` or `/admin/users`) listing every user with name/email, target role, completion status, and a per-row **"Profile"** button. Localized (EN/DE/FR).
4. **Right-side profile + signals panel** — opens on click, large panel on the RIGHT showing the selected user's complete profile (all saved fields, CV-derived facts, qualifications, onboarding answers, profile history/timeline) AND all 11 recruiter signals (confidence bars, inferred values, evidence, contradiction flags), reusing Phase 7 signal model + `RecruiterSignalsPanel` styling.
5. **Real-time updates** — when the selected candidate edits their profile or triggers signals in onboarding, the admin panel reflects it within a few seconds without manual refresh. Pick the simplest reliable mechanism for Next.js App Router (SSE / polling / WebSocket) and document it.

## Reuse existing infra
- Signals: `src/lib/ai/signals/*`, `src/app/api/admin/signals/route.ts`, `src/components/onboarding/RecruiterSignalsPanel.tsx`.
- Profile: `CandidateProfile`, `OnboardingSession`, `ProfileHistoryEvent`, `ProfileQualification`, existing profile summary/timeline components.
- Shell/nav: `src/components/layout/AppShell.tsx`. Auth: `src/auth/config.ts` / `auth()`. i18n: `messages/{en,de,fr}.json`, next-intl routing.
- Prisma/Postgres with the `userId String -> User.id` (cuid/TEXT) FK convention.

## Non-negotiable constraints
- Job seekers must NEVER see the admin nav, page, panel, or any signal data — enforce on the server for every admin route, not just by hiding UI.
- No regression to onboarding, CV extraction, cover letters, interview prep, coaching, signals inference, or artifact memory.
- Switzerland-first EN/DE/FR must not regress; localize new admin strings.
- `npm run build` passes with 0 errors. OWASP-safe access control. No secrets committed.

## Success criteria (what must be TRUE)
1. Admins see an "Admin" link under "Notifications"; non-admins do not and cannot reach `/admin` by URL.
2. The Admin page lists all users, each with a working "Profile" button.
3. Clicking "Profile" opens a large right-side panel with the user's complete profile and all 11 signals (confidence/evidence/contradictions).
4. The panel updates in real time (within a few seconds) when the candidate changes their profile or triggers signals.
5. Existing user-facing flows and signal invisibility are preserved; build passes.

## Out of scope (v1)
- Editing candidate profiles from the admin panel (read-only view).
- Bulk actions, exports, analytics, role-management UI (a single admin flag/seed suffices).
