---
phase: 11-sourcing-skill-gap-questions
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - prisma/migrations
  - src/lib/sourcing/anthropic.ts
  - src/lib/sourcing/questions.ts
  - src/lib/sourcing/rescore.ts
  - src/lib/sourcing/session-dal.ts
  - src/lib/sourcing/questions.test.ts
  - src/lib/sourcing/rescore.test.ts
autonomous: true
requirements:
  - SGQ-02
  - SGQ-04
  - SGQ-05
  - SGQ-06

must_haves:
  truths:
    - "Four additive Prisma models (SourcingSession -> SourcingCandidate -> SourcingQuestion -> SourcingAnswer) exist with cuid ids, camelCase fields, JSON option arrays, cascade deletes, and indices mirroring InterviewSession -> InterviewQuestion; the migration touches no existing table."
    - "generateGapQuestions(needs, result) turns ONLY unmet/partial checklist items into <=5 grounded MCQs, each with exactly one correct option, three distractors, a shuffled option order, and an appended open 'write your own answer' option, with server-only isCorrect/isOpen flags retained on the returned objects."
    - "A stripPublicOptions(question) helper removes isCorrect/isOpen (and any gapLabel/server context) so nothing correctness-revealing can leave the server."
    - "rescoreFromAnswers({ fitBefore, goodAnswers, llmAfter }) clamps to max(llmAfter, fitBefore + max(1, goodAnswers)) capped at 100 when goodAnswers > 0, and returns fitBefore unchanged when goodAnswers is 0 — never a decrease for good answers."
    - "session-dal exposes create-run, queue-questions, read-next-pending, record-answer, and read-back helpers scoped by candidateUserId, all typed against the new Prisma client."
    - "Unit tests prove the gap filter, the 5-option shape + option stripping, and the visible-increase clamp; the whole library type-checks and npm run build stays 0 errors."
  artifacts:
    - prisma/schema.prisma
    - src/lib/sourcing/anthropic.ts
    - src/lib/sourcing/questions.ts
    - src/lib/sourcing/rescore.ts
    - src/lib/sourcing/session-dal.ts
    - src/lib/sourcing/questions.test.ts
    - src/lib/sourcing/rescore.test.ts
  key_links:
    - "generateGapQuestions consumes result.checklist (status !== 'met') + needs as its gap source and calls callAnthropic from the shared anthropic.ts util, salvaging JSON via parseLlmJson."
    - "rescoreFromAnswers(...) is the single clamp Plan 3 calls after all answers are captured; its goodAnswers input = correct choices + satisfiedNeed open answers."
    - "session-dal is the ONLY module Plans 2 and 3 use to read/write the sourcing tables (create run in 11-2, deliver/answer/re-score in 11-3)."
---

<objective>
Lay the additive persistence + pure-logic foundation for Phase 11: four new Prisma models
(a recruiter run, its per-candidate question-set, the questions, and the answers) plus one
migration; a shared Anthropic call/JSON-salvage util; the grounded gap-question generator;
the visible-increase re-score clamp; a data-access layer scoped by candidate; and unit
tests pinning the generator shape, option stripping, and the clamp.

Purpose: Isolate every risky new piece (schema, LLM generation, the D3 visible-increase
guarantee, candidate-scoped DAL) in pure, testable modules BEFORE any route or UI is
touched, so the recruiter (Plan 2) and candidate (Plan 3) surfaces are thin wiring over a
verified core. All work is additive — the build never breaks.
Output: 4 Prisma models + 1 safe migration, 4 new sourcing libs, 2 unit test files. No
route, UI, or existing-table changes in this plan.
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

# Copy these patterns — do not rebuild
@prisma/schema.prisma
@src/lib/sourcing/report.ts
@src/lib/sourcing/score.ts
@src/lib/sourcing/types.ts
@src/lib/env.ts
@tests/integration/_setup-env.ts
</context>

---

## 1. Scope

### In scope
- Four additive Prisma models in `prisma/schema.prisma`
  (`SourcingSession -> SourcingCandidate -> SourcingQuestion -> SourcingAnswer`) mirroring the
  `InterviewSession -> InterviewQuestion` shape, plus the generated migration (SGQ-05, SGQ-06).
