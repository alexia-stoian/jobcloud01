# Phase 10 Plan 1: Detector Foundation Summary

**One-liner:** Added a paraphrase-aware, first-person-intent LLM target-role detector (keyword pre-filtered, house Anthropic raw fetch, fence-tolerant parse, sanitized + ≤60-char cap, null-on-any-failure) plus a localized EN/DE/FR acknowledgement helper and a green detector unit test + RED integration scaffold — all additive, build stays green.

---

## Frontmatter

- **phase:** 10-dynamic-target-role-binding
- **plan:** 1
- **wave:** 1
- **subsystem:** onboarding assistant / target-role detection
- **tags:** llm-detection, anthropic, intent-classification, i18n, security-sanitization
- **status:** complete
- **completed:** 2026-07-17

### Dependency graph
- **requires:** — (Wave 1, no deps)
- **provides:** `detectTargetRoleIntent` (detector), `getTargetRoleAck` (localized ack), integration acceptance scaffold
- **affects:** Plan 2 (route rewire consumes both new exports and turns the integration scaffold green)

### Tech stack
- **added:** none (Anthropic via raw `fetch` — no new packages, per RESEARCH Package Legitimacy Gate N/A)
- **patterns:** house Anthropic raw fetch (`x-api-key` + `anthropic-version: 2023-06-01`, `AbortController`, `cache: "no-store"`, swallow-all-errors→null); fence-tolerant JSON parse (signals-engine idiom); `.replace(/["'`\r\n]/g, "")` sanitization idiom

### Key files
- **created:**
  - `src/lib/onboarding/detect-target-role-llm.ts`
  - `tests/unit/detect-target-role-llm.test.ts`
  - `tests/integration/onboarding-target-role-detection.test.ts`
- **modified:**
  - `src/lib/onboarding/detect-target-role.ts` (additive helper only)

### Requirements
- TRB-01, TRB-03, TRB-04

---

## What was built

### T1 — LLM target-role intent detector (`detect-target-role-llm.ts`)
`detectTargetRoleIntent({ message, inPractice, apiKey, model }): Promise<string | null>`:
- **`INTENT_HINT` pre-filter** — module-level RegExp of first-person intent verbs only (`i want/aim/plan/hope/wish/would like/'d like/intend`, `i'm targeting/aiming/looking/pursuing/switching/moving/transitioning`, `my goal`, `aiming for`, `switch to`, `move into`, `optimize for`, `target(ing) role`). A miss returns `null` before any network work (0 network cost, DoS mitigation T-10-03).
- **House Anthropic fetch** — raw `fetch("https://api.anthropic.com/v1/messages")`, headers `x-api-key` / `anthropic-version: 2023-06-01` / `Content-Type`, `cache: "no-store"`, `AbortController` with a ~9s timeout cleared in `finally`, `max_tokens: 20`, terse `system` prompt requiring STRICT JSON `{"role": string|null}` and first-person career intent only.
- **`inPractice` gating (D-04)** — when `true`, the system prompt appends an explicit interview-answer discrimination clause instructing the model to return null for a role merely named in an answer unless it is an explicit first-person career switch.
- **Fence-tolerant parse** — strips a leading ```` ```json ```` / trailing fence, `JSON.parse` in try/catch, reads `.role`, coerces non-string / empty / literal `"null"` → `null`.
- **Normalize + cap (T-10-02)** — strips control chars/backticks/CR-LF, collapses whitespace, title-cases, caps ≤ 60 chars before returning.
- **Null-on-any-failure** — missing key, non-ok, timeout/abort, unparseable JSON all return `null`; the whole body is wrapped so nothing throws.

### T2 — Localized acknowledgement helper (`detect-target-role.ts`)
Added exported `getTargetRoleAck(locale: "en" | "de" | "fr", role: string): string` mirroring `getTargetRoleQuestion`'s EN/DE/FR object shape, interpolating the already-normalized `role` verbatim (not translated), with `en` fallback for unknown locales. All pre-existing exports (`detectTargetRoleFromMessage`, `extractTargetRoleFromHistory`, `getTargetRoleQuestion`) left untouched so the current route import keeps compiling.

