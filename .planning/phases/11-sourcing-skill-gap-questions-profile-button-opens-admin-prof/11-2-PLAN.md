---
phase: 11-sourcing-skill-gap-questions
plan: 2
type: execute
wave: 2
depends_on:
  - 11-1
files_modified:
  - src/app/api/admin/sourcing/route.ts
  - src/app/api/admin/sourcing/session/route.ts
  - src/components/admin/SourcingPage.tsx
  - src/app/globals.css
  - messages/en.json
  - messages/de.json
  - messages/fr.json
  - tests/integration/sourcing-session-readback.test.ts
autonomous: true
requirements:
  - SGQ-01
  - SGQ-02
  - SGQ-05
  - SGQ-06

must_haves:
  truths:
    - "After the top-3 results are built, the sourcing POST creates one SourcingSession keyed to gate.userId and, for every shown candidate whose displayed fitPercent >= 60, generates <=5 gap questions and queues a SourcingCandidate with fitBefore = that displayed fitPercent; a candidate at 58% is NOT queued while 60% and 62% ARE."
    - "Before queueing for a candidate, any existing non-completed (pending/delivering) SourcingCandidate for that candidate is retired (completed with no visible change) so re-running a sourcing run never mints a second pending set nor orphans a partially-answered older set (one active set per candidate)."
    - "Generation runs in parallel over qualifying candidates, degrades to no-op when no gaps or no API key, and never blocks or breaks the existing sourcing response shape."
    - "GET /api/admin/sourcing/session is requireAdmin-gated (404 for non-admins BEFORE any DB read) and returns, per candidateUserId, { fitBefore, fitAfter, questions:[{prompt, answer}] } with NO isCorrect/isOpen/needsSnapshot/satisfiedNeed leaked."
    - "Each Sourcing card gains a Profile button that opens the AdminProfilePanel slide-over (scrim + panel) for that result.userId without navigating away."
    - "Each card renders a Q&A + '[before] -> [now]' section fed by the read-back endpoint, showing questions asked and the user's answers when a candidate has answered."
    - "EN/DE/FR keys exist for the profile button, the Q&A section, and the candidate-facing notify/thank-you strings (consumed in Plan 3); npm run build passes 0 errors."
  artifacts:
    - src/app/api/admin/sourcing/route.ts
    - src/app/api/admin/sourcing/session/route.ts
    - src/components/admin/SourcingPage.tsx
    - tests/integration/sourcing-session-readback.test.ts
  key_links:
    - "sourcing POST: after results.sort, createSourcingRun({ recruiterUserId: gate.userId, ... }) then, per qualifying candidate, findActiveCandidate + retire-if-present guard, then Promise.all over results.filter(r => r.fitPercent >= 60) calling generateGapQuestions + queueCandidateQuestions(fitBefore=r.fitPercent)."
    - "GET session route → readBackForRecruiter(userIds) behind requireAdmin(); SourcingPage fetches it by result.userId on mount and merges before->now + Q&A into each card."
    - "Profile button sets profileUserId state → <AdminProfilePanel userId={profileUserId}/> + admin-scrim, mirroring AdminDashboard.tsx:20-35."
---

<objective>
Wire the recruiter surface: on a sourcing run, mint a persisted session and queue <=5 gap
questions for every shown candidate at >=60% (storing the displayed fit as `fitBefore`); add
an admin-gated read-back endpoint; and upgrade the Sourcing cards with a Profile slide-over
(reusing `AdminProfilePanel`) and a per-card Q&A + "[before] -> [now]" section. Land all
EN/DE/FR keys (recruiter + candidate-facing) and an integration test proving the read-back
never leaks correctness and is admin-gated.

Purpose: Deliver D1 (Profile slide-over), D2 (generate-and-queue at run time), and D5
(recruiter visibility of Q&A + before->now) over the Plan 1 core.
Output: One edited sourcing route, one new read-back route, one upgraded client page, scoped
CSS, EN/DE/FR strings, and one integration test. No schema change.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/11-sourcing-skill-gap-questions-profile-button-opens-admin-prof/CONTEXT.md
@.planning/phases/11-sourcing-skill-gap-questions-profile-button-opens-admin-prof/RESEARCH.md
@.planning/phases/11-sourcing-skill-gap-questions-profile-button-opens-admin-prof/11-1-PLAN.md

# Reuse — do not rebuild
@src/app/api/admin/sourcing/route.ts
@src/components/admin/SourcingPage.tsx
@src/components/admin/AdminDashboard.tsx
@src/components/admin/AdminProfilePanel.tsx
@src/lib/auth/admin.ts
@src/lib/sourcing/session-dal.ts
@src/lib/sourcing/questions.ts
@src/lib/sourcing/types.ts
@messages/en.json
@tests/integration/onboarding-assistant-cover-letter.test.ts
</context>