- `src/lib/sourcing/anthropic.ts`: a shared `callAnthropic(prompt, maxTokens)` + `parseLlmJson`
  salvage helper extracted as house-pattern copies (NOT by editing `report.ts`).
- `src/lib/sourcing/questions.ts`: `generateGapQuestions(needs, result)` (LLM, grounded in
  unmet/partial checklist gaps), plus `stripPublicOptions` (SGQ-02).
- `src/lib/sourcing/rescore.ts`: `rescoreFromAnswers(...)` clamp guaranteeing a visible
  increase for good answers (SGQ-04).
- `src/lib/sourcing/session-dal.ts`: candidate-scoped create/read/update helpers (SGQ-05).
- Unit tests: `questions.test.ts` (gap filter + shape + strip), `rescore.test.ts` (clamp).

### Explicitly OUT of scope
- ❌ Editing `src/lib/sourcing/report.ts` (leave Phase 9 code untouched — copy, don't refactor).
- ❌ Any route handler (`sourcing/route.ts`, delivery endpoint) — Plans 2 and 3.
- ❌ Any UI (`SourcingPage.tsx`, `OnboardingCvUploadForm.tsx`) — Plans 2 and 3.
- ❌ Message keys / EN·DE·FR — Plans 2 and 3.
- ❌ Changes to any existing table or column (migration is purely additive).

### Guardrails (non-negotiable)
- The migration MUST be additive only (new tables; no altered/dropped columns) so it deploys
  safely with no backfill (RESEARCH Pitfall 5).
- `isCorrect` / `isOpen` are SERVER-ONLY fields; `stripPublicOptions` is the single choke
  point that guarantees they never leave the server. Correctness must never be inferable
  from a public option object.
- `callAnthropic` reads the key server-side only (strip whitespace), never logs it, and
  returns `null` on missing key / non-ok / timeout / parse failure — never throws (mirror
  `report.ts:52`). Feature degrades to "no questions generated" when the key is absent.
- Windows dev locks the Prisma DLL — type-check with `npx tsc --noEmit` and run Prisma CLI
  steps with the dev server stopped.

---

## 2. Data model contract (`prisma/schema.prisma`)

Mirror `InterviewSession -> InterviewQuestion` (`schema.prisma:200-240`): cuid ids, camelCase,
`Json` for arrays, `@@index`, `onDelete: Cascade`.

- `SourcingSession` — one recruiter run: `recruiterUserId`, `needsSnapshot Json`
  (SERVER-ONLY, sanitized `RecruiterNeeds`), `roleLabel String?`, timestamps,
  `candidates SourcingCandidate[]`, `@@index([recruiterUserId, createdAt])`.
- `SourcingCandidate` — one queued question-set for one candidate: `sessionId`,
  `candidateUserId`, `fitBefore Int`, `fitAfter Int?`, `status String @default("pending")`
  (`pending | delivering | completed`), timestamps, relation to session (cascade),
  `questions SourcingQuestion[]`, `@@index([candidateUserId, status])`, `@@index([sessionId])`.
  "One active set per candidate" is app-enforced (no DB unique) so history is preserved.
- `SourcingQuestion` — `candidateId`, `orderIndex Int`, `gapLabel String` (SERVER-ONLY),
  `prompt String @db.Text`, `options Json` (`[{ value, label, isCorrect, isOpen }]` — the
  correct/open flags are SERVER-ONLY), `allowCustom Boolean @default(true)`, timestamp,
  relation (cascade), `answer SourcingAnswer?`, `@@unique([candidateId, orderIndex])`,
  `@@index([candidateId, orderIndex])`.
- `SourcingAnswer` — `questionId String @unique`, `chosenValue String?`,
  `freeText String? @db.Text`, `satisfiedNeed Boolean @default(false)` (SERVER-ONLY silent
  judgment), timestamp, relation (cascade).

## 3. Re-score clamp contract (`rescore.ts`)

```
rescoreFromAnswers(args: {
  fitBefore: number;      // the displayed fitPercent at generation time (0..100)
  goodAnswers: number;    // correct choices + satisfiedNeed open answers
  llmAfter: number;       // the LLM's proposed new fit % (0..100, pre-clamp)
}): number
```

- `const llm = clampInt(llmAfter, 0, 100)`.
- `if (goodAnswers <= 0) return clampInt(fitBefore, 0, 100)` — no visible change when nothing
  landed.
- `const minVisible = Math.min(100, fitBefore + Math.max(1, goodAnswers))`.
- `return Math.max(llm, minVisible)` — never below a visible bump for good answers (D3).

---

## 4. Task Breakdown (wave-ordered, atomically committable)

### Wave 1 — Foundation (additive only)

- **T1 — Prisma models + additive migration**
  - **Files**: `prisma/schema.prisma`, `prisma/migrations`
  - **Action**: Add the four models from §2 to the END of `prisma/schema.prisma`, copying
    the exact conventions of `InterviewSession`/`InterviewQuestion` (`schema.prisma:200-240`):
    cuid `@id`, camelCase fields, `Json @default("[]")`/`@default("{}")` for arrays/objects,
    `@db.Text` for long text, `DateTime @default(now())`/`@updatedAt`, `onDelete: Cascade` on
    every child relation, and the indices listed in §2 including the
    `@@unique([candidateId, orderIndex])` on `SourcingQuestion`. Do NOT add relations onto or
    modify any existing model (candidate/recruiter ids are plain `String` columns, like
    `CandidateSignalState` stores ids). Generate the migration with `npm run prisma:migrate`
    (name it `sourcing_sessions`); if no database is reachable in the executor environment,
    fall back to `npx prisma migrate dev --name sourcing_sessions --create-only` to emit the
    SQL file, then `npm run prisma:generate` so the Prisma client types compile. Confirm the
    generated `migration.sql` contains only `CREATE TABLE`/`CREATE INDEX` statements and no
    `ALTER`/`DROP` on pre-existing tables.
  - **Verify**:
    <automated>npx prisma validate && npx tsc --noEmit</automated>
    Plus: grep the newest `prisma/migrations/*/migration.sql` and confirm it references
    `SourcingSession`, `SourcingCandidate`, `SourcingQuestion`, `SourcingAnswer` and contains
    no `ALTER TABLE`/`DROP` against existing tables.
  - **Done**: The four additive models exist, `prisma validate` passes, the Prisma client
    regenerates so downstream libs type-check, and the migration is provably additive.

- **T2 — Shared Anthropic util + grounded generator + re-score clamp**
  - **Files**: `src/lib/sourcing/anthropic.ts`, `src/lib/sourcing/questions.ts`,
    `src/lib/sourcing/rescore.ts`
  - **Action**: Create `anthropic.ts` exporting `callAnthropic(prompt, maxTokens)` and
    `parseLlmJson<T>(raw): T | null`. Copy the `callAnthropic` body verbatim in behavior from
    `report.ts:52` (server-only key read with whitespace strip, `ANTHROPIC_MODEL` sanitized,
    `thinking:{type:"disabled"}`, `x-api-key` + `anthropic-version: 2023-06-01` headers,
    `AbortController` ~55s timeout cleared in `finally`, `cache: "no-store"`, concatenate text
    parts, return `null` on missing key / non-ok / any thrown error). `parseLlmJson` strips a
    leading/trailing ```` ```json ```` fence, attempts `JSON.parse`, and on failure applies a
    light salvage (collapse literal CR/LF inside strings, unwrap a single-element array) then
    retries once, returning `null` if still unparseable. Do NOT import from or edit
    `report.ts`. Then create `questions.ts` exporting `generateGapQuestions(needs, result)`:
    derive gaps as `result.checklist.filter((c) => c.status !== "met").map((c) => c.label)`;
    if there are no gaps or `callAnthropic` returns `null`, return `[]` (graceful degrade);
    build a strict-JSON, gap-grounded prompt (ground ONLY in the supplied gap labels + role,
    request at most 5 questions, each with a `prompt`, a `gapLabel`, and exactly four options
    where one has `isCorrect:true` and three `isCorrect:false`, plus an `allowOpen` flag);
    parse via `parseLlmJson`; for each question shuffle the four provided options, then append
    a fifth open option `{ label: "write your own answer", isOpen: true, isCorrect: false }`
    and set `allowCustom:true`; assign `orderIndex` 0..n and cap the list to 5. Also export
    `stripPublicOptions(question)` that maps options to `{ value, label, description }` only —
    dropping `isCorrect`/`isOpen` and any server context — for candidate delivery. Then create
    `rescore.ts` exporting `rescoreFromAnswers(args)` implementing the §3 clamp plus a local
    `clampInt(n, lo, hi)`.
  - **Verify**:
    <automated>npx tsc --noEmit</automated>
    Plus: grep confirms `anthropic.ts` contains `anthropic-version` and a `catch` returning
    `null`; `questions.ts` exports `generateGapQuestions` and `stripPublicOptions`;
    `rescore.ts` exports `rescoreFromAnswers`.
  - **Done**: The generator produces gap-grounded 5-option MCQs with server-only flags and a
    public-strip helper, the clamp guarantees a visible increase, and none of it imports or
    mutates `report.ts`.

- **T3 — Candidate-scoped DAL + unit tests**
  - **Files**: `src/lib/sourcing/session-dal.ts`, `src/lib/sourcing/questions.test.ts`,
    `src/lib/sourcing/rescore.test.ts`
  - **Action**: Create `session-dal.ts` (server-only, imports the Prisma client from
    `@/lib/db`) exporting: `createSourcingRun({ recruiterUserId, needsSnapshot, roleLabel })`
    → creates a `SourcingSession`; `queueCandidateQuestions({ sessionId, candidateUserId,
    fitBefore, questions })` → creates a `SourcingCandidate` (status `pending`) with its
    nested `SourcingQuestion` rows (persisting the FULL options incl. server flags);
    `getPendingCandidate(candidateUserId)` → the newest `SourcingCandidate` with
    `status != "completed"` for that user, including its questions ordered by `orderIndex` and
    their answers (returns `null` when none); `recordAnswer({ questionId, chosenValue,
    freeText, satisfiedNeed })` → upserts a `SourcingAnswer`; `completeCandidate({
    candidateId, fitAfter })` → sets `status="completed"` + `fitAfter`; and
    `readBackForRecruiter(candidateUserIds)` → per candidate `{ candidateUserId, fitBefore,
    fitAfter, questions: [{ prompt, chosenLabel|freeText }] }` (SERVER strips `isCorrect`/
    `isOpen`/`gapLabel`/`satisfiedNeed` from the shape it returns). EVERY candidate-facing
    read/write MUST be scoped by `candidateUserId` (never trust a client-supplied candidate
    id alone). THEN write `questions.test.ts` (import `tests/integration/_setup-env` side
    effect FIRST so `@/lib/env` validates, then mock `fetch`): (u1) gaps are derived from
    `checklist` items with `status !== "met"` only — a `met` item never becomes a question;
    (u2) a mocked LLM response yields questions each with exactly 5 options (1 correct, 3
    distractors, 1 open) and `stripPublicOptions` output contains no `isCorrect`/`isOpen` key;
    (u3) when `fetch` is non-ok / no key, `generateGapQuestions` returns `[]`. THEN write
    `rescore.test.ts`: (r1) `goodAnswers > 0` and a low `llmAfter` still returns
    `>= fitBefore + max(1, goodAnswers)` (visible increase); (r2) `goodAnswers = 0` returns
    `fitBefore` unchanged; (r3) result never exceeds 100 and an LLM value higher than the
    floor is preserved.
  - **Verify**:
    <automated>npx vitest run src/lib/sourcing/questions.test.ts src/lib/sourcing/rescore.test.ts</automated>
    Plus: <automated>npx tsc --noEmit</automated>
  - **Done**: The DAL is candidate-scoped and typed against the new models, and green unit
    tests pin the gap filter, the 5-option strip, and the visible-increase clamp.

---

## 5. Dependency graph & waves

| Wave | Tasks | Depends on |
|------|-------|-----------|
| 1 | T1 (schema+migration), T2 (util+generator+clamp), T3 (DAL+tests) | — |

T1 must land first so the Prisma client types exist for the DAL; T2 writes independent lib
files; T3 imports T1's client and T2's `generateGapQuestions`/`rescoreFromAnswers`. No file
is written by two tasks.

---

## 6. Threat model

**Trust boundaries**

| Boundary | Description |
|----------|-------------|
| recruiter JSON gaps → generator LLM | Sanitized needs steer the generation prompt. |
| LLM question JSON → persisted options | `isCorrect`/`isOpen` are minted here and must stay server-only. |
| stored options → any future response | Only `stripPublicOptions` output may reach a candidate. |

**STRIDE register**

| Threat ID | Category | Component | Severity | Disposition | Mitigation |
|-----------|----------|-----------|----------|-------------|-----------|
| T-11-01 | Information Disclosure | server-only option flags (`isCorrect`/`isOpen`) | high | mitigate | `stripPublicOptions` is the single choke point; unit test (u2) asserts stripped output carries no correctness key; DAL read-back also strips. |
| T-11-02 | Tampering / Injection | generator prompt steered by recruiter JSON | medium | mitigate | Ground prompt ONLY in sanitized gap labels + role (needs already sanitized by `parseRecruiterNeeds`); request STRICT JSON; bounded `max_tokens`. |
| T-11-03 | Tampering (unsafe migration) | additive schema change | medium | mitigate | New tables only — grep-verified no `ALTER`/`DROP` on existing tables; no backfill needed (Pitfall 5). |
| T-11-04 | Information Disclosure | LLM key handling in `anthropic.ts` | high | mitigate | Key read server-side, whitespace-stripped, never logged/returned; `null` on any failure (mirror `report.ts`). |
| T-11-SC | Tampering | npm/pip/cargo installs | n/a | accept | No new packages — Anthropic via raw `fetch` (RESEARCH: Package Legitimacy Gate N/A). |

---

## 7. Goal-Backward Verification

Goal (outcome): *A verified, additive foundation — persistence + generator + visible-increase
clamp + candidate-scoped DAL — exists and type-checks, with correctness data provably
server-only, before any route or UI is wired.*

Truths and where satisfied:

1. **Recruiter runs, question-sets, questions, and answers can be persisted relationally.** —
   T1 models + migration. → SGQ-05
2. **Only real gaps become questions; each is a 5-option MCQ with server-only correctness.** —
   T2 `generateGapQuestions` + `stripPublicOptions`, pinned by T3 (u1)(u2). → SGQ-02
3. **A good answer always yields a visible increase; a decrease is impossible.** — T2/§3
   clamp, pinned by T3 (r1)(r2)(r3). → SGQ-04
4. **Every candidate read/write is scoped by candidate identity.** — T3 `session-dal`
   helpers. → SGQ-05
5. **The migration is safe and the build stays green.** — T1 additive-only migration +
   `prisma validate` + `tsc`. → SGQ-06

**Reachability**: `session-dal` gains its production callers in Plan 2 (`createSourcingRun` +
`queueCandidateQuestions` in the sourcing route; `readBackForRecruiter` in the read-back
endpoint) and Plan 3 (`getPendingCandidate`/`recordAnswer`/`completeCandidate` in the delivery
endpoint) — both declared dependents. `generateGapQuestions` is called by Plan 2;
`rescoreFromAnswers` and `stripPublicOptions` by Plan 3. Nothing is orphaned; each export is a
named acceptance target of a later plan and is exercised now by unit tests.

**Non-regression**: All work is additive — new models, new files, no edit to `report.ts` or
any existing table — so `npm run build` and the existing sourcing suite stay green.

---

## 8. Success criteria

- [ ] Four additive models exist in `prisma/schema.prisma`; a `sourcing_sessions` migration is
      generated and provably additive (no `ALTER`/`DROP` on existing tables).
- [ ] `npx prisma validate` passes and the Prisma client regenerates.
- [ ] `anthropic.ts`, `questions.ts`, `rescore.ts`, `session-dal.ts` exist and type-check;
      `report.ts` is untouched.
- [ ] `questions.test.ts` proves the unmet/partial gap filter, the 5-option shape, and that
      `stripPublicOptions` output carries no `isCorrect`/`isOpen`.
- [ ] `rescore.test.ts` proves the visible-increase clamp (floor, no-good-answer no-op, 100
      cap).
- [ ] `npx tsc --noEmit` and `npm run build` pass 0 errors.

<output>
Create `.planning/phases/11-sourcing-skill-gap-questions-profile-button-opens-admin-prof/11-1-SUMMARY.md` when done.
</output>
