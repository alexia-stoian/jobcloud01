# Phase 8 Plan 3: Right-Side Profile + Signals Panel + Real-Time Updates

**Phase Goal**: Clicking a user's "Profile" button opens a large right-side panel showing that user's complete candidate profile AND all 11 recruiter signals (confidence bars, inferred values, evidence, contradiction flags), reusing the Phase 7 signal model and `RecruiterSignalsPanel` styling — and the panel updates within a few seconds when the selected candidate changes their profile or triggers signals, via short-interval polling.

**Requirements**: ADMIN-PANEL-05, ADMIN-REALTIME-06

**Depends on**: Plan 1 (auth helper) and Plan 2 (`GET /api/admin/users/[userId]` endpoint, `AdminUsersList` with its `onSelect` prop, the `/admin` page, and the `admin` i18n namespace). Reuses Phase 7 `SignalRecord` type + `RecruiterSignalsPanel` signal-row styling.

**Plan sequence**: Plan 3 of 3 — the final integration slice.

**Wave**: 3 (depends on Plan 2 / Wave 2).

---

## 1. Scope

### In scope
- A client `AdminProfilePanel` component: a large right-side panel rendering the selected user's full profile (all saved fields, CV-derived facts, qualifications, onboarding answers, profile history/timeline) AND all 11 signals (confidence bars, inferred values, evidence, contradiction badges), reusing the `RecruiterSignalsPanel` visual language.
- An `AdminDashboard` client wrapper that owns `selectedUserId` state, renders `AdminUsersList` (left) + `AdminProfilePanel` (right), and wires the "Profile" button (`onSelect`) to open the panel. Panel is closeable; selecting another user swaps content.
- **Real-time updates**: short-interval polling (every ~4s) of `GET /api/admin/users/[userId]` while the panel is open and a user is selected, so profile + signals refresh without manual reload. Documented as the chosen mechanism.
- The `/admin` page (from Plan 2) updated to render `AdminDashboard` instead of `AdminUsersList` directly.
- i18n additions for the panel (`admin.*` panel keys + reuse of the existing `recruiterSignals.*` namespace for signal labels) in EN/DE/FR.

### Explicitly OUT of scope
- ❌ Editing profiles from the panel (read-only).
- ❌ WebSocket/SSE infrastructure — polling is the chosen mechanism (see Section 4 rationale).
- ❌ Changing the Phase 7 onboarding `RecruiterSignalsPanel` behavior for job seekers (we reuse its styling, not its data path).

### Guardrails (non-negotiable)
- All panel data comes exclusively from the admin-gated `GET /api/admin/users/[userId]` endpoint (Plan 2), which enforces `requireAdmin` server-side. The client component is only ever mounted inside the server-guarded `/admin` page. Job seekers never receive the component or its data.
- Signal names/values/evidence appear ONLY inside this admin panel. No leakage into any user-facing string.
- Polling must stop when the panel is closed / no user selected (clear the interval on unmount and on `selectedUserId` change) to avoid leaks and needless load.
- EN/DE/FR must not regress; new keys added to all three.
- `npm run build` passes with 0 errors. No regression to onboarding, CV extraction, cover letters, interview prep, coaching, signals inference, artifact memory.

---

## 2. Right-Side Profile + Signals Panel

### 2a. `AdminProfilePanel` — `src/components/admin/AdminProfilePanel.tsx`
- `"use client"`. Props: `{ userId: string; onClose: () => void }`. Uses `useTranslations("admin")` and `useTranslations("recruiterSignals")`.
- Fetches `GET /api/admin/users/${userId}` (`cache: "no-store"`) on mount and whenever `userId` changes; stores the bundle in state; shows localized loading/error states.
- Layout: a large panel anchored to the RIGHT (same side/spirit as the onboarding signals panel). Use a fixed/absolute right-side container styled like the existing right region (reuse `img3-signals-panel` visual language + `img3-panel` classes), wide enough to read a full profile. Include a close button (`✕`, `admin.close`) calling `onClose`.
- **Profile section** — render from the bundle:
  - Header: `user.name` + `user.email`, completion badge (`completion.isMinimallyComplete`).
  - All profile fields from `profile` (fullName, currentJobSituation, employmentObjective, primaryRole, preferredLocation, targetRoles, targetSeniority, targetIndustries, preferredWorkModel, contractPreference, workRate, workPermitStatus, salaryExpectation, visaSponsorship, relocationWillingness, commuteRadius, locale). Render as a labelled key/value list; skip null/empty with a localized dash.
  - **Qualifications** (`qualifications[]`: category + value).
  - **CV-derived facts + onboarding answers** (`onboarding.cvExtractedFacts`, `onboarding.targetRole`, `onboarding.cvFileName`, `onboarding.conversationHistory` summarized — render CV facts as key/values; render onboarding answers/timeline as a compact list). Guard for `onboarding === null`.
  - **Profile history / timeline** (`history[]`: `createdAt` + `source`), most-recent first (already ordered by the API).
