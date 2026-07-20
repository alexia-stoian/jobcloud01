---
phase: 12-dynamic-sector-aware-onboarding-flow
plan: 2
type: execute
wave: 2
depends_on: [12-1]
files_modified:
  - src/lib/onboarding/detect-target-role.ts
  - src/lib/onboarding/interactive.ts
  - src/app/api/onboarding/interactive/route.ts
  - tests/onboarding/target-role-question.test.ts
autonomous: true
requirements: [D-01, D-02, D-03, D-06, D-08, D-09]
user_setup: []

must_haves:
  truths:
    - "The assistant's first ask in onboarding is the CV upload; only after that (or an explicit skip) does the target-role question appear."
    - "With CV facts present, the target-role question is a CV-tailored multiple-choice (e.g. a math-teacher CV surfaces High school teacher / University lecturer) with type-your-own; without a CV it is open-ended."
    - "When the target role becomes set in BOTH CandidateProfile.targetRoles AND OnboardingSession.targetRole, sector generation fires exactly once and persists defs to sectorPreferences (idempotent per role+locale)."
    - "Non-engineer users get the universal-6 questions; engineer/default users keep the existing POST_CV_PREFERENCE_FLOW unchanged with an empty sectorPreferences."
  artifacts:
    - "src/lib/onboarding/detect-target-role.ts (generateTargetRoleQuestion)"
    - "src/lib/onboarding/interactive.ts (universal-6 subset flow + engineer short-circuit helper)"
    - "src/app/api/onboarding/interactive/route.ts (CV-first ordering + sector-generation trigger)"
    - "tests/onboarding/target-role-question.test.ts"
  key_links:
    - "The sector trigger hangs off the SAME target-role-set event as Phase 10 dual-write (targetRoles + OnboardingSession.targetRole) — no new detection path."
    - "interactive/route.ts calls classifySectorAndGenerateFields from Plan 12-1 and writes CandidateProfile.sectorPreferences."
---

<objective>
Wire the onboarding sequencing and the sector trigger: make CV upload the first ask, branch the target-role question into CV-tailored MCQ (with CV facts) vs open-ended (D-01 source event, D-08 localized), and — when the target role is set in both memory and profile — fire the Plan 12-1 generator once and persist the ≤3 sector field defs (D-03), while keeping engineer/default users on the unchanged existing flow and non-engineer users on the universal-6 (D-06). LLM null → universal-only, never block (D-02). All new copy stays cheerful (D-09).

Purpose: This is the control-flow spine of the 6-step flow. It defines WHEN sector fields are generated without regressing Phase 10 target-role binding or the CV extraction path.
Output: `generateTargetRoleQuestion`; universal-6 subset + engineer short-circuit in interactive.ts; trigger + CV-first ordering in interactive/route.ts; unit tests.
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
@.planning/phases/12-dynamic-sector-aware-onboarding-flow-cv-first-upload-then-a-/12-1-SUMMARY.md

@src/lib/onboarding/detect-target-role.ts
@src/lib/onboarding/detect-target-role-llm.ts
@src/lib/onboarding/interactive.ts
@src/app/api/onboarding/interactive/route.ts
@src/app/api/onboarding/assistant/route.ts
@src/lib/onboarding/persist.ts
@src/lib/onboarding/sector-fields.ts
@prompts/prompt.txt
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: CV-tailored vs open-ended target-role question generator</name>
  <files>src/lib/onboarding/detect-target-role.ts, tests/onboarding/target-role-question.test.ts</files>
  <behavior>
    - With empty/absent cvFacts → returns { prompt: getTargetRoleQuestion(locale), allowCustom: true } and NO options (open-ended branch).
    - With cvFacts present and the LLM returning options → returns a localized cheerful prompt + 2..~5 tailored option labels + allowCustom:true (a math-teacher CV yields role options like "High school teacher"/"University lecturer").
    - With cvFacts present but the LLM returning null → falls back to the open-ended static question (null-safe, D-02), never throws.
    - Option labels are localized to the active locale (D-08) and sanitized (control chars stripped, length-clamped, V5).
  </behavior>
  <action>
    Add `generateTargetRoleQuestion(args: { locale: "en"|"de"|"fr"; cvFacts?: Record<string, unknown> | null }): Promise<{ prompt: string; options?: Array<{ value: string; label: string }>; allowCustom: true }>` (Pattern 3). Reuse the existing localized `getTargetRoleQuestion` for the open-ended branch. For the CV branch, call a small `classifyRoleOptionsFromCv` helper that reuses `callAnthropic` + `parseLlmJson` (do NOT hand-roll a fetch) with a strict-JSON prompt: frame cvFacts as UNTRUSTED data, ask for a cheerful localized target-role MCQ tailored to the CV, respond in the active locale (D-08). Normalize/clamp options like Plan 12-1. Leave `getTargetRoleAck` and the Phase 10 assistant-route path UNTOUCHED (Open Question 3 — avoid Phase 10 regression). Add the tests in the same commit.
  </action>
  <verify>
    <automated>npx vitest run tests/onboarding/target-role-question.test.ts</automated>
  </verify>
  <done>Both branches proven; CV-null falls back to open-ended; options localized + sanitized; getTargetRoleAck unchanged.</done>
</task>

