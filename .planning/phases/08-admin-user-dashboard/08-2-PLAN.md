# Phase 8 Plan 2: Admin Users List Page + Profile/Signals API

**Phase Goal**: Give admins a page at `/admin` that lists every user (name/email, target role, completion status) with a per-row "Profile" button, backed by server-authorized admin APIs that return (a) the full user list and (b) one user's complete candidate profile plus all 11 recruiter signals.

**Requirements**: ADMIN-LIST-03, ADMIN-PROFILE-API-04

**Depends on**: Plan 1 (the `src/lib/auth/admin.ts` helper — `requireAdmin` for APIs, `getAdminUserIdOrNull` for the page — and the `User.role` field). Reuses Phase 7 `loadSignalStateWithMeta` and Phase 3 `buildProfileSummary`.

**Plan sequence**: Plan 2 of 3. Plan 3 consumes the `GET /api/admin/users/[userId]` endpoint built here for the right-side panel and its polling loop.

**Wave**: 2 (depends on Plan 1 / Wave 1).

---

## 1. Scope

### In scope
- `GET /api/admin/users` — server-authorized list of all users: `{ id, name, email, targetRole, isComplete }`.
- `GET /api/admin/users/[userId]` — server-authorized full profile bundle for one user: profile fields, qualifications, onboarding answers, profile history/timeline, and the 11 signals (`{ signals, inputCount, updatedAt }`).
- `/admin` App Router page (`src/app/(app)/admin/page.tsx`) — server-guarded (`notFound()` for non-admins), rendering a client list component with "Profile" buttons.
- A client `AdminUsersList` component (name/email, target role, completion badge, "Profile" button per row; a clean scrollable list; optional client-side name/email filter).
- i18n for the list page (`admin.*` namespace) in EN/DE/FR.

### Explicitly OUT of scope
- ❌ The right-side panel rendering + real-time polling (Plan 3 — but the `[userId]` API it uses is built here).
- ❌ Editing profiles (read-only).
- ❌ Bulk actions / exports / analytics.

### Guardrails (non-negotiable)
- Both API routes call `requireAdmin()` from `@/lib/auth/admin` FIRST and return its `404` response for non-admins/unauthenticated callers — before any DB read. No user data is served without passing the admin gate.
- The `/admin` page calls `getAdminUserIdOrNull()` and `notFound()` when null, so a job seeker hitting `/admin` by URL gets a 404 page, not a hidden-but-reachable surface.
- Signal data is served ONLY through these admin-gated endpoints. No signal names/values leak into any user-facing route or component.
- Reuse `userId String -> User.id` (cuid/TEXT). No `@db.Uuid`.
- EN/DE/FR must not regress; new `admin.*` keys added to all three.
- `npm run build` passes with 0 errors.

---

## 2. Admin APIs

### 2a. `GET /api/admin/users` — user list
New file `src/app/api/admin/users/route.ts`.

- `const gate = await requireAdmin(); if ("response" in gate) return gate.response;`
- Query all users with the minimal fields needed for the list, joining the profile:
  ```ts
  db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      profile: {
        select: {
          fullName: true,
          targetRoles: true,
          primaryRole: true,
          isMinimallyComplete: true
        }
      }
    }
  })
  ```
- Map to a stable DTO array: `{ id, name: profile?.fullName?.trim() || email.split("@")[0], email, targetRole: profile?.targetRoles ?? profile?.primaryRole ?? null, isComplete: profile?.isMinimallyComplete ?? false }`.
- Return `NextResponse.json({ users })`.

- **Expected**: Admin → `200` with an array covering every user; non-admin/unauthenticated → `404`; each row has `id`, `name`, `email`, `targetRole`, `isComplete`.

### 2b. `GET /api/admin/users/[userId]` — full profile bundle
New file `src/app/api/admin/users/[userId]/route.ts` (App Router dynamic segment; the handler signature receives `{ params }` where `params` is a `Promise` in Next 15 — `const { userId } = await params;`).

- `const gate = await requireAdmin(); if ("response" in gate) return gate.response;`
- Load the profile with relations (mirrors the profile summary page query):
  ```ts
  db.candidateProfile.findUnique({
    where: { userId },
    include: {
      qualifications: true,
      historyEvents: { orderBy: { createdAt: "desc" } }
    }
  })
  ```