- **Signals section** — render all 11 `signals` reusing the `RecruiterSignalsPanel` row markup: group by category (`motivation` / `behavioral` / `skill`), each row with the name, a 0–100% confidence **bar**, inferred value, a contradiction badge when `contradictionFlags.length > 0`, and "Not yet assessed" (`recruiterSignals.notAssessed`) at 0%. Additionally surface **evidence** (the `evidence[].quote` list) for each assessed signal — the admin dashboard is the reveal surface, so show evidence quotes (on expand/hover or inline), which the onboarding panel does not.
  - Extract the signal-row rendering into a small shared presentational piece if convenient (e.g. a `SignalRows` sub-component reused by both `RecruiterSignalsPanel` and `AdminProfilePanel`), OR copy the row markup — either is acceptable; do not alter `RecruiterSignalsPanel`'s existing job-seeker-gated behavior.

### 2b. `AdminDashboard` — `src/components/admin/AdminDashboard.tsx`
- `"use client"`. Owns `const [selectedUserId, setSelectedUserId] = useState<string | null>(null)`.
- Renders `<AdminUsersList onSelect={setSelectedUserId} />` (left/main) and, when `selectedUserId` is set, `<AdminProfilePanel userId={selectedUserId} onClose={() => setSelectedUserId(null)} />` (right).
- Passing a new `userId` while the panel is open swaps its content (the panel re-fetches on `userId` change).

### 2c. Wire into the page
- Update `src/app/(app)/admin/page.tsx` (from Plan 2) to render `<AdminDashboard />` instead of `<AdminUsersList />` directly. The server guard (`getAdminUserIdOrNull` → `notFound()`) is unchanged.

- **Expected**: As an admin, clicking "Profile" opens a large right-side panel with the user's complete profile (fields, CV facts, qualifications, onboarding answers, history) and all 11 signals with confidence bars, inferred values, evidence, and contradiction badges; closing it and selecting another user swaps the content.

---

## 3. Real-Time Updates (polling)

### 3a. Chosen mechanism — short-interval polling
Inside `AdminProfilePanel`, when a `userId` is selected and the panel is mounted:
- Start a `setInterval` that re-fetches `GET /api/admin/users/${userId}` every **4000 ms** and updates state on success.
- Clear the interval on unmount and whenever `userId` changes (effect cleanup) so exactly one poller runs for the currently-selected user.
- Merge/replace state atomically so the bars animate to new confidence values (the reused signal-bar markup already has a `width` CSS transition).
- Keep the initial immediate fetch (Section 2a) so the panel is populated instantly, then polling keeps it fresh.

### 3b. Rationale (document in the component header)
- **Why polling, not SSE/WebSocket**: This is a Next.js 15 App Router app with route handlers and no existing socket/streaming infra. Signal writes are fire-and-forget from onboarding (Phase 7), so there is no push channel to subscribe to. A 4s poll of an already-built admin-gated read endpoint is the simplest reliable option, satisfies the "within a few seconds" requirement, requires no new dependencies or server state, and cannot leak to job seekers (the endpoint is admin-gated). SSE would add a new streaming route + connection lifecycle for no functional gain at this scale.

- **Expected**: While the panel is open on user X, if X updates their profile or triggers signals in onboarding, the panel reflects the change within ~4s without a manual refresh. Closing the panel stops polling (no lingering interval).

---

## 4. i18n

Add panel keys to the existing `admin` namespace in `messages/{en,de,fr}.json`:
- `close`, `profileHeading`, `signalsHeading`, `cvFactsHeading`, `qualificationsHeading`, `onboardingHeading`, `historyHeading`, `evidenceHeading`, `noData`, `fieldEmpty` (dash), and any field labels needed for the profile key/value list (or reuse existing profile-related keys where present).
- Reuse the existing `recruiterSignals.*` namespace (title, notAssessed, categoryMotivation/Behavioral/Skill, contradiction) for the signals section labels — do not duplicate them.
- Localize EN/DE/FR (Switzerland-first). Additive only.

- **Expected**: All panel labels resolve in EN/DE/FR; no missing-key warnings.

---

## 5. Task Breakdown (Wave-ordered — all Wave 3)

