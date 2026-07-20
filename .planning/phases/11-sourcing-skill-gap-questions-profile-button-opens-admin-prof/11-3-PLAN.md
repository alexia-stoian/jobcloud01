---
phase: 11-sourcing-skill-gap-questions
plan: 3
type: execute
wave: 3
depends_on:
  - 11-1
  - 11-2
files_modified:
  - src/app/api/onboarding/sourcing-questions/route.ts
  - src/components/onboarding/OnboardingCvUploadForm.tsx
  - tests/integration/sourcing-delivery.test.ts
autonomous: true
requirements:
  - SGQ-03
  - SGQ-04
  - SGQ-05
  - SGQ-06

must_haves:
  truths:
    - "GET /api/onboarding/sourcing-questions returns the next pending question for the signed-in user as an InteractiveResponse-shaped MCQ (5 public options, allowCustom), preceded on the first question by the 'a recruiter is interested' notice — with isCorrect/isOpen stripped."
    - "POST captures the answer (chosen option value or free text), silently judges an open answer via the LLM (satisfiedNeed), advances orderIndex, and NEVER returns any correctness signal."
    - "The flow is bounded to <=5 questions; after the last answer it runs the re-score with the visible-increase clamp, persists fitAfter + status='completed', and returns the cheerful thank-you + 'you'll be contacted', then exits Sourcing mode."
    - "Every read/write is scoped to session.user.id owning the SourcingCandidate; a candidate can never reach another user's question-set."
    - "OnboardingCvUploadForm prioritizes pending sourcing questions on load — the interactive init effect is gated on the async sourcing check completing so it cannot fire first — renders them through the existing option-button UI via a synthetic stable `field` set on BOTH the history entry and currentQuestion, tags option clicks as chosenValue and custom input as freeText, bypasses the off-track nudge in sourcing mode, shows the notify banner, and never routes sourcing answers through Phase 10 target-role/interview detection."
    - "An integration test proves >=60 triggers delivery, one-at-a-time 5-option MCQ, correctness never revealed, <=5 cap, answers persist with a visible before->now increase, and Phase 10 routing is bypassed; npm run build passes 0 errors."
  artifacts:
    - src/app/api/onboarding/sourcing-questions/route.ts
    - src/components/onboarding/OnboardingCvUploadForm.tsx
    - tests/integration/sourcing-delivery.test.ts
  key_links:
    - "GET → getPendingCandidate(session.user.id) → stripPublicOptions(next question) + notice on first; POST → recordAnswer(...) (+ silent LLM judge for free text) → on completion rescoreFromAnswers({ fitBefore, goodAnswers, llmAfter }) → completeCandidate({ candidateId, fitAfter })."
    - "OnboardingCvUploadForm load sequence: fetch GET sourcing-questions FIRST and gate the interactive init effect (OnboardingCvUploadForm.tsx:706-713) on that check completing; if a question exists, render it + banner via a synthetic `sourcing:<questionId>` field set on BOTH the history entry and currentQuestion and short-circuit loadInteractiveQuestion (OnboardingCvUploadForm.tsx:283); option clicks POST { questionId, chosenValue }, the custom input POSTs { questionId, freeText }, to the dedicated endpoint, never /assistant, with off-track nudging bypassed."
    - "goodAnswers = count(correct chosen options) + count(satisfiedNeed open answers); the re-score LLM call uses callAnthropic from anthropic.ts (11-1)."
---

<objective>
Deliver the candidate side end-to-end: a dedicated, session-scoped onboarding endpoint that
serves the queued gap questions one at a time as `InteractiveResponse`-shaped MCQs (notify
first, correctness never revealed, <=5 cap), silently judges open answers, and on completion
re-scores with the visible-increase clamp and persists before->now + a cheerful thank-you.
Wire `OnboardingCvUploadForm` to prioritize these questions on load through the existing
option-button UI — bypassing Phase 10's target-role/interview routing entirely — and prove
the full loop with an integration test.

