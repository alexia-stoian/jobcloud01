---
status: resolved
trigger: "On the Onboarding page of candidates with >=60% sourcing score, the assistant does not display the expected recruiter skill-gap questions"
created: 2026-07-20
updated: 2026-07-20
---

## Resolution (2026-07-20)

Two independent root causes, both fixed and verified live end-to-end.

### Root cause 1 — stale Prisma client in the running dev server (operational)
The dev server (`npm run dev`) loads the Prisma client ONCE at startup (singleton in
`src/lib/db.ts`) and does not hot-reload it. Phase 11's migration + `prisma generate`
ran while the dev server was alive; the Wave-1 Windows `EPERM` (a running node holds
`query_engine-windows.dll`) blocked the engine swap, so the running server kept a
PRE-Phase-11 client with NO `sourcingSession`/`sourcingCandidate`/... models. At a
sourcing run, `createSourcingRun` → `db.sourcingSession.create` threw on the stale
client; the route's `try/catch` swallowed it, so `SourcingSession` stayed 0 and no
questions were ever generated.
**Fix:** stop the dev server (releases the .dll lock) → `npx prisma generate` (now
succeeds) → restart. After restart, `SourcingSession` persists on a run. Not a code
bug — inherent to Prisma + a long-lived dev server across a migration; restart after
schema changes.

### Root cause 2 — gap-less high-match candidates got 0 questions (code)
`generateGapQuestions` derived topics ONLY from checklist items with `status !== "met"`
and returned `[]` when there were none. The candidates that qualify (fit % ≥ 60) are
the strongest matches and often have ZERO unmet requirements (verified: Julien 95–96%,
checklist all ✓), so NO questions were generated — violating the spec ("ANY user ≥60%
gets questions; can cover skills, languages, experience, personality traits, any other
relevant details").
**Fix (`src/lib/sourcing/questions.ts`):** when unmet gaps < 5, supplement with
`buildStrengtheningTopics(needs, gaps)` — depth-on-required-skills, nice-to-haves,
languages, preferred-signal personality topics, role/seniority fit, a standout
achievement, team-alignment — so a qualifying candidate always gets 1–5 questions.
Prompt reframed from "close the gap" to "show strength/fit on this topic" (correct-option
semantics unchanged). Test updated: gap-less + non-empty needs → questions; gap-less +
empty needs → `[]` (no LLM call).

### Verified live
- Recruiter run (Julien 95%) → `SourcingSession` persisted, `SourcingCandidate` with 5
  queued questions (Java/JS/Node/SQL depth + GraphQL), 5 options each.
- Julien's Onboarding page shows: "🎉 Great news — a recruiter is interested in you!…"
  then the first question one-at-a-time with 4 options + "write your own answer"
  (correct option shuffled off position 1).
- `npm run build` 0 errors; `questions.test.ts` 6/6.

### Test-data note
For verification: promoted `uitest_...@example.com` to ADMIN and set a known password
for `julien.moreau@gmail.com` (dev DB only).