- Load the onboarding session for CV facts + onboarding answers:
  ```ts
  db.onboardingSession.findUnique({
    where: { userId },
    select: {
      targetRole: true,
      currentStep: true,
      cvFileName: true,
      cvExtractedFacts: true,
      conversationHistory: true,
      lastInteractedAt: true
    }
  })
  ```
- Load signals via the Phase 7 DAL: `const { signals, inputCount, updatedAt } = await loadSignalStateWithMeta(userId);` (from `@/lib/ai/signals/signal-dal`).
- Build the profile view via `buildProfileSummary({ profile, qualifications: profile.qualifications, history: profile.historyEvents })` (from `@/lib/profile/summary-builder`) when a profile exists.
- Also fetch the user's `email` (`db.user.findUnique({ where: { id: userId }, select: { email: true } })`) for the header when no `fullName`.
- Return:
  ```ts
  NextResponse.json({
    user: { id: userId, email, name },
    profile: summary?.profile ?? null,
    completion: summary?.completion ?? null,
    qualifications: summary?.qualifications ?? [],
    history: summary?.history ?? [],
    onboarding: {
      targetRole, currentStep, cvFileName,
      cvExtractedFacts, conversationHistory, lastInteractedAt
    } | null,
    signals, inputCount, updatedAt
  })
  ```
- If the user id does not exist at all → `404` with `{ error: "not_found" }` (after the admin gate has already passed).

- **Expected**: Admin → `200` bundle with `profile`, `qualifications`, `history`, `onboarding`, and 11 `signals`; non-admin → `404`; a valid userId with no profile still returns `200` with `profile: null` and seeded (11) signals.

> Note: `loadSignalStateWithMeta` already returns seeded 11-signal defaults when no row exists (Phase 7 DAL), so the panel always gets 11 entries.

---

## 3. Admin Users List Page

### 3a. Server page — `src/app/(app)/admin/page.tsx`
- `export const dynamic = "force-dynamic";`
- `const adminUserId = await getAdminUserIdOrNull(); if (!adminUserId) notFound();` (import `notFound` from `next/navigation`, helper from `@/lib/auth/admin`).
- Render inside `<AppShellServer>` (same wrapper as `profile/summary/page.tsx`) so the shell + Admin nav highlight are consistent.
- Render the client component `<AdminDashboard />` (Plan 3 turns this into list + panel; in Plan 2 it renders the list only — see 3b). To keep Plan 2 shippable on its own, Plan 2 creates `AdminUsersList` and the page renders it directly; Plan 3 wraps it in an `AdminDashboard` that adds the panel.
- Fetch nothing profile-specific server-side beyond the guard; the list is fetched client-side from `/api/admin/users` so it can refresh (Plan 3 real-time).

### 3b. Client list — `src/components/admin/AdminUsersList.tsx`
- `"use client"`. Uses `useTranslations("admin")`.
- On mount, `fetch("/api/admin/users", { cache: "no-store" })`; store `users` in state; handle empty/loading/error states with localized copy.
- Renders a scrollable list; each row shows: `name` (fallback email), `email`, `targetRole` (or an em-dash / localized "No target role"), and a completion badge (`admin.complete` / `admin.incomplete` driven by `isComplete`).
- Each row has a **"Profile"** button (`admin.profileButton`). In Plan 2 the button sets a local `selectedUserId` state and (interim) logs/no-ops; Plan 3 lifts `selectedUserId` up and opens the panel. To avoid rework, expose an optional `onSelect?: (userId: string) => void` prop and call it on click; Plan 3 supplies the handler.
- Optional (nice-to-have): a client-side text input filtering by name/email (`admin.searchPlaceholder`).
- Reuse existing panel/list styling classes where sensible (e.g. `img3-panel`, existing card/list classes) to match the app look.

### 3c. i18n
Add an `admin` namespace to `messages/{en,de,fr}.json`:
- `title` (e.g. "Admin — Users"), `usersHeading`, `searchPlaceholder`, `profileButton` ("Profile"), `complete`, `incomplete`, `noTargetRole`, `empty` ("No users yet"), `loading`, `error`.
- Localize EN/DE/FR (Switzerland-first). Keep keys additive; do not modify existing namespaces beyond adding `admin`.

