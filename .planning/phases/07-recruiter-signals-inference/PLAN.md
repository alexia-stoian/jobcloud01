# Phase 7 Plan: Recruiter Signals Inference (Invisible)

**Phase Goal**: Recruiters (dev/admin layer only) get evidence-backed, continuously-updated confidence scores (0–100%) for 11 recruiter-relevant candidate signals, inferred **invisibly** from natural conversation, forced-choice questions, CV cross-referencing, and mock interviews — the job seeker never knows signals are being measured. Signals persist across sessions and surface ONLY in a dev/admin/recruiter-only right-side panel.

**Requirements**: SIGNAL-INFER-01, SIGNAL-CONFIDENCE-02, SIGNAL-EVIDENCE-03, SIGNAL-PERSIST-04, SIGNAL-NONDISCLOSURE-05, SIGNAL-ADMIN-UI-06, SIGNAL-QUESTION-DISCIPLINE-07

**Depends on**: Phase 6 (artifact/memory DB + persistence pattern), Phase 4 (mock interview/services), Phase 2 (onboarding + CV extraction).

**Estimated Waves**: 9

---

## 1. Scope

### In scope
- A **new isolated module tree** under `src/lib/ai/signals/` (engine, question selection, definitions, prompts, DAL) plus one Prisma model, one admin API route, and one dev/admin-only UI panel.
- LLM-based inference (single Claude call per user input) that is **evidence-grounded**: every score change cites a verbatim quote or observed behavior; contradictions are flagged; update history is appended.
- Non-blocking, failsafe hooks into three existing flows: onboarding assistant route, interactive answers route, and mock-interview answer storage.
- Strict question discipline + strict non-disclosure guards.
- i18n (EN/DE/FR) for the admin panel labels only (signals themselves are language-agnostic).

### Explicitly OUT of scope
- ❌ Changing any existing user-facing behavior, copy, or response text.
- ❌ Vector store / embeddings / semantic retrieval for signals (LLM re-evaluation only).
- ❌ A recruiter dashboard outside onboarding (only the right-side onboarding panel this phase).
- ❌ Auth/role infrastructure beyond a simple dev/admin/recruiter flag gate (`SIGNALS_ADMIN_ENABLED` env + optional per-user allowlist).
- ❌ Analytics, aggregation across candidates, or export.
- ❌ Rewriting CV extraction or the mock-interview engine (read-only consumption of their outputs).

### Guardrails (non-negotiable)
- Signals must **NEVER** leak into any user-facing string. No signal names, values, scores, or intent are ever sent to the job seeker.
- All existing functionality (onboarding, CV extraction, cover letters, interview prep, coaching, artifact memory) remains byte-for-byte unchanged in behavior.
- Inference is fire-and-forget: if it throws, times out, or returns malformed JSON, the user request completes normally.
- Reuse existing infra: Prisma/Postgres, `@/lib/db`, the `ANTHROPIC_MODEL` env + `anthropic-version: 2023-06-01` header, and the "pick first `type === "text"` content block" pattern.

---

## 2. Data Model

New Prisma model `CandidateSignalState` — one row per user holding all 11 signals as structured JSON (single-row-per-user keeps reads/writes atomic and matches the Phase 6 FK convention: **`userId String` → `User.id` (cuid/TEXT, NOT uuid)**).

```prisma
model CandidateSignalState {
  id          String   @id @default(cuid())
  userId      String   @unique
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Array of 11 SignalRecord objects (see SignalRecord type in signal-definitions.ts).
  // Each: { key, name, category, inferredValue, confidence (0-100),
  //         evidence: EvidenceItem[], contradictionFlags: ContradictionFlag[],
  //         lastUpdated: ISO string, sessionId, updateHistory: UpdateEvent[] }
  signals     Json     @default("[]")

  // Cross-session bookkeeping
  lastSessionId String?
  inputCount    Int      @default(0)   // how many user inputs have been processed
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([userId])
}
```

