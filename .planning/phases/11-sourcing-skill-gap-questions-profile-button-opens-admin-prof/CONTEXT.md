# Phase 11 — Sourcing Skill-Gap Questions

## Intent (from user)

Extend the recruiter **Sourcing** page and the candidate **Onboarding** assistant so a recruiter's interest can trigger a personalized, gamified "close-the-gap" Q&A for strong candidates, with the results (and the match-% change) surfaced back to the recruiter.

### The 5 deliverables
1. **Profile button on Sourcing** — each of the 3 displayed candidates gets a "Profile" button that opens the exact Admin > Profile view for that user.
2. **Skill-gap questions for high matches** — for any candidate with match % ≥ 60, the assistant (in a new **Sourcing mode**) automatically generates follow-up questions to help them close the gap and become a stronger fit. Questions may cover skills, languages, experience, personality traits, or anything else pulled from the recruiter's JSON.
3. **Question delivery (Onboarding page)** — questions are delivered **one at a time** by the assistant (Sourcing mode) on that user's Onboarding page, personalized to that user's needed skills. Before asking, the assistant must **notify the user a recruiter is interested** and that they need to answer. Format: **multiple choice, 5 options** — 1 correct, 3 incorrect/irrelevant (not what the recruiter wants), 1 open "write your own answer". The user is **never told if an answer was correct** — the assistant just moves to the next question. **Max 5 questions** per user. When done, the assistant thanks them, tells them that if the recruiter chooses them they'll be contacted, then **exits Sourcing mode**.
4. **Scoring & visibility** — each answer feeds the user's overall match % . The Sourcing card must display: the questions asked, the answers the user gave, and the % change as **"[before] -> [now]"**.
5. **Tone & personality** — keep the established cheerful, enthusiastic, emoji-rich tone throughout (see `prompts/prompt.txt`). (Mock-interview is the only mode that dials emojis down — this flow stays cheerful.)

## Locked decisions (discuss)

1. **Profile button → slide-over panel.** Reuse the existing `AdminProfilePanel` component in a slide-over/modal on the Sourcing page (no navigation away). Same view as Admin > Profile for the selected user.
2. **Generate at sourcing run, deliver on next onboarding visit.** When the recruiter runs sourcing, questions are generated per ≥60% candidate and **queued**; the user receives them the next time they open their Onboarding page.
3. **% change is LLM-driven; an increase must be visible.** The assistant (LLM) decides on its own how each answer affects the candidate's match %, but a satisfactory answer must produce a **visible percentage increase**. (Not a fixed deterministic formula. The base profile is not necessarily rewritten — answers live in the sourcing session and inform the re-scored match.)
4. **Open answers judged silently by the assistant (LLM).** The "write your own answer" option is evaluated by the assistant for whether it satisfies the recruiter's requirement; the user is never told the outcome.
5. **Persist a sourcing session.** Store the recruiter run + generated questions + user answers + before/after % so the recruiter sees the Q&A and the "[before] -> [now]" change whenever they revisit the Sourcing page.

## Behavioral rules (must hold)
- Sourcing mode is entered on the user's Onboarding page ONLY when they have pending recruiter questions; it takes priority, delivers ≤5 questions one at a time, then exits back to the normal assistant.
- Never reveal correctness; no "correct/incorrect" feedback — just advance.
- Notify the user up-front that a recruiter is interested.
- End with a cheerful thank-you + "if the recruiter chooses you, you'll be contacted", then leave Sourcing mode.
- Cheerful emoji tone throughout (per prompts/prompt.txt).

## Scope

**In scope**
- Sourcing card "Profile" button → slide-over reusing `AdminProfilePanel` (admin-gated data already available).
- On a sourcing run: for each shown candidate with fit % ≥ 60, generate ≤5 personalized gap questions (5-option multiple choice: 1 correct, 3 distractors, 1 open) from the recruiter JSON gaps; persist them queued to that user.
- Onboarding assistant "Sourcing mode": detect pending questions, notify, deliver one-at-a-time, capture answers (choice or free text), never reveal correctness, thank + exit after ≤5.
- LLM re-scores the candidate's match % from the answers (visible increase for good answers); persist before/after and the Q&A.
- Sourcing card shows: questions asked, user answers, and "[before] -> [now]".
- Persisted sourcing session so results survive reloads / re-visits.
- Cheerful emoji tone throughout. No regressions; `npm run build` 0 errors; EN/DE/FR preserved where user-facing.

**Out of scope**
- Real-time push to the recruiter while the user answers (recruiter sees updates on next Sourcing view/refresh).
- Multiple concurrent recruiter question-sets per user (one active recruiter run at a time is acceptable for MVP — confirm in planning if needed).
- Contacting the candidate / messaging flow (only the "you'll be contacted" message).
- Changing the deterministic scoring engine's formula (the answer-driven % change is LLM-driven per decision 3).

## Existing building blocks (reuse)
- **Sourcing**: `src/components/admin/SourcingPage.tsx` (cards), `src/app/api/admin/sourcing/route.ts`, `src/lib/sourcing/*` (aggregate/score/report/types), `SourcingResult` (has `checklist`, `summary`, fit %).
- **Admin profile view**: `src/components/admin/AdminProfilePanel.tsx` (already a slide-in panel with per-user data via `GET /api/admin/users/{id}`).
- **One-at-a-time multiple-choice delivery** already exists: `src/lib/onboarding/interactive.ts` (`InteractiveQuestion` with `options`, `allowCustom`) + `src/app/api/onboarding/interactive/route.ts` + the onboarding UI. The Sourcing-mode questions can reuse this delivery pattern/UI.
- **Assistant state machine**: `src/types/assistant-state.ts`, `src/app/api/onboarding/assistant/route.ts` (phases greeting/profile-collection/services). Add a Sourcing-mode path that takes priority when pending questions exist.
- **Tone**: `prompts/prompt.txt` (cheerful, emoji-rich; only mock-interview reduces emojis).
- **Recruiter needs / gaps**: `src/lib/sourcing/recruiter-needs.ts`, `buildMatchChecklist` (met/unmet per requirement) is the natural source of "gaps" to turn into questions.

## Open questions for research/planning
- Persistence model: new Prisma models (e.g. `SourcingSession`, `SourcingQuestion`, `SourcingAnswer`) vs. reuse of existing artifact/onboarding tables. Must tie questions to (candidate user, recruiter run) and store before/after %.
- How the recruiter run identifies "the recruiter" (sourcing is currently stateless per JSON upload) — need a persisted run id.
- Where the LLM re-score happens (on each answer, or once after the set) and how the visible increase is guaranteed.
- Reusing `AdminProfilePanel` inside the Sourcing page (it currently lives in the admin dashboard context — verify data fetch + admin gating hold).

## Deferred ideas
- Real-time recruiter notification while answering.
- Multiple simultaneous recruiter question-sets per candidate.
- A full recruiter→candidate messaging/contact flow.
