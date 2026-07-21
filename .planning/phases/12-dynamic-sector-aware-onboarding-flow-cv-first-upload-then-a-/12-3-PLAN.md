---
phase: 12-dynamic-sector-aware-onboarding-flow
plan: 3
type: execute
wave: 3
depends_on: [12-2]
files_modified:
  - src/app/api/onboarding/sector-questions/route.ts
  - src/lib/onboarding/confirm-policy.ts
  - src/app/api/onboarding/resume/route.ts
  - src/components/onboarding/OnboardingCvUploadForm.tsx
  - tests/onboarding/sector-questions.test.ts
autonomous: false
requirements: [D-03, D-04, D-05, D-07, D-08, D-09]
user_setup: []

must_haves:
  truths:
    - "Each persisted sector field is delivered in the onboarding chat as ONE multiple-choice question that also allows a type-your-own answer (D-07)."
    - "Sector questions use a DISTINCT sector: prefix and a dedicated endpoint, never colliding with the sourcing: mode."
    - "Answering a sector question writes the value into sectorPreferences.fields[key].value (JSON), not into any profile column."
    - "On refresh/resume, still-unanswered sector questions re-attach chronologically; answered ones stay inline in conversationHistory (no jump-to-bottom)."
  artifacts:
    - "src/app/api/onboarding/sector-questions/route.ts"
    - "src/lib/onboarding/confirm-policy.ts (sector: allowlist branch)"
    - "src/app/api/onboarding/resume/route.ts (surface pending sector question + sectorPreferences)"
    - "src/components/onboarding/OnboardingCvUploadForm.tsx (sector-mode wiring)"
    - "tests/onboarding/sector-questions.test.ts"
  key_links:
    - "sector-questions/route.ts reads/writes CandidateProfile.sectorPreferences (from Plan 12-1/12-2), scoped to session.user.id."
    - "OnboardingCvUploadForm branches on field.startsWith('sector:'), parallel to the existing sourcing: branch, reusing the same MCQ + free-text UI."
---

<objective>
Deliver the ≤3 persisted sector fields as in-chat MCQ follow-ups with type-your-own (D-07), modeled almost exactly on Phase 11 Sourcing mode but under a DISTINCT `sector:` prefix + dedicated endpoint so the two modes never collide (Pitfall 4). Answers persist into `sectorPreferences.fields[key].value` (D-03/D-05) and survive refresh via resume (D-05). All copy is the model-generated localized cheerful text from Plan 12-1 (D-08, D-09).

Purpose: This is the "sector fields ARE the follow-up questions" delivery mechanism — the fourth step of the 6-step flow — reusing the proven sourcing delivery pattern rather than inventing a new state machine.
Output: `sector-questions` endpoint; confirm-policy `sector:` branch; resume wiring; chat-form sector mode; integration/unit tests.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/12-dynamic-sector-aware-onboarding-flow-cv-first-upload-then-a-/12-CONTEXT.md
@.planning/phases/12-dynamic-sector-aware-onboarding-flow-cv-first-upload-then-a-/12-RESEARCH.md
@.planning/phases/12-dynamic-sector-aware-onboarding-flow-cv-first-upload-then-a-/12-2-SUMMARY.md