---

## 1. Scope

### In scope
- Edit `src/app/api/admin/sourcing/route.ts`: after `results.sort(...)`, `createSourcingRun`
  and — for `results.filter(r => r.fitPercent >= 60)` — `generateGapQuestions` +
  `queueCandidateQuestions` in parallel, storing `fitBefore = r.fitPercent` (SGQ-02, SGQ-05).
- New `src/app/api/admin/sourcing/session/route.ts`: admin-gated `GET` returning
  `readBackForRecruiter(userIds)` (SGQ-05).
- Edit `src/components/admin/SourcingPage.tsx`: Profile button + `AdminProfilePanel`
  slide-over per card; fetch the read-back by `result.userId` on mount; render a Q&A +
  "[before] -> [now]" section (SGQ-01, SGQ-05).
- `src/app/globals.css`: any scoped classes the new Q&A section needs (reuse existing
  `admin-scrim`/`admin-panel`/`sourcing-card` classes for the slide-over).
- `messages/{en,de,fr}.json`: keys for the profile button + Q&A labels AND the candidate-facing
  notify/thank-you strings that Plan 3 consumes (added here so the messages files are touched
  once, in this wave).
- `tests/integration/sourcing-session-readback.test.ts`: read-back returns before->now + Q&A
  with no correctness leakage, and 404s for non-admins.

### Explicitly OUT of scope
- ❌ The candidate delivery endpoint / re-score / `OnboardingCvUploadForm` (Plan 3).
- ❌ Any Prisma schema or migration change (Plan 1 owns the models).
- ❌ Changing the deterministic ranking or the existing `SourcingResponse` shape.
- ❌ Real-time push to the recruiter (deferred — card updates on next visit only).

### Guardrails (non-negotiable)
- Gate generation on the DISPLAYED `result.fitPercent >= 60` (the LLM value the recruiter
  sees), NOT `scored.score` (RESEARCH Pitfall 1). Store that same number as `fitBefore`.
- Generation must NOT change the returned `SourcingResponse` shape and must degrade silently
  (no gaps / no key → no questions), never throwing out of the POST.
- `requireAdmin()` runs FIRST in the read-back route, before any DB read (mirror
  `sourcing/route.ts:24-27`). Non-admins get 404.
- The read-back response and the card MUST NOT surface `needsSnapshot`, `isCorrect`,
  `isOpen`, `satisfiedNeed`, `gapLabel`, or the recruiter identity — only prompt text,
  the user's chosen label / free text, and the two percentages.
- The Sourcing page is already admin-gated; `AdminProfilePanel` self-fetches from the
  admin-gated `GET /api/admin/users/{id}` — reusing it leaks nothing.

---

## 2. Generation hook contract (`sourcing/route.ts`)

Insert AFTER the existing `results.sort(...)` (`route.ts:~104`) and BEFORE building
`response`:

- `const run = await createSourcingRun({ recruiterUserId: gate.userId,
  needsSnapshot: needs, roleLabel: needs.role ?? null })` — `requireAdmin()` returns
  `{ userId }` on success (see `src/lib/auth/admin.ts`), so use `gate.userId` directly (there
  is NO `gate.session`).
- `const qualifying = results.filter((r) => r.fitPercent >= 60)` — the `>= 60` gate is on the
  DISPLAYED `fitPercent`, so 58% is excluded while 60% and 62% qualify.
- `await Promise.all(qualifying.map(async (r) => { const existing = await
  findActiveCandidate(r.userId); if (existing) { await completeCandidate({ candidateId:
  existing.id, fitAfter: existing.fitAfter ?? existing.fitBefore }); } const questions = await
  generateGapQuestions(needs, r); if (questions.length === 0) return; await
  queueCandidateQuestions({ sessionId: run.id, candidateUserId: r.userId, fitBefore:
  r.fitPercent, questions }); }))`.
- **One-active-set guard:** before queueing for a candidate, call `findActiveCandidate(r.userId)`
  (newest `SourcingCandidate` with `status != "completed"`, i.e. `pending`/`delivering`). If one
  exists, retire it via `completeCandidate({ candidateId, fitAfter: existing.fitAfter ??
  existing.fitBefore })` (no visible change) so a partially-answered older set is never orphaned
  and the candidate is never left with two live sets; only then queue the fresh set. Invariant:
  at most ONE non-completed set per candidate at any time.