Add the back-relation `candidateSignalState CandidateSignalState?` to `model User` (alongside `storedArtifacts StoredArtifact[]`).

**Migration command**:
```bash
npx prisma migrate dev --name add_candidate_signal_state
```

> Note: signals are stored as a JSON array (not 11 columns) so evidence/history/contradiction sub-structures stay flexible and auditable. The DAL owns the shape.

---

## 3. Signal Inference Engine

New module `src/lib/ai/signals/` with these files:

### 3a. `signal-definitions.ts` — the 11 signals + types
Exports the canonical registry and shared TypeScript types.

```ts
export type SignalCategory = "motivation" | "behavioral" | "skill";
export interface EvidenceItem { quote: string; source: "message" | "cv" | "mock_interview" | "forced_choice"; at: string; }
export interface ContradictionFlag { description: string; conflicting: string[]; at: string; }
export interface UpdateEvent { at: string; from: number; to: number; reason: string; sessionId?: string; }
export interface SignalRecord {
  key: string; name: string; category: SignalCategory;
  inferredValue: string | null;      // e.g. "Technical-growth" | "job-hopper (circumstantial)"
  confidence: number;                // 0-100
  evidence: EvidenceItem[];
  contradictionFlags: ContradictionFlag[];
  lastUpdated: string | null;
  sessionId: string | null;
  updateHistory: UpdateEvent[];
}
```

**The 11 signal keys** (seed each at `confidence: 0`, `inferredValue: null`):
1. `money_driven` (motivation) — prioritizes comp, negotiates, asks salary/bonus early.
2. `stability_driven` (motivation) — security, tenure, established companies, low risk.
3. `personal_growth_driven` (motivation) — learning, mentorship, new responsibilities.
4. `technical_growth_driven` (motivation) — cutting-edge tech, skill depth, technical challenge.
5. `job_hopper_vs_circumstantial` (behavioral) — CV tenure pattern; store the REASON in `inferredValue`.
6. `real_vs_stated_motivation` (behavioral) — true driver; flag when it differs from claimed.
7. `stress_behavior` (behavioral) — composure under pressure (mock-interview + pressure answers).
8. `true_vs_claimed_proficiency` (skill) — gap between CV claims and demonstrated depth.
9. `independent_vs_supervised` (skill) — autonomy / decision-making style ("we" vs "I").
10. `sustained_vs_fading_effort` (skill) — follow-through vs early-enthusiasm-that-fades.
11. `overqualified_bored_risk` (skill) — seniority significantly exceeds target role demands.

### 3b. `signal-dal.ts` — persistence
- `loadSignalState(userId): Promise<SignalRecord[]>` — reads row; if none, returns seeded 11-signal array (does NOT create the row).
- `saveSignalState(userId, signals, sessionId): Promise<void>` — upserts row, sets `lastSessionId`, increments `inputCount`, bumps `updatedAt`.
- `seedSignals(): SignalRecord[]` — pure factory returning the 11 zeroed records from the registry.
- Uses `db.candidateSignalState` from `@/lib/db`. Casts `signals` Json ↔ `SignalRecord[]`.

### 3c. `prompt.ts` — the inference prompt contract
`buildInferencePrompt({ newInput, source, cvFacts, priorSignals, sessionId })` returns a system+user prompt that instructs Claude to:
- Re-evaluate ONLY signals plausibly touched by `newInput` (+ any CV contradiction it surfaces).
- For each touched signal return: new `confidence`, `inferredValue`, one `evidence` quote (verbatim from input/CV), and any `contradictionFlag`.
- **Scoring rules** (embed verbatim in the prompt):
  - Raise confidence on corroboration (new evidence agrees with prior value).
  - Lower confidence on contradiction (new evidence conflicts) AND emit a `contradictionFlag`.
  - Hold (no change) when the input carries no signal for that marker.
  - Never exceed 100 or drop below 0. Never invent evidence — if there is no verbatim support, do not change the score.
  - Once a signal is ≥ 85, treat it as saturated: only update on a real contradiction.
