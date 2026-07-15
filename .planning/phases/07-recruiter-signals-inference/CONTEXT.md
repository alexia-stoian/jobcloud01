# Phase 7 Context: Recruiter Signals Inference (Invisible)

Source brief: `prompts/signals.txt`

## What we are building
An **invisible** recruiter-signals inference system layered onto the existing AI career assistant. It gauges 11 recruiter-relevant candidate signals through natural conversation, forced-choice questions, mock interviews, and CV cross-referencing — during onboarding and all services — WITHOUT revealing to the job seeker that these signals are measured. Signals persist across sessions and are surfaced ONLY to a dev/admin/recruiter-facing panel.

## The 11 signals
**A. Motivation Profile (rank top 1–2 with evidence)**
1. Money-driven
2. Stability-driven
3. Personal-growth-driven
4. Technical-growth-driven

**B. Behavioral & Fit**
5. Job-hopper pattern vs. circumstantial (store the REASON)
6. Real primary motivation vs. stated (flag when they differ)
7. Behavior under stress/pressure (mock interview + pressure answers)

**C. Skill & Trajectory**
8. True skill proficiency vs. claimed level
9. Independent worker vs. needs supervision
10. Sustained effort vs. early-enthusiasm-that-fades
11. Overqualified and likely to be bored

## Data-gathering mechanisms (7)
1. Multi-signal questions (one answer updates many signals)
2. Forced-choice questions (binary/ranked, multiple-choice button UI)
3. CV cross-reference & contradiction detection
4. Consistency checks over time (same signal asked in different forms; align→boost, contradict→lower+flag)
5. Confidence-gap-driven questioning (after every input, target the lowest-confidence signals; stop at high confidence)
6. Passive response-style analysis (length, "we" vs "I", unprompted salary talk, effort trend)
7. Mock interview as signal goldmine

## Confidence model
- Each signal has a 0–100% confidence score, recalculated after EVERY user input (raise on corroboration, lower on contradiction, hold otherwise).
- Per signal store: `{ signal_name, inferred_value, confidence_score, evidence[], contradiction_flags[], last_updated, session_id, update_history[] }`.
- Fully explainable/auditable — log what evidence moved each score.

## Question discipline (hard rule)
Every question must be EITHER (a) a genuine job-seeking/career question serving the user's actual needs, OR (b) a strategic signal-gathering question that ALSO doubles as a legitimately helpful career question. No random/filler/small-talk/off-topic questions. If no service need and all signals sufficiently confident, do not invent a question. Stay strictly within job-search/hiring scope; use the standard off-topic redirect otherwise.

## Strict non-disclosure (critical)
- User must NEVER be told signals exist, are measured, or influence anything.
- NEVER reveal question intent; never surface/hint/reflect signals back ("you seem money-driven" is forbidden).
- If asked whether they're assessed: answer high-level ("I tailor guidance to your profile") without exposing signals/scores/recruiter purpose.
- Signals are exclusively for the recruiter-facing layer and the dev/admin right-side panel.

## Persistence
- Save signals + scores + evidence + contradiction flags + update history to the candidate profile DB (reuse the Phase 6 artifact/memory DB layer).
- On return, load existing signals and keep refining (don't restart). Continue cross-session consistency checks.

## Dev/admin UI panel
Live "Recruiter Signals" panel on the RIGHT side of the Onboarding conversation (same side/style as existing progress markers). Dev/admin/recruiter ONLY — NOT visible to the job seeker. Each signal shows:
- Starts at 0% ("Not yet assessed")
- Live 0–100% confidence bar updating in real-time after every user input
- Inferred value on hover/click (e.g., "Motivation: Technical-growth 🔧 — 75%")
- Contradiction flags highlighted visually

## Non-negotiable constraints
- All existing functionality (onboarding, CV extraction, cover letters, interview prep, coaching, artifact memory) must remain unchanged.
- Reuse existing infra: Prisma/Postgres, the onboarding assistant route, CV extraction, mock interview, artifact DB layer, cheerful emoji personality.
- Switzerland-first EN/DE/FR must not regress.
