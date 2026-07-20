---
phase: 10-dynamic-target-role-binding
plan: 2
type: execute
wave: 2
depends_on:
  - 10-1
files_modified:
  - src/app/api/onboarding/assistant/route.ts
  - src/lib/onboarding/detect-target-role.ts
  - src/app/api/mock-interview/start/route.ts
  - tests/integration/onboarding-target-role-detection.test.ts
autonomous: true
requirements:
  - TRB-01
  - TRB-02
  - TRB-03
  - TRB-04
  - TRB-05
  - TRB-06

must_haves:
  truths:
    - "The single GLOBAL block in the assistant route uses the async LLM detector, passing the practice-mode flag, and persists a detected role to BOTH OnboardingSession.targetRole and CandidateProfile.targetRoles, then reloads the profile."
    - "The profile-collection detect+persist branch (~L288) is deleted while its getTargetRoleQuestion CV-upload flow and early return (~L342) are preserved unchanged; the services detect+persist block (~L503) is deleted; detection happens exactly once per request."
    - "When a switch happens, a localized (EN/DE/FR) acknowledgement is prepended to answer once, right before the FINAL NextResponse.json({ answer }) (~L964) — never the ~L342 CV-upload early return — surviving branch overwrites."
    - "detectTargetRoleFromMessage and extractTargetRoleFromHistory are removed; getTargetRoleQuestion and getTargetRoleAck remain; the route import compiles."
    - "mock-interview/start falls back through profile.targetRoles so a standalone interview uses the active role; npm run build passes 0 errors and the integration tests are green."
  artifacts:
    - src/app/api/onboarding/assistant/route.ts
    - src/lib/onboarding/detect-target-role.ts
    - src/app/api/mock-interview/start/route.ts
    - tests/integration/onboarding-target-role-detection.test.ts
  key_links:
    - "GLOBAL block: detectTargetRoleIntent({ message: userMessage, inPractice: state.services?.interviewPrep?.currentMode === 'practice', apiKey: anthropicApiKey, model: anthropicModel }) → db.onboardingSession.update + db.candidateProfile.update + profile reload."
    - "roleAck captured in the GLOBAL block via getTargetRoleAck(locale, role) is prepended to answer immediately before the FINAL return NextResponse.json({ answer }) (~L964), not the ~L342 CV-upload early return."
    - "generateFirstQuestion(interviewType, targetRole || profile.targetRoles || profile.primaryRole || null, ...) reads the freshly persisted active role."
---

<objective>
Rewire the assistant to LLM detection: swap the GLOBAL block's regex call for the async
`detectTargetRoleIntent` (passing the practice-mode context), delete the two duplicate
detect+persist blocks, update the import, prepend a localized acknowledgement to `answer`
at the final return site, remove the now-dead regex functions, and fix the standalone
mock-interview fallback to read the active role. Finish by turning Plan 1's integration
tests green and confirming a clean build.

Purpose: Deliver every locked decision end-to-end — single-site LLM detection (D-01),
replace-persist to both stores (D-03), practice-safety (D-04), silent-update-then-
acknowledge (D-02) — while keeping downstream generation reading the fresh role (D-05).
Output: One rewired route, one cleaned detector file, one downstream fallback fix, green
tests, and a 0-error build with EN/DE/FR preserved.
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
@.planning/phases/10-dynamic-target-role-binding-assistant-detects-target-role-in/10-1-PLAN.md

# The surfaces this plan edits / verifies
@src/app/api/onboarding/assistant/route.ts
@src/lib/onboarding/detect-target-role.ts
@src/lib/onboarding/detect-target-role-llm.ts
@src/app/api/mock-interview/start/route.ts
@src/types/assistant-state.ts
@src/lib/profile/memory.ts
@src/lib/interview/parse-gaps.ts
@src/lib/ai/assistant/services/cover-letter.ts
@tests/integration/onboarding-target-role-detection.test.ts
</context>

---

## 1. Scope

### In scope
- Rewire the ONE GLOBAL block (~L222–L250) of the assistant route to
  `await detectTargetRoleIntent(...)`, passing
  `inPractice: state.services?.interviewPrep?.currentMode === "practice"` (D-01, D-03, D-04).
- Capture a `roleAck` (via `getTargetRoleAck(locale, role)`) when a switch happens and
  prepend it to `answer` exactly once, immediately before the FINAL
  `return NextResponse.json({ answer })` (~L964) so it survives branch overwrites (D-02).
  There are TWO return sites (the ~L342 CV-upload early return and the ~L964 final return);
  only the final one gets the acknowledgement.