- **Output schema** (Claude must return ONLY this JSON, no prose):
```json
{
  "updates": [
    {
      "key": "technical_growth_driven",
      "inferredValue": "Technical-growth",
      "confidence": 72,
      "evidence": { "quote": "I love working with the newest frameworks", "source": "message" },
      "contradiction": null
    }
  ]
}
```
- `contradiction` is either `null` or `{ "description": "...", "conflicting": ["CV: 4 jobs in 3 years", "user: 'I value stability'"] }`.

### 3d. `engine.ts` — orchestrator
`inferSignals({ userId, newInput, source, cvFacts, sessionId }): Promise<SignalRecord[]>`:
1. `loadSignalState(userId)` → prior signals.
2. Build prompt via `prompt.ts`; call Claude once (`ANTHROPIC_MODEL`, header `anthropic-version: 2023-06-01`, pick first `type === "text"` block).
3. Parse JSON strictly; on parse failure → log + return prior signals unchanged (no throw).
4. `mergeUpdates(prior, updates, sessionId)` — pure reducer that applies each update:
   - Appends `EvidenceItem`, appends `ContradictionFlag` if present, appends `UpdateEvent { from, to, reason }`, sets `lastUpdated`/`sessionId`, enforces 0–100 clamp and the ≥85 saturation rule.
5. `saveSignalState(userId, merged, sessionId)`.
6. Returns merged signals (caller may ignore).
- `source: "message" | "interactive_answer" | "mock_interview" | "forced_choice"`.

- **Expected (Wave 2)**: `import { inferSignals } from '@/lib/ai/signals/engine'` compiles; called with a sample message it returns 11 records with at least one updated confidence + evidence quote; malformed Claude output returns priors unchanged without throwing.

---

## 4. Integration Points (non-blocking, failsafe)

Add a single fire-and-forget helper `runInferenceSafely(args)` in `src/lib/ai/signals/hook.ts` that wraps `inferSignals` in `try/catch`, never rejects, and is awaited only far enough to not block the response (call without `await`, or `void`-fire before returning). It reads `cvFacts` from `onboardingSession.cvExtractedFacts` when available.

### Hook A — Onboarding assistant route
File: `src/app/api/onboarding/assistant/route.ts`. Immediately BEFORE the final `return NextResponse.json({ answer });` (line ~874), add:
```ts
void runInferenceSafely({
  userId: session.user.id,
  newInput: userMessage,
  source: "message",
  cvFacts: onboardingSession?.cvExtractedFacts,
  sessionId: onboardingSession?.id,
});
```
Also add the same `void runInferenceSafely({...})` before the early target-role return (line ~315) so no input is skipped. No other lines change.

### Hook B — Interactive answers route
File: `src/app/api/onboarding/interactive/route.ts`. In the POST handler, AFTER the answer is saved to the profile field, add one `void runInferenceSafely({ userId, newInput: `${field}: ${value}`, source: "interactive_answer", ... })`. This captures forced-choice/multiple-choice answers.

### Hook C — Mock interview answers
File: `src/app/api/onboarding/assistant/route.ts`, inside the existing `storeInterviewQA(...)` block (line ~840). After the Q&A is stored, add `void runInferenceSafely({ userId, newInput: userMessage, source: "mock_interview", ... })` so pressure/curveball answers feed `stress_behavior` and `real_vs_stated_motivation`.

- **Expected (Wave 3)**: Each hook is a single `void runInferenceSafely(...)` call; `npm run build` passes; if inference throws internally the user still receives their normal `answer`. No existing response text changes.

---

## 5. Question Selection (Mechanism 5 + Discipline)

New file `src/lib/ai/signals/question-selection.ts`.

