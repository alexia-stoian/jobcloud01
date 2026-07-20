---
phase: 12-dynamic-sector-aware-onboarding-flow
plan: 4
type: execute
wave: 4
depends_on: [12-3]
files_modified:
  - src/components/profile/ProfileSummaryCard.tsx
  - src/app/api/profile/summary/route.ts
  - tests/onboarding/sector-flow.integration.test.ts
autonomous: false
requirements: [D-03, D-05, D-06, D-08, D-09]
user_setup: []

must_haves:
  truths:
    - "Profile > Preferences renders the universal-6 fields on top and, beneath them, the persisted sector-specific fields read from sectorPreferences (D-05, D-06)."
    - "Editing a sector field on the Preferences page persists via the existing debounced PATCH /api/profile/summary into sectorPreferences.fields[key].value."
    - "Engineer/default users (empty sectorPreferences) see the existing Preferences layout with NO dynamic sector block."
    - "The full 6-step loop works end-to-end: CV-first → target-role branch → sector generation → in-chat MCQ answers → persisted → rendered + editable on Preferences, in EN/DE/FR."
  artifacts:
    - "src/components/profile/ProfileSummaryCard.tsx (dynamic sector block)"
    - "src/app/api/profile/summary/route.ts (accept + persist sectorPreferences values)"
    - "tests/onboarding/sector-flow.integration.test.ts"
  key_links:
    - "ProfileSummaryCard reads sectorPreferences from the profile and writes edits through the existing debounced PATCH — no new autosave."
    - "PATCH /api/profile/summary spread-preserves sector field defs while updating values, scoped to session.user.id."
---

<objective>
Render and edit the sector store on Profile > Preferences: universal-6 on top (D-06) plus a dynamically-rendered block of the persisted sector fields (D-05), reusing the existing debounced `PATCH /api/profile/summary` for persistence (no new autosave). Localized copy comes straight from the stored `sectorPreferences` (D-08), cheerful tone preserved (D-09). Then prove the whole 6-step flow end-to-end in EN/DE/FR.

Purpose: Closes the loop — sector answers collected in chat become visible, editable preferences that persist across sessions, and a single integration test guards the entire flow against regression.
Output: dynamic sector block in ProfileSummaryCard; PATCH accepts sectorPreferences; full-loop integration test.
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
@.planning/phases/12-dynamic-sector-aware-onboarding-flow-cv-first-upload-then-a-/12-3-SUMMARY.md

@src/components/profile/ProfileSummaryCard.tsx
@src/app/api/profile/summary/route.ts
@src/app/(app)/profile/summary/page.tsx
@src/lib/onboarding/sector-fields.ts
@messages/en.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Accept + persist sectorPreferences values in PATCH</name>
  <files>src/app/api/profile/summary/route.ts</files>
  <action>
    Extend the `ProfileDraftPayload` type and the `PATCH` handler to accept an optional `sectorPreferences` object of `{ fields: Array<{ key, value }> }` (values only from the client — labels/questions/options are server-owned defs, never trusted from the client). Inside the existing `$transaction`, when present, read the current `sectorPreferences` for the user, map new values onto the matching field keys (spread-preserve sector, generatedLocale, label, question, options), clamp/trim each value (V5), and write back via `candidateProfile.update`. Do NOT let the client add/rename fields or change defs — only update `value` on existing keys. Keep all existing preference-column writes and completion recompute intact (do not regress the Preferences save path). Owner-scope to `session.user.id` (V4).
  </action>
  <verify>
    <automated>npx vitest run tests/onboarding/sector-flow.integration.test.ts</automated>
    Additional: `npm run build` → 0 errors.
  </verify>
  <done>PATCH persists sector field values into sectorPreferences.fields[].value without altering defs; client cannot inject new fields; existing column saves unaffected.</done>
</task>