- Delete the profile-collection detect+persist branch (~L288–L344) — removing ONLY the
  detect call, its console.logs, and the `if (detectedTargetRole && onboardingSession)`
  persist branch — while preserving the trailing getTargetRoleQuestion CV-upload flow and
  its early return (converted to a standalone `if`). Delete the services detect+persist
  block (~L503–L525), which is a clean standalone `if`.
- Update the route import: drop `detectTargetRoleFromMessage`, keep `getTargetRoleQuestion`,
  add `getTargetRoleAck` and `detectTargetRoleIntent`.
- Remove `detectTargetRoleFromMessage` + `extractTargetRoleFromHistory` from
  `detect-target-role.ts` (no production callers of the latter — confirm via grep during
  execution); keep `getTargetRoleQuestion` and `getTargetRoleAck`.
- Fix `src/app/api/mock-interview/start/route.ts` (~L48–L53) fallback to
  `targetRole || profile.targetRoles || profile.primaryRole || null` (D-05 open question).
- Turn the Plan 1 integration tests green; confirm `npm run build` 0 errors.

### Explicitly OUT of scope
- ❌ Changing the persistence/reload logic itself (it already writes both stores + reloads —
  keep it).
- ❌ Regenerating existing artifacts on switch (D-05 future-only).
- ❌ Multi-role list / history, confirmation prompt, Profile-page UI (deferred).
- ❌ Any Prisma schema change.

### Guardrails (non-negotiable)
- Detection runs EXACTLY once per request (GLOBAL block only). Do not port the LLM call to
  the deleted duplicate sites.
- After the DB update keep reading the reloaded `profile` / reassigned `onboardingSession`
  — never a pre-update copy (avoids stale in-memory reads for downstream generation).
- The role stored is already normalized/length-capped by the detector (Plan 1) — do not
  re-derive it from raw user text here.
- `npm run build` passes 0 errors; EN/DE/FR user-facing text preserved (acknowledgement
  localized; role string not translated). Windows dev locks the Prisma DLL — type-check with
  `npx tsc --noEmit` while the dev server runs.

---

## 2. Task Breakdown (wave-ordered, atomically committable)

### Wave 2 — Route rewire + acknowledgement (depends on Plan 1)

- **T1 — Rewire GLOBAL detection, delete duplicates, wire acknowledgement**
  - **Files**: `src/app/api/onboarding/assistant/route.ts`
  - **Action**: (1) Update the import at L9: remove `detectTargetRoleFromMessage`, keep
    `getTargetRoleQuestion`, and add `getTargetRoleAck` from
    `@/lib/onboarding/detect-target-role` plus `detectTargetRoleIntent` from
    `@/lib/onboarding/detect-target-role-llm`. (2) In the GLOBAL block (~L222–L250) replace
    `const detectedGlobalTargetRole = detectTargetRoleFromMessage(userMessage);` with
    `const detectedGlobalTargetRole = await detectTargetRoleIntent({ message: userMessage,
    inPractice: state.services?.interviewPrep?.currentMode === "practice", apiKey:
    anthropicApiKey, model: anthropicModel });` (reuse the already-resolved `anthropicApiKey`
    / `anthropicModel` from ~L98–L101). Keep the existing persist+reload body verbatim
    (update `OnboardingSession.targetRole`, update `CandidateProfile.targetRoles`, reload
    `profile` with `include: { qualifications: true }`). Declare a
    `let roleAck: string | null = null;` before the block and, on a successful switch, set
    `roleAck = getTargetRoleAck(locale, detectedGlobalTargetRole);` (D-02, D-04). (3) In the
    profile-collection branch (~L288–L344), delete ONLY the
    `const detectedTargetRole = detectTargetRoleFromMessage(...)` declaration, its
    `console.log`s, and the `if (detectedTargetRole && onboardingSession) { …persist… }`
    branch (which updates `OnboardingSession.targetRole` and `CandidateProfile.targetRoles`
    — note this branch has NO profile reload; only the GLOBAL block reloads). Convert the
    trailing `else if (!onboardingSession?.targetRole && userMessage.length > 10) { …
    getTargetRoleQuestion(locale) … return }` into a standalone `if (...)`, preserving the
    getTargetRoleQuestion CV-upload flow and its early return (~L342) unchanged — that early
    return is the load-bearing "what role are you targeting?" CV-upload feature and must not
    be removed. Separately, in the services branch (~L503–L525) delete the whole
    `const detectedTargetRole = detectTargetRoleFromMessage(...)` +
    `if (detectedTargetRole && onboardingSession) { …persist… }` construct (a clean standalone
    `if`, safe to delete). The GLOBAL block already ran before phase routing so both branches
    see the updated role. (4) There are TWO `return NextResponse.json({ answer })` sites — the
    profile-collection CV-upload early return (~L342) and the FINAL return (~L964). Prepend the
    acknowledgement ONLY at the FINAL return: immediately before it, add
    `if (roleAck) answer = ` a two-newline join of `roleAck` and `answer` (prepend, so it
    survives branches that assign `answer` wholesale). Leave the ~L342 early return untouched
    — it only fires when no target role is set (no switch occurred), so it correctly needs no
    acknowledgement. Do not add any new return site.
  - **Verify**:
    <automated>npx tsc --noEmit</automated>
    Plus: grep confirms `detectTargetRoleIntent` is called exactly once in the file,
    `detectTargetRoleFromMessage` no longer appears, and `getTargetRoleQuestion` is still
    imported and used (~L325).
  - **Done**: Detection is a single async LLM call passing practice context; both stores are
    updated + profile reloaded; the localized acknowledgement is prepended once at the final
    return site; the profile-collection detect+persist branch is gone with its CV-upload
    question flow + early return preserved, and the services detect+persist block is gone.