# Clone the shape of these — keep the two modes independent
@src/app/api/onboarding/sourcing-questions/route.ts
@src/components/onboarding/OnboardingCvUploadForm.tsx
@src/app/api/onboarding/resume/route.ts
@src/lib/onboarding/confirm-policy.ts
@src/lib/onboarding/sector-fields.ts
@src/i18n/config.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Dedicated sector-questions delivery endpoint + confirm-policy branch</name>
  <files>src/app/api/onboarding/sector-questions/route.ts, src/lib/onboarding/confirm-policy.ts</files>
  <action>
    Clone the structure of `sourcing-questions/route.ts` (runtime "nodejs", `dynamic:"force-dynamic"`, `auth()` 401 guard, owner-scoped reads/writes). Source of questions is `CandidateProfile.sectorPreferences.fields` (from Plan 12-2), NOT a SourcingCandidate.
    GET: return the next field whose `value` is empty as an `InteractiveResponse`-shaped payload — `{ question: { id: "sector:"+key, field: "sector:"+key, prompt: field.question, options: field.options, allowCustom: true }, answered:[...], done }`. Cap at 3 (D-04). Build the answered transcript in order (prompt + chosen/typed value) so it renders across sessions. Return `{ done: true, answered }` when all ≤3 are answered.
    POST: accept `{ questionId, chosenValue? | freeText?, locale? }` (exactly one of chosenValue/freeText, mirror sourcing's XOR guard). Resolve the field by key from `sectorPreferences.fields`. Clamp free-text (length cap, trim, strip control chars — V5, reuse the sourcing FREE_TEXT_MAX pattern). Write the resolved value into `sectorPreferences.fields[key].value` via `db.candidateProfile.update` (spread-preserve the other fields + sector + generatedLocale). NEVER write a profile column. Return neutral advance/done.
    In `confirm-policy.ts`, add a leading branch to `canConfirmOnboardingField`: `if (field.startsWith("sector:")) return true;` BEFORE the fixed Set check (Pitfall 3 defense-in-depth; the dedicated endpoint is the primary path). Do not remove or reorder existing allowlist entries.
    Keep the `sector:` prefix strictly distinct from `sourcing:`; do not import or mutate sourcing state.
  </action>
  <verify>
    <automated>npx vitest run tests/onboarding/sector-questions.test.ts</automated>
    Additional: `npm run build` → 0 errors.
  </verify>
  <done>Endpoint serves one sector MCQ at a time (allowCustom:true), persists answers into sectorPreferences.fields[].value, owner-scoped; confirm-policy accepts sector: fields; sourcing mode untouched.</done>
</task>

<task type="auto">
  <name>Task 2: Resume surfaces pending sector question + sectorPreferences</name>
  <files>src/app/api/onboarding/resume/route.ts</files>
  <action>
    Extend `restoreOnboardingState` so a returning user re-attaches ONLY a still-unanswered sector question chronologically (Anti-Pattern: never re-append answered Q&A at the end — mirror the sourcing resume fix). Include `sectorPreferences` (defs + values) in the rehydration payload so the chat + Preferences page can read it. Answered sector Q&A already live inline in `conversationHistory`; leave them in place. Keep the existing sourcing resume behavior working alongside (both modes independent). Order sector follow-ups within onboarding completion, BEFORE Phase 11 sourcing (Assumption A3).
  </action>
  <verify>
    <automated>npx vitest run tests/onboarding/sector-questions.test.ts</automated>
    Additional manual: refresh mid-sector-flow → the unanswered sector question reappears in place; answered ones stay where they occurred; sourcing resume still works.
  </verify>
  <done>Resume re-attaches only unanswered sector questions chronologically and exposes sectorPreferences; sourcing resume unaffected.</done>
</task>

<task type="auto">
  <name>Task 3: OnboardingCvUploadForm sector-mode wiring</name>
  <files>src/components/onboarding/OnboardingCvUploadForm.tsx</files>
  <action>
    Add a `sector:` branch parallel to the existing `sourcing:` wiring (mirror `applySourcingResponse` + `checkSourcingQuestions` at ~lines 273/297/518/926): a `checkSectorQuestions` that fetches `/api/onboarding/sector-questions?locale=${_locale}`, mints a synthetic `field = "sector:"+question.id` so the EXISTING MCQ option UI + free-text box render (D-07), and appends the pending question to history like sourcing does. On answer, POST to `/api/onboarding/sector-questions` distinguishing option vs free-text (reuse `submitAnswerValue(value, "option"|"freeText")`). Branch the submit/render on `field.startsWith("sector:")` alongside the existing `startsWith("sourcing:")` checks — do NOT merge the two prefixes. Preserve all existing CV upload, history, and sourcing behavior. Keep the cheerful tone strings coming from the server (do not add static English copy).
  </action>
  <verify>
    <automated>npm run build</automated>
    Additional manual: after target role is set for a non-engineer, up to 3 sector MCQs appear one-at-a-time in chat, each with buttons + a type-your-own box; answers persist; engineer users see NO sector questions.
  </verify>
  <done>Chat delivers sector MCQ follow-ups with type-your-own via the reused UI; sourcing mode still works; engineer users unaffected.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → sector-questions/route.ts | Untrusted questionId + chosen/typed answer cross into server. |
| free-text answer → stored JSON | Type-your-own text persists into sectorPreferences. |
| resume payload → client | Rehydrated defs/values sent to the owner only. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-12-09 | Info Disclosure/Elevation | sector-questions reads/writes | high | mitigate | Owner-scope every query to session.user.id; resolve field by key within the user's own sectorPreferences; 401 without session (V4). |
| T-12-10 | Tampering/XSS | LLM labels rendered in React | medium | mitigate | Keep option/field labels plain strings; React auto-escapes; never dangerouslySetInnerHTML sector copy (Security Domain). |
| T-12-11 | Tampering | free-text answer | medium | mitigate | Clamp length + trim + strip control chars before persist (V5, reuse sourcing FREE_TEXT_MAX). |
| T-12-12 | Tampering | mode collision | medium | mitigate | Distinct sector: prefix + dedicated endpoint; no shared state with sourcing: (Pitfall 4). |
| T-12-SC | Tampering | npm/pip/cargo installs | high | accept | No package installs — in-repo edits only. |
</threat_model>

<verification>
- `npm run build` → 0 errors.
- `npx vitest run tests/onboarding/sector-questions.test.ts` green.
- Manual: one-at-a-time sector MCQ with type-your-own; answers persist to sectorPreferences.fields[].value; refresh re-attaches only unanswered; sourcing mode uncollided; engineer users see none.
</verification>

<success_criteria>
Satisfies D-03/D-05 (persist + survive sessions), D-04 (≤3), D-07 (MCQ + type-your-own), D-08/D-09 (localized cheerful copy). No collision with sourcing:; no profile-column writes for sector answers.
</success_criteria>

<nyquist>
## Nyquist Validation Coverage
- `tests/onboarding/sector-questions.test.ts`: GET serves next unanswered field (≤3 cap); POST option vs free-text XOR + free-text clamp; answer writes into sectorPreferences.fields[key].value (not a column); confirm-policy accepts `sector:` and still rejects an unknown non-sector field; owner-scope 401/404 on foreign/absent user.
- Resume re-attach ordering + chat sector-mode render verified in the Plan 12-4 full-loop integration test (linked, not manual-only). UI branch is exercised via the integration test's request flow.
</nyquist>

<output>
Create `.planning/phases/12-dynamic-sector-aware-onboarding-flow-cv-first-upload-then-a-/12-3-SUMMARY.md` when done.
</output>
