---
phase: 10-dynamic-target-role-binding
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/onboarding/detect-target-role-llm.ts
  - src/lib/onboarding/detect-target-role.ts
  - tests/unit/detect-target-role-llm.test.ts
  - tests/integration/onboarding-target-role-detection.test.ts
autonomous: true
requirements:
  - TRB-01
  - TRB-03
  - TRB-04

must_haves:
  truths:
    - "A new async detector understands paraphrased first-person role intent and returns a normalized, length-capped role string, or null on anything else."
    - "Ordinary conversational turns skip the network entirely via a first-person keyword pre-filter."
    - "The detector returns null on any failure (missing key, non-ok response, timeout, unparseable JSON) and never throws."
    - "When told the user is in a practice/interview turn, the detector only returns a role on explicit first-person career intent, never on a role merely mentioned in an answer."
    - "A detector unit test (mock fetch) proves that an INTENT_HINT-passing message with inPractice: true sends an Anthropic prompt containing the practice/interview-answer discrimination instruction."
    - "A localized (EN/DE/FR) acknowledgement helper produces an 'optimizing for {role}' line without translating the role string."
  artifacts:
    - src/lib/onboarding/detect-target-role-llm.ts
    - src/lib/onboarding/detect-target-role.ts
    - tests/unit/detect-target-role-llm.test.ts
    - tests/integration/onboarding-target-role-detection.test.ts
  key_links:
    - "detectTargetRoleIntent({ message, inPractice, apiKey, model }) gates on INTENT_HINT before the Anthropic fetch, then normalizes the returned role."
    - "getTargetRoleAck(locale, role) mirrors getTargetRoleQuestion's EN/DE/FR shape and is the acknowledgement source Plan 2 wires into answer."
    - "The failing integration test scaffold imports POST and asserts detector-driven behavior; it goes green once Plan 2 rewires the route."
---

<objective>
Build the foundation for LLM-based target-role detection: a new async detector module that
replaces the brittle regex with a paraphrase-aware, explicit-first-person-intent LLM
classifier (keyword pre-filtered, house Anthropic fetch, fence-tolerant JSON parse,
normalize + length-cap, null-on-any-failure), plus a localized EN/DE/FR acknowledgement
helper co-located with the retained CV-upload question. Land a failing integration test
scaffold (Wave 0) that Plan 2 turns green.

Purpose: Isolate the risky new inference logic in one pure, testable module (per D-01) and
the safe interview-mode gating (per D-04) before touching the hot-path route.
Output: One new detector module, one additive helper in the existing detector file (kept
build-green — no removals here), and one failing integration test that pins the target
behavior. No route changes in this plan.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/10-dynamic-target-role-binding-assistant-detects-target-role-in/CONTEXT.md
@.planning/phases/10-dynamic-target-role-binding-assistant-detects-target-role-in/RESEARCH.md

# Copy these patterns — do not rebuild
@src/lib/ai/signals/engine.ts
@src/lib/cv/extract-phase1.ts
@src/lib/onboarding/detect-target-role.ts
@src/lib/env.ts
@tests/integration/onboarding-assistant-cover-letter.test.ts
@tests/integration/_setup-env.ts
</context>

---

## 1. Scope

### In scope
- New `src/lib/onboarding/detect-target-role-llm.ts` async detector (D-01, D-04):
  keyword pre-filter gate, house Anthropic raw `fetch`, `AbortController` short timeout,
  fence-tolerant JSON parse, normalize + length-cap, `inPractice` context flag, return
  `null` on any failure.
- Additive `getTargetRoleAck(locale, role)` EN/DE/FR helper in the existing
  `detect-target-role.ts` (D-02) — additive only; the old regex functions stay in place in
  this plan so the build never breaks.
- A detector unit test (`tests/unit/detect-target-role-llm.test.ts`, mock `fetch`) that
  proves an INTENT_HINT-passing message with `inPractice: true` sends a prompt containing
  the practice/interview-answer discrimination instruction (required, not optional) (D-04).
- A failing integration test scaffold (Wave 0) that mocks `@/lib/env` + `fetch`, imports
  the assistant `POST`, and asserts the target behavior for Plan 2 to satisfy.

### Explicitly OUT of scope
- ❌ Editing `src/app/api/onboarding/assistant/route.ts` (Plan 2).
- ❌ Removing `detectTargetRoleFromMessage` / `extractTargetRoleFromHistory` (Plan 2).
- ❌ The `mock-interview/start` fallback fix (Plan 2).
- ❌ Regenerating any existing artifacts (D-05 — future-only; nothing to do here).