Purpose: Deliver D3 delivery (one-at-a-time notify-first MCQ, thank + exit), D4 (silent open
judging), and the D3 scoring guarantee (visible increase) over the Plan 1 core, reading the
question-sets Plan 2 queued.
Output: One new delivery endpoint, one edited onboarding form, and one integration test. No
schema, message-file, or Phase 10 route change.
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
@.planning/phases/11-sourcing-skill-gap-questions-profile-button-opens-admin-prof/11-2-PLAN.md

# Reuse — do not rebuild
@src/lib/sourcing/session-dal.ts
@src/lib/sourcing/rescore.ts
@src/lib/sourcing/anthropic.ts
@src/lib/onboarding/interactive.ts
@src/app/api/onboarding/interactive/route.ts
@src/components/onboarding/OnboardingCvUploadForm.tsx
@src/app/api/onboarding/assistant/route.ts
@tests/integration/onboarding-assistant-cover-letter.test.ts
@tests/integration/_setup-env.ts
</context>

---

## 1. Scope

### In scope
- New `src/app/api/onboarding/sourcing-questions/route.ts`: `GET` next pending question
  (`InteractiveResponse` shape, notice on first, options stripped) and `POST` capture-answer
  (silent open-judge, advance, <=5), re-score + complete on the final answer (SGQ-03, SGQ-04,
  SGQ-05).
- Edit `src/components/onboarding/OnboardingCvUploadForm.tsx`: on load, check the sourcing
  endpoint FIRST; if a question is pending, render it + the notify banner and short-circuit
  the normal `loadInteractiveQuestion` flow; POST sourcing answers to the dedicated endpoint
  (SGQ-03).
- New `tests/integration/sourcing-delivery.test.ts` covering the full loop (SGQ-03, SGQ-04,
  SGQ-05, SGQ-06).

### Explicitly OUT of scope
- ❌ Any Prisma schema / migration change (Plan 1 owns the models).
- ❌ Editing `messages/*.json` (Plan 2 added the candidate keys; this plan only consumes them).
- ❌ Editing `src/app/api/onboarding/assistant/route.ts`, `interactive/route.ts`, or the Phase
  10 target-role detector — sourcing answers bypass those routes entirely (Pitfall 3).
- ❌ The recruiter card / read-back (Plan 2).
- ❌ Showing the candidate any running % (CONTEXT: candidate is told "you'll be contacted",
  not numbers).

### Guardrails (non-negotiable)
- EVERY read/write is scoped to `session.user.id`: verify
  `SourcingCandidate.candidateUserId === session.user.id` before serving OR accepting an
  answer (RESEARCH Security: Elevation/Tampering). Reject mismatches with 404.
- The candidate response NEVER contains `isCorrect`, `isOpen`, `satisfiedNeed`, the re-score
  number, `needsSnapshot`, `gapLabel`, or the recruiter identity. Serve only
  `stripPublicOptions` output + neutral advance/done states (behavioral rule: never reveal
  correctness).
- Bounded to <=5 questions; after the last one, run `rescoreFromAnswers` (visible-increase
  clamp), `completeCandidate`, and return the thank-you + "you'll be contacted", then the flow
  exits (subsequent GET returns `done`).
- Sourcing questions take PRIORITY over the normal profile/interactive flow on load, but are
  delivered ONLY through the dedicated endpoint + option buttons — they must not pass through
  `/assistant` target-role/interview routing (Pitfall 3). Enter Sourcing mode only when a
  pending candidate exists.
- Free-text answers are untrusted: clamp length in the route before the silent-judge prompt,
  which grounds ONLY on whether the answer meets the recruiter's need and returns a boolean.

---

## 2. Delivery endpoint contract (`sourcing-questions/route.ts`)

`nodejs` / `force-dynamic`. Auth: the signed-in candidate (`auth()` session); no admin gate.

