# Phase 8 Plan 1: Admin Authorization + Schema + Left-Nav Entry

**Phase Goal**: A recruiter-facing admin surface exists behind a durable, server-enforced authorization rule. This plan lays the foundation the other two plans build on: a persisted admin concept on the `User` model, one shared server-side authorization helper reused by every admin route/page, and the "Admin" left-nav entry (rendered only for admins, directly under "Notifications").

**Requirements**: ADMIN-AUTHZ-01, ADMIN-NAV-02

**Depends on**: Phase 7 (existing `SIGNALS_ADMIN_ENABLED` gate + `src/app/api/admin/signals/route.ts`, which this plan reconciles into the shared helper).

**Plan sequence**: This is Plan 1 of 3. Plan 2 (users list + admin profile/signals API) and Plan 3 (right-side panel + real-time) both depend on the authorization helper (`src/lib/auth/admin.ts`) and the `role` field created here.

**Wave**: 1 (no dependency on Plan 2 or Plan 3).

---

## 1. Scope

### In scope
- A durable `role` field (`UserRole` enum, `USER` | `ADMIN`) on the Prisma `User` model + migration + a seed/mark script.
- One shared server-side authorization helper (`src/lib/auth/admin.ts`) reused by every admin route and page.
- Reconciling the existing `SIGNALS_ADMIN_ENABLED` / allowlist gate in `src/app/api/admin/signals/route.ts` so the whole admin area shares one rule (a user is admin if `role === "ADMIN"`, OR — legacy compatibility — the signals gate is enabled and they are on `SIGNALS_ADMIN_USER_IDS`).
- The "Admin" left-nav entry in `AppShell`, directly under "Notifications", conditional on an `isAdmin` prop, with active-state handling matching existing links.
- i18n label `app.admin` in EN/DE/FR.

### Explicitly OUT of scope
- ❌ The admin users list page and its data (Plan 2).
- ❌ The right-side profile/signals panel and real-time updates (Plan 3).
- ❌ A role-management UI (a single `role` field + seed script is sufficient per CONTEXT out-of-scope).
- ❌ Editing candidate profiles.

### Guardrails (non-negotiable)
- Authorization is enforced **server-side**. Hiding the nav item is UX only; the route/API guards (built here + Plans 2/3) are the real control. Non-admins receive `404` (endpoint/page appears not to exist) — never a `403` that reveals the surface.
- No change to any existing user-facing behavior. The `role` column defaults to `USER`; existing users are unaffected. The signals panel's current behavior (Phase 7, flag-gated) must remain byte-for-byte identical for job seekers.
- Reuse the established `userId String -> User.id` (cuid/TEXT) FK convention. **No `@db.Uuid`** anywhere.
- Switzerland-first EN/DE/FR must not regress: the new `app.admin` key is added to all three locale files.
- `npm run build` passes with 0 errors.

---

## 2. Data Model

Add a `UserRole` enum and a `role` field to the existing `model User` in `prisma/schema.prisma`.

```prisma
enum UserRole {
  USER
  ADMIN
}

// inside model User { ... }
  role UserRole @default(USER)
```

- Place the `role` field alongside the other scalar fields on `User` (e.g. after `updatedAt`). Do NOT touch existing relations or the `candidateSignalState` back-relation.
- Default `USER` guarantees a safe, non-breaking migration for all existing rows.

**Migration command**:
```bash
npx prisma migrate dev --name add_user_role
npx prisma generate
```

---

## 3. Authorization Helper (shared, server-only)

New file `src/lib/auth/admin.ts`. This is the single source of truth for "is this caller an admin?" and is reused by the signals route (this plan) and every admin route/page (Plans 2 and 3).

Exports:

- `async function resolveIsAdmin(userId: string): Promise<boolean>`
  - Loads `db.user.findUnique({ where: { id: userId }, select: { role: true } })`.
  - Returns `true` if `role === "ADMIN"`.
  - **Legacy reconciliation**: also returns `true` if `env.SIGNALS_ADMIN_ENABLED` is true AND the user id appears in the `SIGNALS_ADMIN_USER_IDS` allowlist (parsed the same way as the existing signals route: split on `,`, trim, drop empties). This preserves the Phase 7 gate so nothing regresses.
  - Returns `false` otherwise.