### T3 — Tests
- **`tests/unit/detect-target-role-llm.test.ts` (green — 6/6):** proves (u1) `inPractice: true` + INTENT_HINT-passing message triggers exactly one `fetch` and the captured system prompt contains the practice/interview-answer discrimination instruction; (u2) `inPractice: false` still fetches but omits that clause; (u3) a pre-filter miss makes zero `fetch` calls and returns `null`; plus null-result, non-ok, and missing-key null paths.
- **`tests/integration/onboarding-target-role-detection.test.ts` (RED scaffold — intended):** mirrors the cover-letter test's `vi.hoisted` mock setup (`@/auth/config`, `@/lib/db`, `@/lib/env`, `@/lib/ai/domain-guard`, `@/lib/profile/memory`), imports `POST` after mocks, and encodes the five behavior cases (a explicit-intent switch+ack, b no-intent no-switch, c practice merely-mentioned no-switch, d DE/FR acks, e detector-failure→no-switch+200). Assertions are pinned to the target behavior; they are RED because the route still uses the regex detector — Plan 2's rewire turns them green.

---

## Verification results

- **`npx tsc --noEmit`** — the four new/modified files introduce **zero** type errors (verified: none of them appear in the tsc output). Pre-existing errors remain in unrelated test files (see Deferred Issues) — out of scope for this additive plan.
- **`npx vitest run tests/unit/detect-target-role-llm.test.ts`** — **6 passed / 6** (green).
- **`npx vitest run` (both files)** — 8 passed, 4 failed; all 4 failures are the intended RED integration-scaffold assertions (localized ack not yet appended; regex detector still fires). This is the expected Wave 0 state.
- **grep** — confirmed `INTENT_HINT`, `anthropic-version`, `AbortController`, and null-returning `catch` present in the detector; confirmed `getTargetRoleAck` exported alongside all pre-existing exports.

---

## Deviations from Plan

None functionally. The detector's `system`-prompt approach matches the signals-engine `system`+`messages` shape (RESEARCH Pattern 1) rather than embedding instructions in the user message; the discrimination clause is asserted via the substrings `"answering an interview/practice question"`, `"NOT intent"`, and `"return null unless"`.

---

## Deferred Issues (out of scope — pre-existing)

`npx tsc --noEmit` reports pre-existing type errors in files this plan did not touch (e.g. `tests/e2e/onboarding-cv.spec.ts`, `tests/integration/assistant-services.test.ts`, `tests/integration/domain-guard.test.ts`, `tests/integration/guidance-endpoint.test.ts`, `tests/integration/onboarding-workflow.test.ts`, `tests/integration/profile-memory.test.ts`). These predate Plan 1 and are outside its scope; not fixed here.

---

## Follow-ups for Wave 2 (Plan 2)

- Rewire `src/app/api/onboarding/assistant/route.ts` GLOBAL block to call `detectTargetRoleIntent` (passing `inPractice` from `state.services?.interviewPrep?.currentMode === "practice"`), remove the two duplicate detect blocks, and append `getTargetRoleAck(locale, role)` to `answer` — turning the integration scaffold green.
- Remove `detectTargetRoleFromMessage` / `extractTargetRoleFromHistory` once the route no longer imports them.
- Address the `mock-interview/start` fallback fix and confirm all downstream generators read the freshly-reloaded `targetRoles`.

---

## Commits

- `359e50a` feat(10-1): add LLM target-role intent detector
- `be5b2ba` feat(10-1): add localized EN/DE/FR target-role acknowledgement helper
- `127718f` test(10-1): detector unit test (green) + integration RED scaffold

## Self-Check: PASSED

- FOUND: `src/lib/onboarding/detect-target-role-llm.ts`
- FOUND: `src/lib/onboarding/detect-target-role.ts` (`getTargetRoleAck` added)
- FOUND: `tests/unit/detect-target-role-llm.test.ts`
- FOUND: `tests/integration/onboarding-target-role-detection.test.ts`
- FOUND commits: `359e50a`, `be5b2ba`, `127718f`