### Guardrails (non-negotiable)
- The LLM-returned role is untrusted text later interpolated into system prompts: normalize
  (strip control chars / backticks / newlines, collapse whitespace, title-case) and
  length-cap (≤ ~60 chars) BEFORE returning it. Reuse the `.replace(/["'`\r\n]/g, "")`
  sanitization idiom already applied to `ANTHROPIC_MODEL`.
- Detector must degrade gracefully: missing key → `null`; non-ok / thrown / timeout →
  `null`; unparseable JSON → `null`. Never throw (mirror the signals-engine contract).
- Windows dev locks the Prisma DLL — type-check with `npx tsc --noEmit` while the dev
  server is running.

---

## 2. Detector contract

```
detectTargetRoleIntent(args: {
  message: string;
  inPractice: boolean;        // true when state.services.interviewPrep.currentMode === "practice"
  apiKey?: string;
  model: string;
}): Promise<string | null>
```

- Pre-filter: if `INTENT_HINT` (first-person intent verbs, a trimmed subset of the current
  regex) does not match `message`, return `null` immediately (0 network cost).
- LLM classify: terse `system` prompt instructing "return STRICT JSON `{"role": string|null}`;
  only return a role when the user expresses a first-person career intent to pursue it; if
  `inPractice`, they are answering an interview question — return null unless the intent is
  an explicit first-person career switch, never a role merely mentioned in the answer."
  `max_tokens` ≤ 20, short `AbortController` timeout (~8–10s), `cache: "no-store"`.
- Parse: strip an accidental ```` ```json ```` fence, `JSON.parse`, read `.role`; coerce a
  non-string / empty / `"null"` to `null`.
- Normalize: strip control chars/backticks/newlines, collapse whitespace, title-case, cap
  length ≤ ~60 chars. Return the normalized role or `null`.

---

## 3. Task Breakdown (wave-ordered, atomically committable)

### Wave 1 — Detector foundation (additive only)