<task type="auto">
  <name>Task 2: Dynamic sector block on Profile > Preferences</name>
  <files>src/components/profile/ProfileSummaryCard.tsx</files>
  <action>
    In the Preferences grid (mirror the existing fields around the preference block, ~line 1035), render the universal-6 (existing controls) on top, then a dynamic block that maps `profile.sectorPreferences.fields` to labeled controls: a `<select>` seeded from `f.options` with a type-your-own/free-text fallback, value bound to `f.value`, label = `f.label` (localized copy from the store, D-08). Render NOTHING when `sectorPreferences` is empty/`{}` (engineer/default users — Pitfall 5). Wire edits through the EXISTING debounced draft/localStorage + `PATCH /api/profile/summary` autosave (Don't Hand-Roll) by including `sectorPreferences.fields` (key+value) in the draft payload. Render labels as plain strings (no dangerouslySetInnerHTML — T-12-10). Do not change the universal fields' existing behavior.
  </action>
  <verify>
    <automated>npm run build</automated>
    Additional manual: a non-engineer profile shows universal-6 + its ≤3 sector fields with values pre-filled from chat answers; editing one and waiting for autosave persists it (reload confirms); an engineer profile shows the existing layout with no sector block.
  </verify>
  <done>Universal-6 + dynamic sector fields render from the store, edit + autosave via existing PATCH; empty store renders no block; localized labels shown.</done>
</task>

<task type="auto">
  <name>Task 3: Full-loop integration test (EN/DE/FR)</name>
  <files>tests/onboarding/sector-flow.integration.test.ts</files>
  <action>
    Add a Vitest integration test (mock `callAnthropic`, real `parseLlmJson`, in-memory/mocked Prisma per repo's Phase 11 integration-test pattern) covering the 6-step loop: (1) CV-first ordering respected; (2) with CV facts → CV-tailored target-role options, without → open-ended; (3) setting target role for a non-engineer fires generation once and persists ≤3 sector defs; (4) engineer role → sectorPreferences stays `{}`; (5) sector-questions GET/POST delivers each MCQ and stores the value into sectorPreferences.fields[].value (option AND free-text); (6) resume re-attaches only unanswered sector questions; (7) PATCH /api/profile/summary updates a sector value; (8) locale matrix: for locale in en/de/fr the generated/stored copy is the requested locale (assert generatedLocale + that a fixture's localized label round-trips). Assert LLM-null path degrades to universal-only without throwing (D-02). Reuse the `makeSectorFixture()` helper from Plan 12-1.
  </action>
  <verify>
    <automated>npx vitest run tests/onboarding/sector-flow.integration.test.ts</automated>
  </verify>
  <done>All 8 loop assertions + the null-degradation + EN/DE/FR locale matrix pass with no real network call.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client draft → PATCH | Untrusted sector values + potential extra keys cross into the store. |
| stored labels → React render | LLM-generated strings rendered on Preferences. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-12-13 | Tampering/Elevation | PATCH sectorPreferences | high | mitigate | Accept VALUES only; map onto existing keys; reject client-supplied defs/new fields; clamp values; owner-scope (V4/V5). |
| T-12-14 | Tampering/XSS | ProfileSummaryCard render | medium | mitigate | Plain-string labels; React auto-escape; no dangerouslySetInnerHTML. |
| T-12-15 | Info Disclosure | cross-user profile read | high | mitigate | GET/PATCH scoped to session.user.id (existing guard); never accept userId from client. |
| T-12-SC | Tampering | npm/pip/cargo installs | high | accept | No package installs — in-repo edits only. |
</threat_model>

<verification>
- `npm run build` → 0 errors.
- `npx vitest run tests/onboarding/sector-flow.integration.test.ts` green (full loop + EN/DE/FR + null degradation).
- Manual UAT (6-step): see checklist below.

## Manual UAT Checklist (6-step flow)
1. Open onboarding → the FIRST ask is CV upload.
2. Upload a teacher CV → target-role question is multiple-choice, CV-tailored (e.g. High school teacher / University lecturer), with a type-your-own box. (Skip CV → open-ended question instead.)
3. Pick/confirm a target role → it appears in Profile > Preferences > Target Role AND assistant memory; ≤3 sector fields generate.
4. Chat asks each sector field as one MCQ with type-your-own; answer all.
5. Profile > Preferences shows universal-6 on top + the ≤3 sector fields pre-filled; edit one → it persists on reload.
6. All copy is cheerful/emoji-rich; repeat in DE and FR → dynamic labels/options are localized. Confirm an engineer/software role keeps the current fields unchanged with no sector block.
</verification>

<success_criteria>
Satisfies D-03/D-05 (render + edit + persist across sessions), D-06 (universal-6 on top), D-08 (localized), D-09 (cheerful). Engineer flow unchanged. Full 6-step loop green end-to-end.
</success_criteria>

<nyquist>
## Nyquist Validation Coverage
- `sector-flow.integration.test.ts` is the Nyquist capstone: it exercises every step of the 6-step flow (ordering, branch, trigger, engineer short-circuit, MCQ persist, resume, PATCH, locale matrix, null degradation) — the behaviors flagged as "linked" in Plans 12-2/12-3 are asserted here rather than left manual-only.
- Preferences render/edit is component behavior verified through the PATCH round-trip assertion + manual UAT step 5. No production behavior is verified solely by eyeball.
</nyquist>

<output>
Create `.planning/phases/12-dynamic-sector-aware-onboarding-flow-cv-first-upload-then-a-/12-4-SUMMARY.md` when done.
</output>