- `selectSignalQuestion({ signals, serviceNeedActive }): ForcedChoiceQuestion | null`:
  - Returns `null` when a real service need is active (never hijack a service turn) OR when all signals are ≥ the probe threshold (default 60) OR when the lowest-confidence signal is already ≥ 85.
  - Otherwise ranks signals ascending by confidence, picks the lowest, and returns the highest-value question mapped to it from the bank — **only if that question also doubles as a genuinely helpful career question**.
- `ForcedChoiceQuestion` = `{ signalKeys: string[]; prompt: string; options: { label: string; value: string }[] }`.
- **Discipline gate**: export `justifyQuestion(q): string` returning the internal rationale ("targets `<key>` at N% AND helps with `<career purpose>`"). A question with no career purpose is never in the bank.

**Forced-choice question bank (examples, mapped to signals)** — presented cheerfully with the existing multiple-choice button UI:
| Prompt | Options | Signals moved |
|---|---|---|
| "Quick one 🎯 — what matters most in your next role?" | 💰 Pay / 📚 Learning / 🛡️ Security / 🔧 Cutting-edge tech | motivation profile (1–4) |
| "Structure or freedom?" | Clear direction / Freedom to figure it out | `independent_vs_supervised` |
| "Work pace?" | Fast & dynamic / Steady & focused | `stress_behavior` |
| "Two offers: 20% more pay but boring, OR exciting but less pay?" | More pay / More exciting | `money_driven` vs growth |
| "Deep expert in one area, or versatile across many?" | Deep expert / Versatile | `true_vs_claimed_proficiency` |
| "What made you start looking?" (multi-signal, free text) | — | `real_vs_stated_motivation`, `stability_driven` |

> This module is provided for the discipline logic and is wired into the assistant only where a service turn is NOT active. This phase ships the selector + bank + justification; it does not force questions into every turn (respects "don't invent a question").

- **Expected (Wave 4)**: `selectSignalQuestion` returns `null` when `serviceNeedActive` is true; returns the lowest-confidence signal's question otherwise; every bank entry passes `justifyQuestion` (has a career purpose).

---

## 6. Persistence + Cross-Session

- On the first inference of a session, `engine.ts` already loads prior signals via `loadSignalState` and **refines** (never reseeds) — confidence and evidence accumulate across sessions.
- Add `runConsistencyPass(signals, newInput)` inside `engine.ts`: when a new answer restates a previously-asked signal in a different form, the prompt is told to compare against stored evidence and either boost (aligned) or lower + flag (contradiction). Pass the top 2 lowest-confidence prior evidence snippets into the prompt as "prior claims to check against".
- `saveSignalState` increments `inputCount` and records `lastSessionId` so we can tell first-turn-of-session (for a lightweight session-start consistency check).
- **Expected (Wave 5)**: Second session for the same user loads existing signals (row reused, `inputCount` continues rising); a contradicting later answer lowers confidence and appends a `contradictionFlag` referencing the earlier evidence.

---

## 7. Non-Disclosure Guard

New file `src/lib/ai/signals/nondisclosure.ts`.

- `assertNoSignalLeak(userFacingText): void` (dev/test guard) — throws if the outgoing text contains any signal name/key or scoring vocabulary ("money-driven", "job hopper", "confidence score", "assessed", "recruiter signal", etc.). Wire it as a lightweight check only in non-production/test to catch regressions; it must NOT alter production text.
- `handleAssessmentQuestion(userMessage): string | null` — if the user asks "am I being assessed / scored / evaluated?", returns the sanctioned high-level line ("I tailor my guidance to your profile so the advice fits you 🙂") WITHOUT exposing signals, scores, or recruiter purpose; returns `null` otherwise. The assistant route may use this to answer such questions safely.
- Documented rule set (in the module header): inference output is NEVER concatenated into `answer`; the engine's return value is used only by the admin API; no signal vocabulary appears in any user-facing prompt or response.
- **Expected (Wave 6)**: `assertNoSignalLeak` throws on a string containing "you seem money-driven"; `handleAssessmentQuestion("am I being assessed?")` returns the safe line; grep confirms no signal keys are interpolated into `answer`.