- **Expected**: Visiting `/admin` as an admin renders the shell + a list of all users, each with name/email, target role, completion badge, and a working "Profile" button; visiting as a non-admin (or logged-out) renders the 404 page. Labels resolve in EN/DE/FR.

---

## 4. Task Breakdown (Wave-ordered — all Wave 2, sequential by file independence)

- **T1** Create `src/app/api/admin/users/route.ts` (`GET`, `requireAdmin` gate, user-list DTO — Section 2a).
  - **Files**: `src/app/api/admin/users/route.ts`
  - **Verify**: `npm run build` passes; admin call returns `200` + all users; non-admin returns `404`.
  - **Done**: List endpoint returns `{ id, name, email, targetRole, isComplete }[]` for admins only.
- **T2** Create `src/app/api/admin/users/[userId]/route.ts` (`GET`, `requireAdmin` gate, full profile + onboarding + 11 signals bundle — Section 2b). Reuse `loadSignalStateWithMeta` and `buildProfileSummary`.
  - **Files**: `src/app/api/admin/users/[userId]/route.ts`
  - **Verify**: `npm run build` passes; admin call with a real userId returns the bundle with 11 signals; non-admin returns `404`; unknown-but-authorized userId returns `200` with `profile: null` + seeded signals.
  - **Done**: Single-user bundle endpoint is admin-gated and complete.
- **T3** Create `src/app/(app)/admin/page.tsx` (server guard via `getAdminUserIdOrNull` → `notFound()`, `AppShellServer` wrapper) + `src/components/admin/AdminUsersList.tsx` (client list with "Profile" buttons + `onSelect` prop). Add the `admin` i18n namespace to `messages/{en,de,fr}.json`.
  - **Files**: `src/app/(app)/admin/page.tsx`, `src/components/admin/AdminUsersList.tsx`, `messages/en.json`, `messages/de.json`, `messages/fr.json`
  - **Verify**: `npm run build` passes; `/admin` renders the list for admins and 404s for non-admins; labels resolve in EN/DE/FR.
  - **Done**: The Admin page lists all users with working "Profile" buttons; server-guarded.

> File independence: T1, T2, T3 touch disjoint files, but T3's page/list is the natural integration point for T1/T2. Execute in order T1 → T2 → T3.

---

## 5. Goal-Backward Verification (this plan)

For success criterion **SC-2** ("The Admin page lists all users, each with a working 'Profile' button"):

**Truths that must hold:**
1. There is an admin-only endpoint returning every user with list-ready fields. — T1
2. There is an admin-only endpoint returning one user's complete profile + 11 signals. — T2 (foundation for SC-3/SC-4 in Plan 3)
3. `/admin` is reachable by admins and returns 404 for everyone else (URL-typing job seeker included). — T3 (`getAdminUserIdOrNull` + `notFound()`)
4. Every row exposes a "Profile" affordance wired to a userId. — T3 (`onSelect(userId)`)

**Reachability**: The list endpoint is reachable from `AdminUsersList` on mount. The `[userId]` endpoint is reachable via each row's "Profile" button (handler supplied in Plan 3). The `/admin` route is reachable from the Plan-1 nav link. Non-admin access to `/admin` and both APIs is closed by `requireAdmin` / `getAdminUserIdOrNull` (Plan 1 helper).

**Non-regression checks:**
- No existing route/component modified except additive i18n `admin` namespace — onboarding/CV/cover letters/interview/coaching/signals-inference/artifact-memory untouched.
- Signal data served only through the admin-gated `[userId]` endpoint; job-seeker-facing routes unchanged.
- `npm run build`: 0 errors.

---

## 6. Deliverables
1. `src/app/api/admin/users/route.ts` — admin-gated user list.
2. `src/app/api/admin/users/[userId]/route.ts` — admin-gated full profile + 11 signals bundle.
3. `src/app/(app)/admin/page.tsx` — server-guarded admin page.
4. `src/components/admin/AdminUsersList.tsx` — client list with "Profile" buttons.
5. `messages/{en,de,fr}.json` — `admin.*` namespace.