- **T1 — LLM target-role intent detector**
  - **Files**: `src/lib/onboarding/detect-target-role-llm.ts`
  - **Action**: Create the module exporting
    `async function detectTargetRoleIntent({ message, inPractice, apiKey, model })`
    per §2, implementing D-01 (LLM replaces regex) and D-04 (explicit first-person intent
    only, practice-aware). Define a module-level `INTENT_HINT` RegExp covering first-person
    intent verbs only (e.g. `i want/aim/plan/hope/wish/would like/'d like/intend`,
    `i'?m targeting/aiming/looking/pursuing/switching/moving/transitioning`, `my goal`,
    `aiming for`, `switch to`, `move into`, `optimize for`, `target(ing) role`); if it does
    not match `message`, return `null` before any network work. Resolve the model argument
    as-passed (already sanitized upstream) and require `apiKey`; if `apiKey` is falsy return
    `null`. Copy the raw `fetch("https://api.anthropic.com/v1/messages")` shape from
    `src/lib/cv/extract-phase1.ts` / `src/lib/ai/signals/engine.ts` — headers `x-api-key`,
    `anthropic-version: 2023-06-01`, `Content-Type: application/json`, `cache: "no-store"`,
    an `AbortController` with a ~8–10s timeout cleared in `finally`, `max_tokens` ≤ 20, a
    terse `system` prompt (STRICT JSON `{"role": string|null}`; first-person career intent
    only; when `inPractice`, treat the turn as an interview answer and return null unless the
    user explicitly states a first-person career switch), and the user `message` as the sole
    user-role content. On non-ok response return `null`. Read the text part, strip a leading
    ```` ```json ```` / trailing fence (signals-engine idiom), `JSON.parse` in try/catch
    (return `null` on failure), read `.role`; coerce non-string / empty / the literal `null`
    to `null`. Normalize a hit: strip control chars, backticks, CR/LF, collapse internal
    whitespace, title-case each word, and cap to ≤ 60 chars, then return it. Wrap the whole
    body so ANY thrown error (including abort) returns `null` — never throw.
  - **Verify**:
    <automated>npx tsc --noEmit</automated>
    Plus: grep confirms the module contains `INTENT_HINT`, `anthropic-version`,
    `AbortController`, and a `catch` that returns `null`.
  - **Done**: `detectTargetRoleIntent` returns a normalized, length-capped role only on
    explicit first-person intent (respecting `inPractice`), skips the network when the
    pre-filter misses, and returns `null` on every failure path without throwing.

- **T2 — Localized acknowledgement helper (additive)**
  - **Files**: `src/lib/onboarding/detect-target-role.ts`
  - **Action**: Add (do NOT remove anything in this plan) an exported
    `getTargetRoleAck(locale: "en" | "de" | "fr", role: string): string` helper implementing
    D-02, mirroring the EN/DE/FR object shape of the existing `getTargetRoleQuestion`. Each
    locale returns an "optimizing for {role}" style acknowledgement that interpolates the
    already-normalized `role` verbatim (do NOT translate the role string): EN e.g.
    "Got it — I'll optimize everything for {role} now.", DE e.g. "Verstanden — ich optimiere
    ab jetzt alles für {role}.", FR e.g. "C'est noté — j'optimise désormais tout pour
    {role}." Fall back to `en` for an unknown locale (same pattern as `getTargetRoleQuestion`).
    Leave `detectTargetRoleFromMessage`, `extractTargetRoleFromHistory`, and
    `getTargetRoleQuestion` untouched so the current route import keeps compiling.
  - **Verify**:
    <automated>npx tsc --noEmit</automated>
    Plus: grep confirms `getTargetRoleAck` is exported and that `getTargetRoleQuestion`,
    `detectTargetRoleFromMessage` still exist (no premature removal).
  - **Done**: A localized acknowledgement string is available for Plan 2 to wire into
    `answer`; the file still exports the functions the route currently imports.

- **T3 — Detector unit test (green) + failing integration test scaffold (Wave 0)**
  - **Files**: `tests/unit/detect-target-role-llm.test.ts`,
    `tests/integration/onboarding-target-role-detection.test.ts`
  - **Action**: FIRST create the detector unit test
    `tests/unit/detect-target-role-llm.test.ts` that mocks `@/lib/env` + `fetch` and calls
    `detectTargetRoleIntent` directly (this test MUST pass in THIS plan, since T1 builds the
    detector). Required cases: (u1) an INTENT_HINT-passing message with `inPractice: true`
    triggers exactly one `fetch`, and the captured Anthropic request body's system prompt
    contains the practice/interview-answer discrimination instruction (assert on the
    substring that tells the model to return null when the role is merely mentioned in an
    interview answer); (u2) the same message with `inPractice: false` still fetches but the
    prompt need not carry that clause; (u3) a message that fails the INTENT_HINT pre-filter
    makes zero `fetch` calls and returns `null`. Do NOT weaken (u1) — it is the required
    proof of Behavior #2's discrimination instruction. THEN create the integration test
    mirroring the mocking setup of
    `tests/integration/onboarding-assistant-cover-letter.test.ts`: `vi.hoisted()` mocks for
    `@/auth/config` (`auth`), `@/lib/db` (`onboardingSession.{update,findUnique}`,
    `candidateProfile.{findUnique,update}`, plus whatever STEP 1 reads), `@/lib/env`
    (`{ ANTHROPIC_API_KEY: "test-key", ANTHROPIC_MODEL: "claude-test" }`),
    `@/lib/ai/domain-guard`, and `@/lib/profile/memory`; a `fetchMock` + `anthropicResponse`
    helper; import `POST` from `@/app/api/onboarding/assistant/route` AFTER the mocks. Add
    the behavior cases (they MAY fail until Plan 2 rewires the route — this is the intended
    RED scaffold): (a) explicit first-person intent (LLM mock returns
    `{"role":"Product Manager"}`) → both `db.onboardingSession.update` and
    `db.candidateProfile.update` called with the normalized role, and the returned `answer`
    contains the localized acknowledgement; (b) LLM mock returns `{"role":null}` → neither
    update called, no acknowledgement; (c) practice turn with `currentMode: "practice"` where
    the LLM mock returns `{"role":null}` (role merely mentioned) → no switch; (d) DE and FR
    locale → acknowledgement in the right language; (e) detector fetch rejects / non-ok →
    no switch and the request still returns 200. Keep assertions pinned to the target
    behavior so Plan 2 is the code that turns them green.
  - **Verify**:
    <automated>npx vitest run tests/unit/detect-target-role-llm.test.ts tests/integration/onboarding-target-role-detection.test.ts</automated>
    Expected in THIS plan: the detector unit test passes green; the integration scaffold
    loads, type-checks, and executes (its assertions may be RED until Plan 2). Do not weaken
    assertions to force green here.
  - **Done**: A committed detector unit test proves the practice-mode discrimination
    instruction reaches the prompt (green now), and a committed integration test encodes all
    locked-decision behaviors and serves as Plan 2's acceptance gate.

---

## 4. Dependency graph & waves

| Wave | Tasks | Depends on |
|------|-------|-----------|
| 1 | T1 (detector), T2 (ack helper), T3 (test scaffold) | — |

T1/T2 write different files; T3 references both by import path. No same-wave file overlap.

---

## 5. Threat model

**Trust boundaries**

| Boundary | Description |
|----------|-------------|
| user message → detector LLM | Untrusted text steers the classifier prompt. |
| LLM-returned role → return value | Becomes stored + interpolated into future system prompts (Plan 2). |

**STRIDE register**

| Threat ID | Category | Component | Severity | Disposition | Mitigation |
|-----------|----------|-----------|----------|-------------|-----------|
| T-10-01 | Tampering / Injection | classifier prompt steered by user message | high | mitigate | System prompt constrains output to STRICT JSON `{"role": string\|null}`; role is treated as data only (stored/interpolated later), never executed; `max_tokens` ≤ 20 bounds output. |
| T-10-02 | Tampering (stored-then-reflected) | normalized role return value | high | mitigate | Strip control chars/backticks/newlines, collapse whitespace, title-case, cap ≤ 60 chars before returning — reuse the `ANTHROPIC_MODEL` sanitization idiom. |
| T-10-03 | Denial of Service | per-turn LLM latency | low | mitigate | `INTENT_HINT` keyword pre-filter skips the network for ordinary turns; short `AbortController` timeout + tiny `max_tokens`. |
| T-10-SC | Tampering | npm/pip/cargo installs | n/a | accept | No new packages — Anthropic via raw `fetch`; nothing to install (RESEARCH: Package Legitimacy Gate N/A). |

---

## 6. Goal-Backward Verification

Goal (outcome): *A safe, paraphrase-aware detector exists that only fires on explicit
first-person role intent and yields a normalized role plus a localized acknowledgement —
without touching the route yet.*

Truths and where they are satisfied:

1. **Paraphrases understood; regex retired as decision-maker.** — T1 LLM classifier
   (regex is only the pre-filter gate). → TRB-01
2. **Interview/practice answers do not switch the role.** — T1 `inPractice` prompt gating +
   the T3 detector unit test (u1) asserting the discrimination instruction is in the prompt,
   plus T3 integration case (c). → TRB-03
3. **Detector never adds latency to ordinary turns and never throws.** — T1 `INTENT_HINT`
   gate + null-on-any-failure contract + T3 case (e). → TRB-01
4. **A localized EN/DE/FR acknowledgement is available.** — T2 `getTargetRoleAck` + T3
   cases (a)(d). → TRB-04

**Reachability**: `detectTargetRoleIntent` gains a direct test caller in this plan (the T3
unit test) and its production caller in Plan 2's route rewire (declared dependency);
`getTargetRoleAck` is net-new/additive with its production caller in Plan 2. The integration
scaffold (T3) exercises both indirectly through `POST` and becomes green in Plan 2. No
orphaned code: both are named acceptance targets of Plan 2.

**Non-regression**: T2 is additive only; the existing regex functions and route import stay
intact this plan, so `npm run build` remains green throughout Wave 1.

---

## 7. Success criteria

- [ ] `src/lib/onboarding/detect-target-role-llm.ts` exists with `detectTargetRoleIntent`,
      the `INTENT_HINT` pre-filter, house Anthropic fetch, fence-tolerant parse, normalize +
      ≤60-char cap, and a return-null-on-any-failure contract.
- [ ] `getTargetRoleAck(locale, role)` added to `detect-target-role.ts` (EN/DE/FR), with all
      pre-existing exports still present.
- [ ] `tests/unit/detect-target-role-llm.test.ts` committed and passing, proving an
      INTENT_HINT-passing message with `inPractice: true` sends a prompt containing the
      practice/interview-answer discrimination instruction.
- [ ] `tests/integration/onboarding-target-role-detection.test.ts` committed, mirroring the
      cover-letter test's mock setup, encoding the five behavior cases.
- [ ] `npx tsc --noEmit` passes.

<output>
Create `.planning/phases/10-dynamic-target-role-binding-assistant-detects-target-role-in/10-1-SUMMARY.md` when done.
</output>