---

## 8. Dev/Admin-Only API + UI Panel

### 8a. Admin API — `src/app/api/admin/signals/route.ts` (GET)
- Auth: requires a logged-in session AND the dev/admin/recruiter gate: `env.SIGNALS_ADMIN_ENABLED === "true"` (add to `src/lib/env.ts`) plus optional allowlist `SIGNALS_ADMIN_USER_IDS`. If gate fails → `404` (not 403, to avoid revealing the endpoint exists).
- Query: `?userId=<id>` (defaults to the caller's own id). Returns `{ signals: SignalRecord[], inputCount, updatedAt }` via `loadSignalState`.
- Never callable from the user-facing chat; purely read-only.

### 8b. UI Panel — `src/components/onboarding/RecruiterSignalsPanel.tsx`
- Renders ONLY when a client-visible flag is set (e.g. `NEXT_PUBLIC_SIGNALS_ADMIN === "true"`). Job seekers never receive the component in the tree otherwise.
- Placed as a sibling inside the right-side region of `OnboardingCvUploadForm.tsx` (the `img3-chat__right--conversation` area, matching existing progress-marker styling).
- Shows all 11 signals grouped by category. Each row: name, live 0–100% confidence **bar**, inferred value (on hover/click, e.g. "Motivation: Technical-growth 🔧 — 75%"), and a visual contradiction badge when `contradictionFlags.length > 0`. Signals at 0% show "Not yet assessed".
- **Refresh**: after every user input the form already triggers a fetch; the panel re-fetches `GET /api/admin/signals` on each successful assistant/interactive response (subscribe to the same "message sent" state, or poll every ~4s while the panel is mounted). No websockets required.

### 8c. Minimal wiring in `OnboardingCvUploadForm.tsx`
- Import and conditionally render `<RecruiterSignalsPanel userId={...} refreshKey={history.length} />` inside the right-side `section`. `refreshKey` change triggers re-fetch. This is the only edit to the component and it is gated so default (job-seeker) rendering is unchanged.

- **Expected (Wave 7 + 8)**: With the admin flag ON, the panel shows 11 bars that move after each input and highlight contradictions; with the flag OFF (default), `GET /api/admin/signals` returns 404 and the panel does not render for job seekers.

---

## 9. Task Breakdown into WAVES

Each wave is independently executable by a gsd-executor. File paths are explicit; every task ends with **Expected:** acceptance. Waves are ordered by dependency.

### Wave 1 — Data model + DAL + definitions
- **T1.1** Add `model CandidateSignalState` to `prisma/schema.prisma` and the `candidateSignalState` back-relation on `User`. Run `npx prisma migrate dev --name add_candidate_signal_state`; run `npx prisma generate`.
  - **Expected**: Migration file exists under `prisma/migrations/`, `db.candidateSignalState` is typed, `npm run build` compiles.
- **T1.2** Create `src/lib/ai/signals/signal-definitions.ts` with all types + the 11-signal registry + `seedSignals()`.
  - **Expected**: 11 zeroed `SignalRecord`s returned by `seedSignals()`; strict-TS clean.
- **T1.3** Create `src/lib/ai/signals/signal-dal.ts` (`loadSignalState`, `saveSignalState`) reusing `@/lib/db` and the Phase-6 `userId String` FK convention.
  - **Expected**: Load returns seeded array when no row; save upserts and increments `inputCount`.

### Wave 2 — Inference engine (depends on Wave 1)
- **T2.1** Create `src/lib/ai/signals/prompt.ts` (`buildInferencePrompt`) encoding the scoring rules + strict JSON output schema (Section 3c).
  - **Expected**: Prompt includes all 11 signal keys, the raise/lower/hold rules, the ≥85 saturation rule, and a single-object JSON schema.
- **T2.2** Create `src/lib/ai/signals/engine.ts` (`inferSignals`, `mergeUpdates`, `runConsistencyPass`) — one Claude call, strict parse, failsafe fallback to priors, pure reducer merge with clamp + history.
  - **Expected**: Returns 11 records; a valid Claude response updates ≥1 confidence with an evidence quote; malformed JSON returns priors unchanged without throwing.

### Wave 3 — Integration hooks (depends on Wave 2)
- **T3.1** Create `src/lib/ai/signals/hook.ts` (`runInferenceSafely`) — never-rejecting wrapper.
  - **Expected**: Rejections inside are swallowed and logged; resolves `void`.
- **T3.2** Add `void runInferenceSafely(...)` at the two return points (~315, ~874) in `src/app/api/onboarding/assistant/route.ts`, and inside the `storeInterviewQA` block (~840, `source: "mock_interview"`).
  - **Expected**: `npm run build` passes; user `answer` text is unchanged; inference runs on every message.
- **T3.3** Add `void runInferenceSafely(...)` after answer-save in `src/app/api/onboarding/interactive/route.ts` (`source: "interactive_answer"`).
  - **Expected**: Interactive answers feed inference; existing save/return behavior unchanged.

### Wave 4 — Question selection + discipline (depends on Wave 1)
- **T4.1** Create `src/lib/ai/signals/question-selection.ts` (`selectSignalQuestion`, `justifyQuestion`, forced-choice bank).
  - **Expected**: Returns `null` when `serviceNeedActive`; picks lowest-confidence signal's question otherwise; every bank entry has a career purpose.

### Wave 5 — Persistence + cross-session (depends on Wave 2)
- **T5.1** Extend `engine.ts` consistency pass to pass prior low-confidence evidence into the prompt and confirm cross-session refine-not-restart via `signal-dal.ts`.
  - **Expected**: Reopened session reuses the row and continues accumulating; contradiction lowers score + appends flag referencing earlier evidence.

### Wave 6 — Non-disclosure guard (depends on Wave 2)
- **T6.1** Create `src/lib/ai/signals/nondisclosure.ts` (`assertNoSignalLeak`, `handleAssessmentQuestion`).
  - **Expected**: Guard throws on signal-vocabulary leak (test/dev only); assessment question returns the safe high-level line; no signal keys appear in `answer`.

### Wave 7 — Admin API (depends on Waves 1, 6)
- **T7.1** Add `SIGNALS_ADMIN_ENABLED` (+ optional `SIGNALS_ADMIN_USER_IDS`, `NEXT_PUBLIC_SIGNALS_ADMIN`) to `src/lib/env.ts`.
- **T7.2** Create `src/app/api/admin/signals/route.ts` GET — gate returns 404 when disabled; returns `{ signals, inputCount, updatedAt }` when enabled.
  - **Expected**: Flag ON → 200 with signals; flag OFF → 404; unauthorized → 401.

### Wave 8 — Admin UI panel (depends on Wave 7)
- **T8.1** Create `src/components/onboarding/RecruiterSignalsPanel.tsx` — 11 grouped rows, live confidence bars, hover value, contradiction badges, "Not yet assessed" at 0%, gated by `NEXT_PUBLIC_SIGNALS_ADMIN`.
- **T8.2** Conditionally render `<RecruiterSignalsPanel refreshKey={history.length} />` inside the right-side `img3-chat__right--conversation` region of `src/components/onboarding/OnboardingCvUploadForm.tsx` (only edit to this file).
  - **Expected**: Flag ON → bars update after each input, contradictions highlighted; flag OFF (default) → panel absent, job-seeker view unchanged.

### Wave 9 — i18n + verification (depends on Wave 8)
- **T9.1** Add admin-panel label keys (`recruiterSignals.*`: title, "Not yet assessed", category headings, contradiction label) to `messages/en.json`, `messages/de.json`, `messages/fr.json` via next-intl.
  - **Expected**: Panel labels resolve in EN/DE/FR; no missing-key warnings.
- **T9.2** Full verification pass (Section 10) + `npm run build` (0 errors) + manual smoke of onboarding as a normal user (flag OFF) to confirm zero behavior change.
  - **Expected**: All 8 success criteria met; build clean; existing flows unchanged.

---

## 10. Verification Checklist (mapped to the 8 success criteria)

1. **All 11 signals, 0–100%, recalculated every input** → After 3 varied inputs, `GET /api/admin/signals` shows movement across motivation/behavioral/skill signals; `inputCount` == number of inputs. ✅ SC-1
2. **Evidence-backed, contradiction flags, update history, auditable** → Each moved signal has ≥1 `evidence.quote` (verbatim), and a CV-vs-statement conflict produces a `contradictionFlag`; `updateHistory` records `from→to` with reasons. ✅ SC-2
3. **Persist + reload + refine across sessions** → Log out/in (new session), signals reload from the same row and continue accumulating, not reset; cross-session contradiction lowers + flags. ✅ SC-3
4. **7 mechanisms blended naturally** → Multi-signal free-text (Hook A), forced-choice (Hook B / bank), CV contradiction (prompt uses `cvFacts`), consistency pass (Wave 5), confidence-gap selection (Wave 4), passive style ("we" vs "I", unprompted salary in prompt rules), mock-interview mining (Hook C). ✅ SC-4
5. **Strict question discipline** → `selectSignalQuestion` returns `null` on service turns / saturated signals; every bank entry passes `justifyQuestion`. ✅ SC-5
6. **Strict non-disclosure** → `assertNoSignalLeak` catches leaks in tests; `handleAssessmentQuestion` gives the safe line; grep confirms engine output never enters `answer`. ✅ SC-6
7. **Dev/admin-only right-side panel** → With flag ON, panel shows live bars + values + contradiction highlights on the right side of onboarding; with flag OFF, 404 + no component for job seekers. ✅ SC-7
8. **All existing functionality unchanged** → `npm run build` passes with **0 errors**; onboarding assistant, interactive Q&A, CV extraction, cover letters, interview prep, and artifact memory behave identically with the flag OFF (default). ✅ SC-8

**Global gate**: `npm run build` must pass with 0 TypeScript errors, and a normal job-seeker run (flag OFF) must be indistinguishable from pre-Phase-7 behavior.

---

## Deliverables
1. `prisma/schema.prisma` — `CandidateSignalState` model + `User` back-relation + migration.
2. `src/lib/ai/signals/signal-definitions.ts` — types + 11-signal registry + `seedSignals()`.
3. `src/lib/ai/signals/signal-dal.ts` — load/save.
4. `src/lib/ai/signals/prompt.ts` — prompt contract + JSON schema.
5. `src/lib/ai/signals/engine.ts` — `inferSignals`, merge reducer, consistency pass.
6. `src/lib/ai/signals/hook.ts` — `runInferenceSafely` (failsafe).
7. `src/lib/ai/signals/question-selection.ts` — selector + bank + discipline.
8. `src/lib/ai/signals/nondisclosure.ts` — leak guard + assessment-question handler.
9. `src/app/api/admin/signals/route.ts` — gated GET.
10. `src/components/onboarding/RecruiterSignalsPanel.tsx` — dev/admin panel.
11. Minimal hooks in `src/app/api/onboarding/assistant/route.ts`, `src/app/api/onboarding/interactive/route.ts`, `src/components/onboarding/OnboardingCvUploadForm.tsx`.
12. Env additions in `src/lib/env.ts` + i18n keys in `messages/{en,de,fr}.json`.