- Wrap the whole block in `try/catch` that logs server-side and continues — a generation
  failure must never fail the recruiter's ranking response.

## 3. Read-back contract (`sourcing/session/route.ts`)

- `GET` with `?userIds=a,b,c` (or read all for the latest run). `requireAdmin()` first.
- For each requested candidate, `readBackForRecruiter` returns the MOST RECENT
  `SourcingCandidate` by `createdAt` REGARDLESS of status (so the card always reflects the
  latest run for that candidate, even mid-answer).
- Returns `{ candidates: Array<{ candidateUserId, fitBefore, fitAfter, answered,
  questions: Array<{ prompt, answer }> }> }` where `answer` is the chosen option LABEL or the
  free text, and `fitAfter` is `null` until the candidate completes. No server-only fields.

---

## 4. Task Breakdown (wave-ordered, atomically committable)

### Wave 2 — Recruiter side

- **T1 — Generate + persist on the sourcing run; read-back endpoint**
  - **Files**: `src/app/api/admin/sourcing/route.ts`,
    `src/app/api/admin/sourcing/session/route.ts`
  - **Action**: In `sourcing/route.ts`, add the §2 generation hook after `results.sort(...)`:
    import `createSourcingRun`, `findActiveCandidate`, `completeCandidate`,
    `queueCandidateQuestions` from `@/lib/sourcing/session-dal`
    and `generateGapQuestions` from `@/lib/sourcing/questions`; create the run keyed to the
    admin (`gate.userId` — `requireAdmin()` returns `{ userId }` on success per
    `src/lib/auth/admin.ts`; do NOT reach for `gate.session`), then, before queueing each
    candidate, apply the §2 one-active-set guard (`findActiveCandidate` → `completeCandidate`
    to retire any existing `pending`/`delivering` set), then `Promise.all` over the `>= 60`
    results generating and queueing (fitBefore = `result.fitPercent`). Keep the block inside a
    `try/catch` that never throws out of the POST and leaves `response` unchanged. Then create
    `sourcing/session/route.ts` as a `nodejs` / `force-dynamic` route exporting `GET`: call
    `requireAdmin()` FIRST and return its 404 for non-admins; parse `userIds` from the query
    (comma-split, trimmed, capped); call `readBackForRecruiter(userIds)` and return
    `{ candidates }` (§3 shape) — never including server-only fields.
  - **Verify**:
    <automated>npx tsc --noEmit</automated>
    Plus: grep confirms `sourcing/route.ts` calls `createSourcingRun` with `gate.userId`,
    calls `findActiveCandidate` before `queueCandidateQuestions`, and gates on `>= 60`; and
    `sourcing/session/route.ts` calls `requireAdmin` before any
    `readBackForRecruiter`/db call.
  - **Done**: A run keyed to `gate.userId` + queued questions are persisted for every >=60%
    shown candidate (58% excluded), any prior non-completed set for a candidate is retired
    first (one active set), and an admin-gated read-back endpoint returns before->now + Q&A
    with no correctness leakage.

- **T2 — Sourcing card: Profile slide-over + Q&A / before->now section**
  - **Files**: `src/components/admin/SourcingPage.tsx`, `src/app/globals.css`
  - **Action**: In `SourcingPage.tsx`, add `const [profileUserId, setProfileUserId] =
    useState<string | null>(null)` and, in each card header (`SourcingPage.tsx:~184`), a
    `type="button"` "Profile" button (`t("profileButton")`) that calls
    `setProfileUserId(result.userId)`. At the end of the results `<section>`, render — when
    `profileUserId` is set — the `admin-scrim` div + `<AdminProfilePanel key={profileUserId}
    userId={profileUserId} onClose={() => setProfileUserId(null)} />`, exactly mirroring
    `AdminDashboard.tsx:20-35` (import `AdminProfilePanel`). Add a mount-time effect that,
    once `results` are present, fetches `GET /api/admin/sourcing/session?userIds=<result ids>`
    (`cache: "no-store"`) and stores the response in a `sessionByUser` map keyed by
    `candidateUserId`. In each card, when that user has an answered entry, render a new
    section listing each `{ prompt, answer }` pair and a `fitBefore -> fitAfter` badge (use the
    localized label; show `fitBefore` alone when `fitAfter` is null). Add any needed scoped
    classes (e.g. `sourcing-card__qa`, `sourcing-card__delta`) to `globals.css`; reuse the
    existing `admin-scrim`/`admin-panel`/`sourcing-card` classes for the slide-over. Keep the
    existing `localStorage` base-ranking restore intact (RESEARCH Pattern 5).
  - **Verify**:
    <automated>npx tsc --noEmit</automated>
    Plus: grep confirms `SourcingPage.tsx` imports `AdminProfilePanel`, renders
    `admin-scrim`, and fetches `/api/admin/sourcing/session`. NOTE: card rendering (Profile
    slide-over + Q&A/before->now section) is verified STRUCTURALLY by `tsc` + grep only — this
    repo has no React render harness, so visual/DOM correctness is not asserted here; it is
    covered by the read-back integration test (T3) exercising the data path plus manual review.
  - **Done**: Each card has a working Profile slide-over and a Q&A + "[before] -> [now]"
    section fed by the persisted read-back, without navigating away or breaking base ranking.