- `GET`: `getPendingCandidate(session.user.id)`. If none → `{ done: true }`. Else find the
  first question with no answer (ordered by `orderIndex`); if all answered → `{ done: true }`.
  Return `{ question: { id, prompt, options: stripPublicOptions(q), allowCustom }, notice:
  <recruiterInterested text on the FIRST (orderIndex 0) question else undefined>, done: false,
  answeredCount }`. Set `status="delivering"` on first serve.
- `POST` `{ questionId, chosenValue?, freeText? }`: load the question via the candidate scope
  (reject if its candidate's `candidateUserId !== session.user.id` → 404). Determine
  `satisfiedNeed`: for a chosen option, `= that option's isCorrect` (read server-side, never
  returned); for free text, clamp length then one focused `callAnthropic` silent-judge → bool.
  `recordAnswer({ questionId, chosenValue, freeText, satisfiedNeed })`. If this was the last
  question (answered count reaches the question count, capped at 5): compute
  `goodAnswers = correct choices + satisfiedNeed open answers`, one re-score `callAnthropic`
  → `llmAfter`, `fitAfter = rescoreFromAnswers({ fitBefore, goodAnswers, llmAfter })`,
  `completeCandidate({ candidateId, fitAfter })`, and return `{ done: true, message:
  <thankYou text> }`. Else return `{ done: false }` with NO correctness field (the client
  then GETs the next question).

---

## 3. Task Breakdown (wave-ordered, atomically committable)

### Wave 3 — Candidate delivery + re-score

- **T1 — Dedicated sourcing delivery + silent judge + re-score endpoint**
  - **Files**: `src/app/api/onboarding/sourcing-questions/route.ts`
  - **Action**: Create the route per §2. Resolve the session via the project's `auth()` helper
    (same import the interactive route uses); return 401/redirect for no session as the
    existing onboarding routes do. Import `getPendingCandidate`, `recordAnswer`,
    `completeCandidate` from `@/lib/sourcing/session-dal`, `stripPublicOptions` from
    `@/lib/sourcing/questions`, `rescoreFromAnswers` from `@/lib/sourcing/rescore`, and
    `callAnthropic` from `@/lib/sourcing/anthropic`. GET: fetch the pending candidate scoped to
    `session.user.id`, pick the first unanswered question, strip options, attach the localized
    `recruiterInterested` notice ONLY on `orderIndex === 0`, and return the
    `InteractiveResponse`-shaped payload (resolve the locale from the onboarding session /
    request as the interactive route does). POST: parse+validate the body, load the question
    ONLY through the candidate-scoped path and 404 on any `candidateUserId` mismatch; compute
    `satisfiedNeed` (chosen → server-side `isCorrect`; free text → length-clamp then a focused
    `callAnthropic` silent judge returning a strict boolean, defaulting to `false` on a null
    LLM result); `recordAnswer(...)`; when the set is complete (<=5), compute `goodAnswers`,
    run the re-score `callAnthropic`, apply `rescoreFromAnswers`, `completeCandidate`, and
    return the cheerful thank-you (`thankYou` key) + `{ done: true }`; otherwise return
    `{ done: false }` carrying NO correctness. Never include `isCorrect`/`isOpen`/
    `satisfiedNeed`/the re-score number in any response.
  - **Verify**:
    <automated>npx tsc --noEmit</automated>
    Plus: grep confirms the route scopes reads to the session user, calls
    `stripPublicOptions`, `rescoreFromAnswers`, and `completeCandidate`, and that no response
    object references `isCorrect`/`satisfiedNeed`.
  - **Done**: The endpoint serves one stripped MCQ at a time (notify first), captures + silently
    judges answers scoped to the owner, and on the <=5th answer re-scores with a visible
    increase, persists before->now, and returns the thank-you — never revealing correctness.

- **T2 — Onboarding form: prioritize + render sourcing questions**
  - **Files**: `src/components/onboarding/OnboardingCvUploadForm.tsx`
  - **Action**: Add a load-time check that runs BEFORE `loadInteractiveQuestion`
    (`OnboardingCvUploadForm.tsx:283`/`:706-713`): fetch `GET /api/onboarding/sourcing-questions`
    (`cache: "no-store"`); if it returns a `question`, enter a local `sourcingMode` (state
    flag), push the `notice` (when present) as an assistant banner message and the question +
    its 5 options into `history` using the SAME `ChatMessage`/option shape the interactive flow
    already renders (`OnboardingCvUploadForm.tsx:740-770`), and DO NOT call
    `loadInteractiveQuestion` while in sourcing mode.
    - **Synthetic stable `field` (options-render gotcha):** the option UI renders options ONLY
      when `entry.field === currentQuestion?.field` (`OnboardingCvUploadForm.tsx:742`). Sourcing
      questions have no interactive `field`, so mint ONE synthetic stable field value (e.g.
      `sourcing:<questionId>`) and set it on BOTH the pushed `history` entry AND `currentQuestion`
      (call `setCurrentQuestion` with a synthetic `InteractiveQuestion`-shaped object carrying
      that same `field`), so the option buttons AND the custom input actually render. Reuse the
      same synthetic-field pattern for each subsequent sourcing question.
    - **Distinguishing `chosenValue` vs `freeText` (both call `submitAnswerValue(value)`):** the
      option buttons (`:756`) and the custom input (`:772`) BOTH funnel through
      `submitAnswerValue(value)`, which cannot itself tell them apart. In sourcing mode, tag the
      SOURCE explicitly rather than inferring from the value: the option-button `onClick` marks
      the submission as `"option"` (posting `{ questionId, chosenValue }`) and the custom-input
      submit marks it as `"freeText"` (posting `{ questionId, freeText }`) — never inferred by
      matching the submitted value against option labels (a free-text answer could coincide with
      a label).
    - **Init-effect race:** the mount effect fires `loadInteractiveQuestion` when
      `history.length === 0` (`:706-713`); the sourcing GET is async. Gate that interactive init
      effect on the sourcing-pending check having COMPLETED (e.g. a `sourcingChecked` ref/state
      that flips only after the sourcing GET resolves), so the interactive flow can never fire
      before the sourcing GET resolves — and, when sourcing is pending, does not fire at all.
    - **Off-track nudge bypass:** `submitAnswerValue` runs `isClearlyOffTrackAnswer` /
      `appendOffTrackNudge` (`:352-353`) which intercept free-form answers; in `sourcingMode`
      this MUST be bypassed so open free-text sourcing answers are never intercepted/nudged —
      short-circuit those two calls when `sourcingMode` is active.
    Route answer submission: when `sourcingMode` is active, POST to
    `/api/onboarding/sourcing-questions` (`{ questionId, chosenValue }` for an option,
    `{ questionId, freeText }` for the custom answer) instead of `/interactive` or `/assistant`;
    on `{ done: false }` fetch the next question via GET (reusing the synthetic-field render);
    on `{ done: true }` render the `message` (thank-you), clear `sourcingMode`, and fall back to
    the normal assistant/interactive flow. Never surface correctness (there is none in the
    response) and never pass sourcing text through the target-role/interview handlers. Keep all
    existing interactive/CV behavior unchanged when there is no pending sourcing question.
  - **Verify**:
    <automated>npx tsc --noEmit</automated>
    Plus: grep confirms the form fetches `/api/onboarding/sourcing-questions`, that the sourcing
    submit path posts to it (not `/assistant`), that a `sourcingMode` flag and a synthetic
    `sourcing:`-prefixed `field` are set, that the interactive init effect is gated on the
    sourcing check completing, and that `isClearlyOffTrackAnswer`/`appendOffTrackNudge` are
    bypassed in sourcing mode.
  - **Done**: On load, the sourcing GET resolves BEFORE the interactive init effect can fire; a
    candidate with pending questions sees the notify banner and answers one at a time via the
    existing option buttons (options render because a synthetic stable `field` is set on both the
    history entry and `currentQuestion`), with option clicks tagged `chosenValue` and the custom
    input tagged `freeText`, and off-track nudging bypassed; when done, the thank-you shows and
    the normal assistant resumes. Candidates with no pending set see no change.

- **T3 — Full-loop integration test**
  - **Files**: `tests/integration/sourcing-delivery.test.ts`
  - **Action**: Import `tests/integration/_setup-env` FIRST (env-import gotcha), then mirror
    the `vi.hoisted()` mock setup of `onboarding-assistant-cover-letter.test.ts`: mock
    `@/auth/config` (`auth` → a candidate session), `@/lib/db` (the sourcing model
    reads/writes used by `session-dal`), `@/lib/env` (`ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL`),
    and a `fetch` mock for the silent-judge + re-score Anthropic calls. Import `GET`/`POST`
    from `@/app/api/onboarding/sourcing-questions/route` AFTER the mocks. Cases: (a) a pending
    candidate with `fitBefore` and 5 questions → GET returns ONE question with exactly 5 public
    options, `allowCustom:true`, the `recruiterInterested` notice on the first, and NO
    `isCorrect`/`isOpen` key; (b) answering options one at a time returns `{ done: false }`
    with no correctness field until the 5th; (c) an open answer with an LLM judge returning
    "satisfied" sets `satisfiedNeed` server-side but the response still reveals nothing;
    (d) after the last answer, `completeCandidate` is called with `fitAfter` and the recorded
    `fitAfter >= fitBefore + max(1, goodAnswers)` (visible increase) and the response contains
    the thank-you `message`; (e) the flow never exceeds 5 questions; (f) a POST for a question
    whose candidate's `candidateUserId !== session.user.id` returns 404 with no write; (g) the
    delivery path calls neither the assistant nor the target-role detector (assert those mocks
    are not invoked). Keep assertions pinned to behavior — do not weaken to force green.
  - **Verify**:
    <automated>npx vitest run tests/integration/sourcing-delivery.test.ts</automated>
    Plus: <automated>npm run build</automated> passes 0 errors.
  - **Done**: A committed integration test proves the >=60 trigger delivery, one-at-a-time
    5-option MCQ, no correctness leakage, <=5 cap, visible before->now increase, owner scoping,
    and Phase 10 bypass.

---

## 4. Dependency graph & waves

| Wave | Tasks | Depends on |
|------|-------|-----------|
| 3 | T1 (endpoint), T2 (form), T3 (integration test) | 11-1, 11-2 |

Depends on 11-1 for `session-dal`/`rescore`/`anthropic`/`stripPublicOptions` and on 11-2 for
the queued question-sets + the candidate message keys. T1 (server) and T2 (client) touch
different files; T3 owns the new test. This plan edits no `messages/*.json` (consumes only), so
it never overlaps Plan 2's files within a shared wave.

---

## 5. Threat model

**Trust boundaries**

| Boundary | Description |
|----------|-------------|
| candidate → delivery endpoint | A candidate could try to read/answer another user's set. |
| stored options → candidate response | `isCorrect`/`isOpen`/re-score must never be returned. |
| free-text answer → silent-judge LLM | Untrusted text steers the judge prompt. |
| sourcing answer → Phase 10 routing | Sourcing text must not trigger role/interview modes. |

**STRIDE register**

| Threat ID | Category | Component | Severity | Disposition | Mitigation |
|-----------|----------|-----------|----------|-------------|-----------|
| T-11-09 | Elevation / Tampering | delivery GET/POST | high | mitigate | Scope every read/write to `session.user.id`; 404 on `candidateUserId` mismatch; test (f) asserts 404 + no write. |
| T-11-10 | Information Disclosure | candidate response payload | high | mitigate | Serve only `stripPublicOptions` + neutral done/advance; never return `isCorrect`/`satisfiedNeed`/re-score; tests (a)(b)(c). |
| T-11-11 | Tampering / Injection | free-text silent-judge prompt | medium | mitigate | Clamp free-text length; judge prompt grounds only on need-satisfaction and returns a strict boolean; default `false` on null. |
| T-11-12 | Tampering | Phase 10 mode collision | medium | mitigate | Dedicated endpoint + option buttons only; never route sourcing text through `/assistant`; test (g) asserts assistant/detector not invoked (Pitfall 3). |
| T-11-13 | Information Disclosure | re-score visibility to candidate | low | mitigate | Candidate is told "you'll be contacted"; no % ever returned to the candidate (CONTEXT). |
| T-11-SC | Tampering | npm/pip/cargo installs | n/a | accept | No new packages (RESEARCH: Package Legitimacy Gate N/A). |

---

## 6. Goal-Backward Verification

Goal (outcome): *A candidate with recruiter interest is notified, answers <=5 one-at-a-time
gap MCQs (never told if right), and their good answers produce a persisted, visible match-%
increase — with no recruiter secret leaked and Phase 10 modes untouched.*

Truths and where satisfied:

1. **Questions arrive one at a time as notify-first 5-option MCQs; correctness is never
   revealed.** — T1 GET/§2 + T2 render, pinned by T3 (a)(b)(c). → SGQ-03
2. **Open answers are judged silently.** — T1 silent-judge, pinned by T3 (c). → SGQ-03
3. **The set is bounded to 5, ends with a cheerful thank-you + "you'll be contacted", then
   exits Sourcing mode.** — T1 completion + T2 fallback, pinned by T3 (e). → SGQ-03
4. **Good answers persist a visible before->now increase.** — T1 `rescoreFromAnswers` +
   `completeCandidate`, pinned by T3 (d). → SGQ-04, SGQ-05
5. **A candidate can only ever touch their own set; Phase 10 routing is bypassed.** — T1 owner
   scoping + T2 dedicated path, pinned by T3 (f)(g). → SGQ-06

**Reachability**: `getPendingCandidate`/`recordAnswer`/`completeCandidate` (Plan 1) gain their
production callers in T1; `rescoreFromAnswers`/`stripPublicOptions`/`callAnthropic` are all
invoked here; the candidate message keys (Plan 2) are consumed by T1's notice/thank-you and
T2's banner. The queued rows (Plan 2) are the data source. No orphaned code.

**Non-regression**: No schema, message-file, or Phase 10 route change; the onboarding form's
existing interactive/CV flow is untouched when no sourcing set is pending — the interactive
init effect only fires after the sourcing check resolves and finds nothing, and the off-track
nudge remains active outside sourcing mode; `npm run build` stays 0 errors and Phase 10
target-role/interview/cover-letter behavior is unaffected.

---

## 7. Success criteria

- [ ] `GET /api/onboarding/sourcing-questions` serves one stripped 5-option MCQ at a time with
      the notify notice on the first, scoped to `session.user.id`.
- [ ] `POST` captures answers, silently judges open text, advances, and returns no correctness.
- [ ] After <=5 answers the endpoint re-scores with the visible-increase clamp, persists
      `fitAfter` + `status="completed"`, and returns the thank-you + "you'll be contacted".
- [ ] `OnboardingCvUploadForm` prioritizes pending sourcing questions on load (interactive init
      effect gated on the sourcing check completing), renders them via the existing option
      buttons + notify banner using a synthetic stable `field` on both the history entry and
      currentQuestion, tags option clicks as `chosenValue` and custom input as `freeText`,
      bypasses the off-track nudge, and never routes them through Phase 10.
- [ ] `sourcing-delivery.test.ts` proves trigger, one-at-a-time MCQ, no correctness leak, <=5
      cap, visible before->now increase, owner scoping, and Phase 10 bypass.
- [ ] `npx tsc --noEmit` and `npm run build` pass 0 errors.

<output>
Create `.planning/phases/11-sourcing-skill-gap-questions-profile-button-opens-admin-prof/11-3-SUMMARY.md` when done.
</output>