- **T2 — Remove dead regex functions; fix standalone mock-interview fallback**
  - **Files**: `src/lib/onboarding/detect-target-role.ts`,
    `src/app/api/mock-interview/start/route.ts`
  - **Action**: In `detect-target-role.ts` delete `detectTargetRoleFromMessage` and
    `extractTargetRoleFromHistory` (first `grep -rn "detectTargetRoleFromMessage\|
    extractTargetRoleFromHistory" src tests` to confirm no remaining production import after
    T1; the only non-code refs are `.planning/**` and `TARGET_ROLE_FIX_VALIDATION.md`).
    Keep `getTargetRoleQuestion` and the `getTargetRoleAck` helper added in Plan 1, along
    with the file's leading doc comment (trimmed to reflect the retained exports). In
    `mock-interview/start/route.ts` (~L48–L53) change the `generateFirstQuestion(...)` role
    argument from `targetRole || profile.primaryRole || null` to
    `targetRole || profile.targetRoles || profile.primaryRole || null` so a standalone
    interview honors the active target role (D-05). Do not otherwise alter that route.
  - **Verify**:
    <automated>npx tsc --noEmit</automated>
    Plus: grep confirms `detectTargetRoleFromMessage` / `extractTargetRoleFromHistory` are
    absent from `src/`, and `mock-interview/start/route.ts` now contains
    `profile.targetRoles` in the `generateFirstQuestion` fallback.
  - **Done**: The brittle regex functions are gone with no dangling imports; the standalone
    mock-interview route reads the freshly persisted active role.

- **T3 — Green the integration tests + build gate**
  - **Files**: `tests/integration/onboarding-target-role-detection.test.ts`
  - **Action**: Run the Plan 1 test file against the rewired route and make all cases
    pass by aligning the test doubles with the real flow (adjust `fetchMock` sequencing and
    the `db` mock return shapes as needed — the LLM mock returns the `{"role": ...}` JSON the
    detector expects; do NOT weaken the behavioral assertions from Plan 1). Confirm: (a)
    explicit intent → both `db.onboardingSession.update` and `db.candidateProfile.update`
    called with the normalized role + acknowledgement present in `answer`; (b) `{"role":null}`
    → no update, no acknowledgement; (c) `currentMode: "practice"` + non-first-person mention
    (LLM returns null) → no switch; (d) DE/FR acknowledgement language; (e) detector
    fetch rejects / non-ok → no switch, request still 200; (f) REQUIRED — a
    `currentMode: "practice"` request whose message passes the INTENT_HINT pre-filter causes
    the captured outgoing Anthropic request body (from `fetchMock`) to contain the
    practice/interview-answer discrimination instruction, proving the route derived
    `inPractice: true` from `currentMode === "practice"` and forwarded it into
    `detectTargetRoleIntent`. Then run the broader assistant
    suite and the production build to prove no regressions.
  - **Verify**:
    <automated>npx vitest run tests/integration/onboarding-target-role-detection.test.ts tests/integration/onboarding-assistant-cover-letter.test.ts</automated>
    Then:
    <automated>npm run build</automated>
  - **Done**: All target-role integration cases pass (including the practice-mode
    inPractice-forwarding assertion), the existing assistant cover-letter test still passes,
    and `npm run build` completes with 0 errors.

---

## 3. Dependency graph & waves

| Wave | Tasks | Depends on |
|------|-------|-----------|
| 2 | T1 (route rewire), T2 (cleanup + mock-interview fix), T3 (green tests + build) | Plan 10-1 (detector + ack helper + test scaffold) |

T1 must precede T2 (T2's removal is only safe once the route no longer imports the old
function). T3 runs last (needs T1+T2). `detect-target-role.ts` and the test file also appear
in Plan 1, but Plan 2 is a later wave (sequential) — no same-wave file conflict.

---

## 4. Threat model

