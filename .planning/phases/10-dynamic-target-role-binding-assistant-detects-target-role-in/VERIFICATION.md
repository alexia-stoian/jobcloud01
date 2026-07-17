---
phase: 10-dynamic-target-role-binding
verified: 2026-07-17T16:25:00Z
status: passed
score: 6/6 must-haves verified
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "tests/integration/onboarding-assistant-cover-letter.test.ts passes (7/7)"
    addressed_in: "Follow-up: cover-letter fixture modernization (deferred-items.md)"
    evidence: "Pre-existing 502 failure — root cause `db.onboardingSession.findUnique` load introduced in commit 02661b4 (predates all 8 Phase 10 commits). Test's dbMock omits the onboardingSession model."
---

# Phase 10: Dynamic Target-Role Binding — Verification Report

**Phase Goal:** Replace the brittle regex target-role detector with an LLM intent classifier that, anywhere in the assistant conversation (including interview/practice turns), recognizes explicit first-person intent to pursue a role, silently overwrites the single active target role in both `CandidateProfile.targetRoles` and `OnboardingSession.targetRole`, acknowledges the switch (EN/DE/FR), and lets all future generation optimize to the new role without regenerating existing artifacts.
**Verified:** 2026-07-17T16:25:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (locked decisions D-01..D-05 + Security + Regressions)

| # | Truth (Criterion) | Status | Evidence |
|---|-------------------|--------|----------|
| D-01 / TRB-01 | GLOBAL block uses the LLM detector; old regex removed; no remaining callers | ✓ VERIFIED | See below |
| D-02 / TRB-02 | Localized EN/DE/FR ack prepended before final `NextResponse.json({ answer })` | ✓ VERIFIED | See below |
| D-03 / TRB-03 | Role persists to BOTH `onboardingSession.targetRole` and `profile.targetRoles`; profile reloaded | ✓ VERIFIED | See below |
| D-04 / TRB-04 | `inPractice` derived + forwarded; detector gates on first-person intent; CV-upload question preserved | ✓ VERIFIED | See below |
| D-05 / TRB-05 | Future-only: no artifact regeneration; downstream reads fresh role | ✓ VERIFIED | See below |
| Security | LLM role normalized + length-capped before persistence/interpolation | ✓ VERIFIED | See below |
| TRB-06 | No new tsc errors; phase tests green; cover-letter failure genuinely pre-existing | ✓ VERIFIED | See below |

**Score:** 6/6 must-haves verified (7 checks incl. Security; 0 behavior-unverified)

---

### D-01 / TRB-01 — LLM detection replaces regex — ✓ PASS