- `async function requireAdmin(): Promise<{ userId: string } | { response: NextResponse }>`
  - Calls `auth()` from `@/auth/config`. If no `session.user.id` → return `{ response: NextResponse.json({ error: "not_found" }, { status: 404 }) }` (stay hidden — do not distinguish "not logged in" from "not admin" to unauthenticated probing; match the existing signals route's hide-don't-reveal posture).
  - Calls `resolveIsAdmin(session.user.id)`. If `false` → return `{ response: NextResponse.json({ error: "not_found" }, { status: 404 }) }`.
  - If admin → return `{ userId: session.user.id }`.
  - Consumers narrow on `"response" in result`.

- `async function getAdminUserIdOrNull(): Promise<string | null>`
  - Server-component helper for pages: resolves the session user id, returns it when `resolveIsAdmin` is true, else `null`. Pages call `notFound()` when this returns `null`.

**Reconcile the existing signals route** — `src/app/api/admin/signals/route.ts`:
- Replace the inline allowlist + gate logic with `resolveIsAdmin(sessionUserId)` for the authorization decision, keeping the existing 404/401 response shapes and the `?userId=` override behavior (only admins may query another user's id). The route's externally observable behavior for job seekers (404 when not permitted) must be unchanged.

- **Expected**: `import { requireAdmin, resolveIsAdmin } from '@/lib/auth/admin'` compiles; a user with `role: "ADMIN"` resolves `true`; a `USER` with no allowlist entry resolves `false`; `/api/admin/signals` still returns 404 for a non-admin and 200 for an admin.

---

## 4. Seed / Mark an Admin

New file `scripts/set-admin.mjs` (mirrors the existing `scripts/batch-eval-onboarding.mjs` node-script pattern; run with `node`, no new dependency).

- Reads an email from `process.argv[2]`.
- Uses `@prisma/client` directly: `await prisma.user.update({ where: { email }, data: { role: "ADMIN" } })`.
- Prints the updated user id + role, then exits. Logs a clear error and exits non-zero if the email is not found.
- Idempotent: running twice is a no-op beyond re-setting `ADMIN`.

Usage documented at the top of the file:
```bash
node scripts/set-admin.mjs alice@example.com
```

- **Expected**: Running the script against a known seeded user flips `role` to `ADMIN`; a subsequent `resolveIsAdmin(thatUserId)` returns `true`.

---

## 5. Left-Nav "Admin" Entry

### 5a. `AppShell.tsx` — conditional admin nav item
File: `src/components/layout/AppShell.tsx`.

- Extend `type NavItem`:
  - Add `"admin"` to the `labelKey` union.
  - Add `"/admin"` to the `href` union.
- Add an `isAdmin: boolean` prop to `Props` and the `AppShell` signature.
- Build the rendered nav list so the admin item appears **directly after `notifications`** and only when `isAdmin` is true. Two acceptable approaches (pick one, keep it simple):
  - Compute a local `items` array = `isAdmin ? [...navItems, { labelKey: "admin", icon: "◈", href: "/admin" }] : navItems` — since `notifications` is the last existing entry, appending places "Admin" directly under it.
- `isActive` already returns `pathname === href` by default, which is correct for `/admin`; add a `startsWith("/admin")` branch so `/admin/...` sub-routes keep the link active.
- Use the existing `app-sidebar__link` markup and `tApp(item.labelKey)` for the label. Icon: a simple glyph consistent with the others (e.g. `◈`).

### 5b. `AppShellServer.tsx` — resolve and pass `isAdmin`
File: `src/components/layout/AppShellServer.tsx`.

- After the existing `userId` resolution, compute `const isAdmin = await resolveIsAdmin(userId);` using the Plan-1 helper (import from `@/lib/auth/admin`).
- Pass `isAdmin={isAdmin}` to `<AppShell ...>`.
- No other change to the existing user/name/role fetch.

### 5c. i18n label
Add `"admin": "Admin"` (localized) to the `app` namespace in `messages/en.json`, `messages/de.json`, `messages/fr.json`, next to the existing `notifications` key.
- EN: `"Admin"`
- DE: `"Admin"`
- FR: `"Admin"`

- **Expected**: With a user whose `role === "ADMIN"`, the sidebar shows an "Admin" link directly under "Notifications" that navigates to `/admin` and shows an active state on `/admin`. With a `USER`, the link is absent. Label resolves in EN/DE/FR with no missing-key warnings.

---

## 6. Task Breakdown (Wave-ordered)

### Wave 1 — Schema + helper + seed (independent)
- **T1.1** Add the `UserRole` enum and `role UserRole @default(USER)` to `model User` in `prisma/schema.prisma`. Run `npx prisma migrate dev --name add_user_role` and `npx prisma generate`.
  - **Files**: `prisma/schema.prisma`, `prisma/migrations/**`
  - **Verify**: `npx prisma validate` passes; migration file exists under `prisma/migrations/`; `db.user` has a typed `role` field.
  - **Done**: Migration applied, `role` defaults to `USER` for existing rows, build compiles.
- **T1.2** Create `src/lib/auth/admin.ts` with `resolveIsAdmin`, `requireAdmin`, `getAdminUserIdOrNull` (Section 3). Reconcile `src/app/api/admin/signals/route.ts` to authorize via `resolveIsAdmin`, preserving its 404/401 responses and `?userId=` override.
  - **Files**: `src/lib/auth/admin.ts`, `src/app/api/admin/signals/route.ts`
  - **Verify**: `npm run build` passes; grep confirms `src/app/api/admin/signals/route.ts` imports from `@/lib/auth/admin`.
  - **Done**: Admin resolves true; non-admin resolves false; signals route behavior unchanged for job seekers (404), works for admins (200).
- **T1.3** Create `scripts/set-admin.mjs` to mark a user `ADMIN` by email (Section 4).
  - **Files**: `scripts/set-admin.mjs`
  - **Verify**: `node scripts/set-admin.mjs <known-email>` prints the updated id + `ADMIN`; a bad email exits non-zero with a clear message.
  - **Done**: Target user's `role` becomes `ADMIN`; `resolveIsAdmin` returns true for that id.

### Wave 2 — Nav wiring (depends on Wave 1 helper)
- **T2.1** Extend `AppShell.tsx` (NavItem type + `isAdmin` prop + conditional "Admin" item under Notifications + `/admin` active state). Pass `isAdmin` from `AppShellServer.tsx` via `resolveIsAdmin`. Add `app.admin` label to `messages/{en,de,fr}.json`.
  - **Files**: `src/components/layout/AppShell.tsx`, `src/components/layout/AppShellServer.tsx`, `messages/en.json`, `messages/de.json`, `messages/fr.json`
  - **Verify**: `npm run build` passes; admin session shows the link, non-admin does not; label resolves in all three locales.
  - **Done**: "Admin" link renders only for admins, directly under "Notifications", active on `/admin`.

> Wave 2 depends on Wave 1 only via the `resolveIsAdmin` import; `AppShell.tsx`/`AppShellServer.tsx`/`messages/*` are not touched by Wave 1, so there is no file conflict.

---

## 7. Goal-Backward Verification (this plan)

For success criterion **SC-1** ("Admins see an 'Admin' link under 'Notifications'; non-admins do not and cannot reach `/admin` by URL"):

**Truths that must hold after this plan:**
1. A durable admin marker exists and persists (`User.role`). — T1.1
2. One server-side rule decides admin-ness, reused everywhere. — T1.2 (`resolveIsAdmin` / `requireAdmin`)
3. The signals gate is reconciled into that rule (no second, divergent notion of admin). — T1.2
4. The nav link is present for admins and absent for non-admins. — T2.1
5. There is a concrete, repeatable way to create an admin. — T1.3

**Reachability**: `role` is reachable via `scripts/set-admin.mjs`. `resolveIsAdmin` is reachable from `AppShellServer` (nav), the signals route (reconciled), and — in Plans 2/3 — every admin API/page. The `/admin` route itself is created and server-guarded in Plan 2; until then the nav link is inert for the (not-yet-created) page, which is acceptable within this plan's wave. Non-admin URL access to `/admin` is fully closed in Plan 2's server guard (`notFound()`), which reuses this plan's helper.

**Non-regression checks:**
- Job-seeker onboarding, CV extraction, cover letters, interview prep, coaching, signals inference, artifact memory: unchanged (no files in those paths touched except the reconciled signals route, whose external behavior is preserved).
- EN/DE/FR: only additive `app.admin` keys.
- `npm run build`: 0 errors.

---

## 8. Deliverables
1. `prisma/schema.prisma` — `UserRole` enum + `User.role` field + migration.
2. `src/lib/auth/admin.ts` — shared `resolveIsAdmin` / `requireAdmin` / `getAdminUserIdOrNull`.
3. `src/app/api/admin/signals/route.ts` — reconciled to use `resolveIsAdmin` (behavior preserved).
4. `scripts/set-admin.mjs` — mark-admin-by-email seed script.
5. `src/components/layout/AppShell.tsx` + `AppShellServer.tsx` — conditional "Admin" nav entry.
6. `messages/{en,de,fr}.json` — `app.admin` label.