- **T1** Create `src/components/admin/AdminProfilePanel.tsx` — right-side panel fetching `GET /api/admin/users/[userId]`, rendering full profile (fields, CV facts, qualifications, onboarding answers, history) + all 11 signals with confidence bars, inferred values, evidence, and contradiction badges (reusing `RecruiterSignalsPanel` row styling). Include close button. (Sections 2a.)
  - **Files**: `src/components/admin/AdminProfilePanel.tsx` (and, if extracted, a shared `SignalRows` piece)
  - **Verify**: `npm run build` passes; panel renders profile + 11 signals from the bundle; contradiction badge shows when flags present; "Not yet assessed" at 0%.
  - **Done**: Large right-side panel shows the selected user's complete profile + all 11 signals with evidence/contradictions.
- **T2** Add the 4s polling loop to `AdminProfilePanel` (immediate fetch + interval, cleanup on unmount / `userId` change) with the documented rationale header. (Section 3.)
  - **Files**: `src/components/admin/AdminProfilePanel.tsx`
  - **Verify**: `npm run build` passes; interval starts on select, clears on close/unmount and on `userId` change (verified by cleanup return in the effect).
  - **Done**: Panel refreshes within ~4s of a candidate change; no lingering interval after close.
- **T3** Create `src/components/admin/AdminDashboard.tsx` (owns `selectedUserId`, renders list + panel, wires `onSelect`), update `src/app/(app)/admin/page.tsx` to render `<AdminDashboard />`, and add the panel i18n keys to `messages/{en,de,fr}.json`. Full verification pass (Section 6) + `npm run build`.
  - **Files**: `src/components/admin/AdminDashboard.tsx`, `src/app/(app)/admin/page.tsx`, `messages/en.json`, `messages/de.json`, `messages/fr.json`
  - **Verify**: `npm run build` passes; clicking "Profile" opens the panel, close/reselect swaps content; labels resolve EN/DE/FR; `/admin` still 404s for non-admins.
  - **Done**: End-to-end admin dashboard works; all 5 CONTEXT success criteria met; build clean.

> All Plan 3 tasks are Wave 3. T1 → T2 modify the same file (`AdminProfilePanel.tsx`) so they are sequential; T3 wires everything and is last.

---

## 6. Goal-Backward Verification — full phase (5 CONTEXT success criteria)

1. **SC-1 (admin-only nav + server-protected `/admin`)** — Plan 1 nav + Plan 2 `getAdminUserIdOrNull`/`notFound()`: admins see the "Admin" link under "Notifications"; non-admins don't and get 404 at `/admin` by URL. ✅
2. **SC-2 (list all users + working "Profile" button)** — Plan 2 `GET /api/admin/users` + `AdminUsersList`; Plan 3 `onSelect` opens the panel. ✅
3. **SC-3 (large right-side panel: complete profile + all 11 signals)** — Plan 3 `AdminProfilePanel` renders the Plan 2 `[userId]` bundle: all profile fields, CV facts, qualifications, onboarding answers, history, and 11 signals with confidence/evidence/contradictions. ✅
4. **SC-4 (real-time updates within a few seconds)** — Plan 3 4s polling of the `[userId]` endpoint refreshes profile + signals without manual reload. ✅
5. **SC-5 (existing flows + signal invisibility preserved; build passes)** — No user-facing route/component behavior changed; signal data only via admin-gated endpoints; `npm run build` 0 errors; job-seeker onboarding/signals panel unchanged (Phase 7 flag path untouched). ✅

**Reachability**: `AdminProfilePanel` ← "Profile" button (`onSelect`) ← `AdminUsersList` ← `AdminDashboard` ← `/admin` page ← "Admin" nav link (admins only). The `[userId]` endpoint (data source + poll target) is admin-gated. Every hop is closed to non-admins by the Plan 1 helper.

**Non-regression checks:**
- `RecruiterSignalsPanel` job-seeker behavior unchanged (we reuse styling / optionally extract a presentational sub-component without altering its gate).
- No changes to onboarding, CV extraction, cover letters, interview prep, coaching, signals inference, artifact memory.
- EN/DE/FR: additive keys only.
- `npm run build`: 0 errors.

---

## 7. Deliverables
1. `src/components/admin/AdminProfilePanel.tsx` — right-side profile + signals panel with 4s polling.
2. `src/components/admin/AdminDashboard.tsx` — list + panel state wrapper.
3. `src/app/(app)/admin/page.tsx` — updated to render `AdminDashboard`.
4. `messages/{en,de,fr}.json` — panel i18n keys.
5. (Optional) shared `SignalRows` presentational piece reused by `RecruiterSignalsPanel` and `AdminProfilePanel`.