- `src/app/api/onboarding/assistant/route.ts:228` — GLOBAL block calls `await detectTargetRoleIntent({ message: userMessage, inPractice: ..., apiKey, model })`.
- Import at [route.ts:10](src/app/api/onboarding/assistant/route.ts#L10) — `detectTargetRoleIntent` from `@/lib/onboarding/detect-target-role-llm`.
- `src/lib/onboarding/detect-target-role.ts` no longer exports `detectTargetRoleFromMessage` / `extractTargetRoleFromHistory` (file now only exports `getTargetRoleQuestion` + `getTargetRoleAck`).
- **grep for callers:** no source-code references to the removed functions remain. The only matches outside `.planning/*` docs are: a descriptive comment in `detect-target-role-llm.ts:4`, and the stale root doc `TARGET_ROLE_FIX_VALIDATION.md` (documentation, not a caller). No executable code imports or calls the removed functions.
- Detection runs exactly once per request in the GLOBAL block (duplicate detect blocks removed per 10-2-SUMMARY).

### D-02 / TRB-02 — Localized acknowledgement — ✓ PASS

- `getTargetRoleAck(locale, role)` defined in [detect-target-role.ts](src/lib/onboarding/detect-target-role.ts) with EN/DE/FR strings and `en` fallback; interpolates the already-normalized role verbatim.
- Set on detection at [route.ts:257](src/app/api/onboarding/assistant/route.ts#L257) (`roleAck = getTargetRoleAck(locale, detectedGlobalTargetRole)`).
- Prepended once at the final return: [route.ts:922-926](src/app/api/onboarding/assistant/route.ts#L922-L926) — `if (roleAck) { answer = \`${roleAck}\n\n${answer}\`; } return NextResponse.json({ answer });`. Comment confirms intent: "Prepend the localized acknowledgement once, at the final return site, so it survives any branch that assigned `answer` wholesale (D-02)." (Actual location ~L922, not L964 as loosely referenced in the request — behavior is correct.)

### D-03 / TRB-03 — Persist to both fields + reload — ✓ PASS

- `db.onboardingSession.update(... data: { targetRole } )` at [route.ts:237](src/app/api/onboarding/assistant/route.ts#L237).
- `db.candidateProfile.update(... data: { targetRoles } )` at [route.ts:248](src/app/api/onboarding/assistant/route.ts#L248).
- Profile reloaded via `db.candidateProfile.findUnique(...)` at [route.ts:251](src/app/api/onboarding/assistant/route.ts#L251) so downstream reads the fresh in-memory object.

### D-04 / TRB-04 — Interview-safe explicit intent + CV flow preserved — ✓ PASS

- `inPractice` derived from `state.services?.interviewPrep?.currentMode === "practice"` and forwarded to the detector at [route.ts:230](src/app/api/onboarding/assistant/route.ts#L230) (also used in the interview branch at [route.ts:714](src/app/api/onboarding/assistant/route.ts#L714)).
- Detector `INTENT_HINT` pre-filter ([detect-target-role-llm.ts:27](src/lib/onboarding/detect-target-role-llm.ts#L27)) short-circuits non-intent turns to `null` before any network call (EN/DE/FR first-person markers).
- Practice discrimination clause appended to the system prompt when `inPractice === true` ([detect-target-role-llm.ts:104-111](src/lib/onboarding/detect-target-role-llm.ts#L104-L111)): "a role NAMED in their answer is NOT intent — return null unless they explicitly state a first-person intent…".
- CV-upload "what role are you targeting?" flow preserved: `getTargetRoleQuestion(locale)` early return retained at [route.ts:306](src/app/api/onboarding/assistant/route.ts#L306) with its `return NextResponse.json({ answer })` at [route.ts:323](src/app/api/onboarding/assistant/route.ts#L323), guarded by `!onboardingSession?.targetRole`.
- Test evidence: integration test "practice mode forwards inPractice into the detector prompt" passes (green).

### D-05 / TRB-05 — Future-only, no regeneration — ✓ PASS

- No artifact-regeneration code introduced in the phase diff; the route only persists + reloads the role.
- Downstream consumers read the freshly-reloaded active role:
  - Cover letter: [cover-letter.ts:239-240](src/lib/ai/assistant/services/cover-letter.ts#L239-L240) reads `userProfile.targetRoles`.
  - Skill gaps: [parse-gaps.ts:197](src/lib/interview/parse-gaps.ts#L197) reads `profile.targetRoles || profile.primaryRole`.
  - Interview prompts/engine: [prompts.ts:14](src/lib/interview/prompts.ts#L14), [engine.ts:69](src/lib/interview/engine.ts#L69) take `targetRole` arg; interview branch passes `onboardingSession?.targetRole ?? profile?.primaryRole` ([route.ts:714](src/app/api/onboarding/assistant/route.ts#L714) region).
  - Memory: [memory.ts:42](src/lib/profile/memory.ts#L42) reads `profile.targetRoles || onboardingSession?.targetRole`.
  - mock-interview/start fallback fixed to `targetRole || profile.targetRoles || profile.primaryRole` at [start/route.ts:51](src/app/api/mock-interview/start/route.ts#L51).

### Security — normalize + length-cap — ✓ PASS

- `normalizeRole()` ([detect-target-role-llm.ts:59-80](src/lib/onboarding/detect-target-role-llm.ts#L59-L80)) strips control chars/backticks/CR-LF, collapses whitespace, title-cases, and caps to `MAX_ROLE_LENGTH = 60` ([L30](src/lib/onboarding/detect-target-role-llm.ts#L30)) BEFORE the role is returned — so persistence/interpolation always receives a bounded, sanitized string. Detector never throws (all failure paths → `null`); `max_tokens: 20`, `no-store`, 9s `AbortController` timeout bound DoS/latency surface.

### TRB-06 — No regressions — ✓ PASS

- `npx tsc --noEmit`: **no errors** originate from any Phase 10 file (`detect-target-role*.ts`, `onboarding/assistant/route.ts`, `mock-interview/start/route.ts`, phase test files). tsc exits non-zero only on pre-existing errors in unrelated files (documented in 10-1-SUMMARY Deferred Issues).
- `npx vitest run` on the two phase files: **13 passed (13)** — `tests/unit/detect-target-role-llm.test.ts` 6/6, `tests/integration/onboarding-target-role-detection.test.ts` 7/7 (incl. the practice-mode inPractice-forwarding case).

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase unit + integration tests | `npx vitest run tests/unit/detect-target-role-llm.test.ts tests/integration/onboarding-target-role-detection.test.ts` | 13 passed / 13 | ✓ PASS |
| No new tsc errors in phase files | `npx tsc --noEmit \| Select-String <phase files>` | no matching output | ✓ PASS |
| Cover-letter test still failing | `npx vitest run tests/integration/onboarding-assistant-cover-letter.test.ts` | 7 failed / 7 | ℹ️ Pre-existing (see deferred) |

## Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | `onboarding-assistant-cover-letter.test.ts` fails 7/7 | Follow-up fixture modernization | Failure = HTTP 502 from `db.onboardingSession.findUnique` (route.ts) throwing because the test's `dbMock` omits the `onboardingSession` model. That load was introduced in commit `02661b4` ("OnboardingSession now persists and queries correctly"), which is **not** among the 8 Phase 10 commits (`8220e04`, `359e50a`, `be5b2ba`, `127718f`, `a51486e`, `a6bf6c7`, `3b4e4ff`, `f0bb8ff`) — it predates the phase. Confirmed genuinely pre-existing, NOT introduced here. |

## Anti-Patterns Found

None in phase files. No unreferenced TBD/FIXME/XXX debt markers. Detector fails closed to `null`; no stub/placeholder returns in the wired paths.

## Gaps Summary

No blocking gaps. All six locked decisions (D-01..D-05) and the security requirement are implemented and wired in the shipped code, verified against source (not just SUMMARYs). Phase tests are green and add no new tsc errors. The only failing test in the vicinity (`onboarding-assistant-cover-letter.test.ts`) is a pre-existing, out-of-subsystem fixture staleness that was independently confirmed to predate Phase 10 — correctly deferred, not a Phase 10 regression.

---

_Verified: 2026-07-17T16:25:00Z_
_Verifier: GitHub Copilot (gsd-verifier)_