- **T3 — EN/DE/FR keys + read-back & >=60-trigger integration test**
  - **Files**: `messages/en.json`, `messages/de.json`, `messages/fr.json`,
    `tests/integration/sourcing-session-readback.test.ts`
  - **Action**: Add message keys under `admin.sourcing` for the recruiter surface
    (`profileButton`, `qaHeading`, `answerLabel`, `beforeAfterLabel` — e.g. "{before}% ->
    {now}%") in all three locales, keeping the existing key ordering/shape. In the SAME edit,
    add a `sourcing` (candidate-facing) section with the cheerful, emoji-rich keys Plan 3
    consumes: `recruiterInterested` (e.g. "🎉 Great news — a recruiter is interested in you!
    Answer a few quick questions to stand out."), `thankYou` (e.g. "🙌 Thanks so much! If the
    recruiter chooses you, you'll be contacted. 🎉"), and a `questionProgress` label if
    needed — all EN/DE/FR, matching `prompts/prompt.txt` tone (this flow stays cheerful; only
    mock-interview dials emojis down). THEN write
    `tests/integration/sourcing-session-readback.test.ts` mirroring the mock setup of
    `onboarding-assistant-cover-letter.test.ts` (`vi.hoisted()` mocks for `@/lib/auth/admin`
    `requireAdmin`, `@/lib/db` sourcing model reads, `@/lib/env`): (a) an admin caller gets
    `{ candidates: [...] }` with `fitBefore`, `fitAfter`, and `questions[].answer` present and
    NO `isCorrect`/`isOpen`/`satisfiedNeed`/`needsSnapshot` key anywhere in the JSON;
    (b) a non-admin (`requireAdmin` returns its 404 response) gets 404 and NO db read runs.
    THEN, in the SAME file (mock `createSourcingRun`, `findActiveCandidate`,
    `completeCandidate`, `queueCandidateQuestions` from `@/lib/sourcing/session-dal` and
    `generateGapQuestions` from `@/lib/sourcing/questions` as spies, plus the
    aggregate/rank/report deps the POST route uses — mock `buildReports` so each shown
    candidate's displayed `fitPercent` is deterministic), import `POST` from
    `@/app/api/admin/sourcing/route` and prove the >=60 trigger EXECUTABLY: (c) a candidate
    whose displayed `fitPercent` is 58 is NOT passed to `queueCandidateQuestions`; (d) a
    candidate at 60 AND a candidate at 62 are EACH queued exactly once with
    `fitBefore === fitPercent` (60 and 62 respectively) and `generateGapQuestions` returning
    <=5 questions; (e) when a candidate already has an active (`pending`/`delivering`) set,
    `findActiveCandidate` returns it and `completeCandidate` is called to retire it BEFORE the
    new `queueCandidateQuestions`, so only one non-completed set results. Cases (c)(d)(e) are
    REQUIRED acceptance criteria, not optional.
  - **Verify**:
    <automated>npx vitest run tests/integration/sourcing-session-readback.test.ts</automated>
    Plus: <automated>npx tsc --noEmit</automated> and a JSON-parse check that
    `messages/{en,de,fr}.json` remain valid.
  - **Done**: All three locales carry the recruiter + candidate keys, and the integration test
    proves the read-back is admin-gated and leaks no correctness data AND that the >=60 gate
    fires executably (58 excluded; 60/62 queued with `fitBefore === fitPercent`) with the
    one-active-set guard retiring any prior non-completed set.

---

## 5. Dependency graph & waves

| Wave | Tasks | Depends on |
|------|-------|-----------|
| 2 | T1 (route + endpoint), T2 (card UI), T3 (i18n + test) | 11-1 |

Depends on 11-1 for `session-dal` + `generateGapQuestions`. T1 (server) and T2 (client) touch
different files; T3 owns the messages files + the test. `messages/*.json` are touched only in
this wave (Plan 3 consumes but does not edit them), so there is no same-wave file overlap.

---

## 6. Threat model

**Trust boundaries**

| Boundary | Description |
|----------|-------------|
| client → read-back endpoint | A caller could request another run's / candidate's Q&A. |
| persisted session → recruiter card | Server-only fields must not reach the browser. |
| recruiter JSON → generation LLM | Sanitized needs steer the generation prompt. |

**STRIDE register**

| Threat ID | Category | Component | Severity | Disposition | Mitigation |
|-----------|----------|-----------|----------|-------------|-----------|
| T-11-05 | Elevation of Privilege | `GET /api/admin/sourcing/session` | high | mitigate | `requireAdmin()` runs FIRST (404 before any DB read); integration test (b) asserts 404 + no db call. |
| T-11-06 | Information Disclosure | read-back / card payload | high | mitigate | `readBackForRecruiter` returns only `{ prompt, answer, fitBefore, fitAfter }`; test (a) asserts no `isCorrect`/`isOpen`/`satisfiedNeed`/`needsSnapshot`. |
| T-11-07 | Denial of Service | synchronous generation in the POST | medium | mitigate | Only <=3 shown candidates at >=60% qualify; parallel `Promise.all`; bounded `max_tokens`; wrapped in try/catch so a failure never blocks the response (Pitfall 6). |
| T-11-08 | Information Disclosure | Profile slide-over on Sourcing | low | mitigate | Page is admin-gated; `AdminProfilePanel` self-fetches from the admin-gated users endpoint — no new data path exposed. |
| T-11-SC | Tampering | npm/pip/cargo installs | n/a | accept | No new packages (RESEARCH: Package Legitimacy Gate N/A). |

---

## 7. Goal-Backward Verification

Goal (outcome): *A recruiter running sourcing sees a Profile slide-over per candidate and,
for every >=60% candidate, a persisted question-set that later shows the Q&A and a
"[before] -> [now]" change — with no candidate-side secrets ever reaching the card.*

Truths and where satisfied:

1. **Profile opens the Admin profile without navigating away.** — T2 button + slide-over. →
   SGQ-01
2. **Every >=60% shown candidate gets <=5 queued gap questions at run time (58% excluded),
   with at most one active set per candidate.** — T1 §2 hook gated on `fitPercent >= 60` +
   one-active-set guard, pinned executably by T3 (c)(d)(e). → SGQ-02
3. **The recruiter sees the Q&A and before->now on any visit.** — T1 read-back + T2 card
   section (Postgres-backed, survives reloads). → SGQ-05
4. **No correctness / recruiter secret leaks to the card.** — T1 strip + T3 test (a). →
   SGQ-05, SGQ-06
5. **Build stays green; EN/DE/FR carry every new user-facing string.** — T3 keys + `npm run
   build`. → SGQ-06

**Reachability**: `createSourcingRun`/`queueCandidateQuestions` (Plan 1) gain their
production callers in T1; `readBackForRecruiter` is called by T1's endpoint and consumed by
T2's card fetch; the candidate keys added in T3 are consumed by Plan 3's UI (declared
dependent). No orphaned exports.

**Non-regression**: The generation hook is wrapped so it never alters or fails the existing
`SourcingResponse`; base-ranking `localStorage` restore is preserved; no schema change; Phase
10 assistant/interview/cover-letter code is untouched.

---

## 8. Success criteria

- [ ] Sourcing POST (keyed to `gate.userId`) persists a run + queued questions for every >=60%
      shown candidate (fitBefore = displayed `fitPercent`), skips <60, retires any prior
      non-completed set (one active set per candidate), degrades silently, and never breaks the
      response.
- [ ] An integration assertion proves the >=60 gate executably: 58% NOT queued; 60% and 62%
      queued with `fitBefore === fitPercent` (REQUIRED).
- [ ] `readBackForRecruiter` selects the most-recent-by-createdAt SourcingCandidate per
      candidate regardless of status.
- [ ] `GET /api/admin/sourcing/session` is `requireAdmin`-gated (404 before DB) and returns
      before->now + Q&A with no server-only fields.
- [ ] Each Sourcing card has a Profile slide-over (reusing `AdminProfilePanel`) and a Q&A +
      "[before] -> [now]" section.
- [ ] EN/DE/FR carry the recruiter + candidate-facing keys; all three JSON files stay valid.
- [ ] `sourcing-session-readback.test.ts` proves admin gating + zero correctness leakage.
- [ ] `npx tsc --noEmit` and `npm run build` pass 0 errors.

<output>
Create `.planning/phases/11-sourcing-skill-gap-questions-profile-button-opens-admin-prof/11-2-SUMMARY.md` when done.
</output>