<task type="auto">
  <name>Task 2: Universal-6 subset flow + engineer short-circuit helper</name>
  <files>src/lib/onboarding/interactive.ts</files>
  <action>
    Per D-06, expose a universal-6 subset of preference questions — Current situation (`currentJobSituation`), Work rate (`workRate`), Contract type (`contractPreference`), Work permit (`workPermitStatus`), Salary expectation (`salaryExpectation`), Preferred location (`preferredLocation`) — drawn from the EXISTING `POST_CV_PREFERENCE_FLOW` question objects (reuse their prompts/options verbatim; do not rewrite their copy). Add a helper that, given a resolved sector decision (`usesDefaultFields`), returns either the full existing `POST_CV_PREFERENCE_FLOW` (engineer/default — UNCHANGED, Pitfall 5) or the universal-6 subset (non-engineer). Do NOT widen the `InteractiveQuestion.field` union with sector keys (Anti-Pattern) — sector fields are delivered separately in Plan 12-3. Keep `getInteractiveQuestionState`/`getInteractiveQuestionStateForMode` signatures backward compatible so Phase 2/5/10/11 callers do not break.
  </action>
  <verify>
    <automated>npx vitest run tests/onboarding/target-role-question.test.ts</automated>
    Additional: `npm run build` → 0 errors (union unchanged; existing callers compile).
  </verify>
  <done>Universal-6 subset selectable for non-engineer; engineer path returns the unchanged full flow; no field-union change; existing callers compile.</done>
</task>

<task type="auto">
  <name>Task 3: CV-first ordering + fire sector generation on target-role-set</name>
  <files>src/app/api/onboarding/interactive/route.ts</files>
  <action>
    (a) CV-first: ensure the first ask surfaced is the CV upload before any target-role/preference question (respect the existing `hasCvUpload` / `currentStep:"questioning"` gating from persist.ts; do not change CV extraction — CVIN-* must not regress). Use `generateTargetRoleQuestion` (Task 1) to render the target-role ask, branching on `cvExtractedFacts` from OnboardingSession.
    (b) Trigger: after the target-role answer is persisted and BOTH `CandidateProfile.targetRoles` AND `OnboardingSession.targetRole` are populated (the Phase 10 dual-write event — reuse existing `primaryRole`→`targetRoles` mirror; do NOT add a second detector), call `classifySectorAndGenerateFields({ targetRole, locale, cvContext })` from Plan 12-1 exactly once. Resolve locale server-side from `CandidateProfile.locale` with request-locale fallback (Pitfall 2). Idempotency: skip if `sectorPreferences.sector` already set for the same targetRole+locale (Anti-Pattern: no regeneration per request). On a non-null result with `usesDefaultFields:false`, persist `{ sector, generatedLocale, fields:[...] }` to `CandidateProfile.sectorPreferences` (scoped to `session.user.id`, V4). On `usesDefaultFields:true` OR null, leave `sectorPreferences` at `{}` and continue with universal/existing flow (D-02, engineer short-circuit). Scope every read/write to the authenticated user; keep the existing stale-JWT user-exists guard.
    (c) Select the flow from Task 2's helper based on the persisted sector decision.
  </action>
  <verify>
    <automated>npm run build</automated>
    Additional manual: with a seeded CV, answering the target role once writes a non-empty `sectorPreferences` for a non-engineer role and leaves it `{}` for an engineering role; a second identical request does NOT regenerate.
  </verify>
  <done>CV is first ask; target-role answer triggers exactly one generation; non-engineer persists defs, engineer/null stays {}; idempotent; owner-scoped; Phase 10 dual-write intact.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → interactive/route.ts | Untrusted answers + locale cross into server flow. |
| cvFacts / targetRole → LLM | User/CV data flows into role + sector prompts. |
| profile store ↔ session | sectorPreferences written per authenticated user only. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-12-05 | Elevation/Info | interactive/route.ts writes | high | mitigate | Scope every sectorPreferences read/write to session.user.id; never accept userId from client; keep stale-JWT user-exists guard (V4). |
| T-12-06 | Tampering | generateTargetRoleQuestion prompt | high | mitigate | Frame cvFacts as untrusted data; clamp/sanitize option labels before render (V5). |
| T-12-07 | DoS | sector generation on every request | medium | mitigate | Idempotent generation (skip if sector already set for role+locale); one call at the trigger only. |
| T-12-08 | Repudiation/Regression | Phase 10 dual-write | high | mitigate | Reuse existing target-role-set event; leave getTargetRoleAck + assistant route untouched. |
| T-12-SC | Tampering | npm/pip/cargo installs | high | accept | No package installs — in-repo edits only. |
</threat_model>

<verification>
- `npm run build` → 0 errors.
- `npx vitest run tests/onboarding/target-role-question.test.ts` green.
- Manual: CV-first ordering holds; non-engineer role persists sectorPreferences; engineer role leaves it `{}`; regeneration is idempotent; Phase 10 target-role binding still writes both fields.
</verification>

<success_criteria>
Satisfies D-01/D-08 (CV-tailored vs open-ended localized question), D-02 (null → universal-only), D-03 (persist defs on trigger), D-06 (universal-6), D-09 (cheerful copy). No regression to CVIN-*/AION-*/Phase 5/Phase 10.
</success_criteria>

<nyquist>
## Nyquist Validation Coverage
- Automated (Vitest): target-role branch (CV vs open-ended), CV-null fallback, option localization/sanitization (Task 1) — all in `<behavior>`.
- Trigger idempotency + persist-vs-skip (Task 3) is an API-flow behavior asserted end-to-end in Plan 12-4's integration test (full loop); flagged here as the Nyquist link so it is not left manual-only. Engineer short-circuit unit-covered in Plan 12-1 + flow-covered in 12-4.
</nyquist>

<output>
Create `.planning/phases/12-dynamic-sector-aware-onboarding-flow-cv-first-upload-then-a-/12-2-SUMMARY.md` when done.
</output>