**Trust boundaries**

| Boundary | Description |
|----------|-------------|
| user message → GLOBAL detector | Untrusted text reaches the LLM classifier (Plan 1 module). |
| detected role → DB + system prompt | Stored to both stores, then injected into future generation prompts. |

**STRIDE register**

| Threat ID | Category | Component | Severity | Disposition | Mitigation |
|-----------|----------|-----------|----------|-------------|-----------|
| T-10-04 | Tampering (stored-then-reflected) | persisted `targetRoles`/`targetRole` | high | mitigate | The detector (Plan 1) normalizes + length-caps the role before it reaches this persist path; the route stores the already-sanitized value, never raw user text. |
| T-10-05 | Elevation / cross-user write | GLOBAL persist path | medium | mitigate | Updates are keyed on `session.user.id` from `auth()` (route already gates at L82); no user-supplied id is trusted for the write. |
| T-10-06 | Business-logic (false switch in interview) | GLOBAL block during practice | high | mitigate | `inPractice` context passed to the detector; only explicit first-person intent switches (D-04); covered by test case (c). |
| T-10-07 | Availability (per-turn latency/cost) | single GLOBAL LLM call | low | mitigate | Detection consolidated to ONE site (duplicates deleted); Plan 1 keyword pre-filter skips the network for ordinary turns. |

---

## 5. Goal-Backward Verification

Goal (outcome): *Anywhere in the conversation, an explicit first-person role intent updates
the Target Roles field in both stores, the assistant acknowledges it in the user's language,
and all subsequent generation optimizes to the new role — with no regressions.*

Truths and where they are satisfied:

1. **Explicit intent detected once, anywhere in the conversation.** — T1 rewires the single
   GLOBAL block to the async LLM detector and deletes the duplicates. → TRB-01
2. **Detected role overwrites both stores and the in-memory profile is refreshed.** — T1
   keeps the verified update-both + reload body. → TRB-02
3. **Interview/practice answers do not switch on mentioned roles.** — T1 passes `inPractice`;
   T3 case (c). → TRB-03
4. **Assistant acknowledges the switch in EN/DE/FR.** — T1 prepends `getTargetRoleAck(locale,
   role)` at the final return site (~L964); T3 cases (a)(d). → TRB-04
5. **Downstream generation reads the fresh active role.** — reload keeps memory/cover-letter/
   guidance fresh (RESEARCH read-path table); T2 fixes the standalone mock-interview fallback
   to include `profile.targetRoles`. → TRB-05
6. **No regressions; build 0 errors; EN/DE/FR preserved.** — T2 removes dead code without
   dangling imports; T3 runs the target + existing assistant tests and `npm run build`. → TRB-06

**Reachability**: The GLOBAL block runs on every request before phase routing, so the
updated role is visible to the profile-collection, services, cover-letter, and interview
branches within the same request (RESEARCH-verified reads of `onboardingSession?.targetRole`
/ `profile.targetRoles`). `roleAck` is reachable at the final return site (~L964). The standalone
`/api/mock-interview/start` reads the persisted `profile.targetRoles` after T2. No orphaned
code — the Plan 1 detector and ack helper now have their single caller.

**Non-regression**: only additive acknowledgement text (localized, role not translated) and
deletions of already-dead code paths; no schema change; existing assistant/interview routes
otherwise untouched. Build + test gates on the final task.

---

## 6. Success criteria

- [ ] The assistant route calls `detectTargetRoleIntent(...)` exactly once (GLOBAL block),
      passing `inPractice`, and no longer references `detectTargetRoleFromMessage`.
- [ ] The profile-collection detect+persist branch (~L288) is removed with its
      getTargetRoleQuestion CV-upload flow + early return (~L342) preserved; the services
      detect+persist block (~L503) is removed.
- [ ] A localized acknowledgement is prepended to `answer` once, right before the FINAL
      `return NextResponse.json({ answer })` (~L964), not the ~L342 CV-upload early return.
- [ ] The integration test proves the route forwards `inPractice: true` (derived from
      `currentMode === "practice"`) into the detector.
- [ ] `detectTargetRoleFromMessage` and `extractTargetRoleFromHistory` are removed;
      `getTargetRoleQuestion` and `getTargetRoleAck` remain.
- [ ] `mock-interview/start/route.ts` fallback includes `profile.targetRoles`.
- [ ] `npx vitest run tests/integration/onboarding-target-role-detection.test.ts tests/integration/onboarding-assistant-cover-letter.test.ts` passes.
- [ ] `npm run build` completes with 0 errors; EN/DE/FR preserved.

<output>
Create `.planning/phases/10-dynamic-target-role-binding-assistant-detects-target-role-in/10-2-SUMMARY.md` when done.
</output>
