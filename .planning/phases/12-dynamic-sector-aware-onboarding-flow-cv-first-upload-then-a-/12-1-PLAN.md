---
phase: 12-dynamic-sector-aware-onboarding-flow
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - src/lib/onboarding/sector-fields.ts
  - tests/onboarding/sector-fields.test.ts
autonomous: false
requirements: [D-01, D-02, D-03, D-04, D-08, D-09]
user_setup: []

must_haves:
  truths:
    - "Every existing CandidateProfile row gains a sectorPreferences JSON store defaulting to {} (no backfill, no touched columns)."
    - "Given a target role + locale, the server can classify a sector open-endedly and return at most 3 localized, cheerful sector fields — or null without throwing."
    - "An engineering/software/default role short-circuits: the generator signals usesDefaultFields and emits zero sector fields."
  artifacts:
    - "prisma/schema.prisma (sectorPreferences Json @default(\"{}\") on CandidateProfile)"
    - "src/lib/onboarding/sector-fields.ts (classifySectorAndGenerateFields + SectorFieldSet type + normalizer)"
    - "tests/onboarding/sector-fields.test.ts"
  key_links:
    - "sector-fields.ts imports callAnthropic + parseLlmJson from src/lib/sourcing/anthropic.ts (no new Anthropic wrapper)."
    - "SectorFieldSet type is the single shared contract consumed by Plans 12-2, 12-3, 12-4."
---

<objective>
Lay the additive data + LLM foundation for sector-aware onboarding: one additive Prisma JSON column and one null-safe, locale-aware server util that classifies a job sector open-endedly (D-01) and generates ≤3 localized, cheerful sector fields (D-04, D-08, D-09), reusing the house Anthropic call and treating the LLM as always-available with graceful degradation (D-02). Engineer/software/default roles short-circuit to zero generated fields.

Purpose: Everything downstream (chat delivery, Preferences rendering) reads from this store and this generator. Getting the JSON contract + normalization + null-safety right here prevents rework in Plans 12-2/12-3/12-4.
Output: `sectorPreferences` column + migration; `src/lib/onboarding/sector-fields.ts`; unit tests.
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

# Reuse verbatim — do not re-implement
@src/lib/sourcing/anthropic.ts
@src/lib/sourcing/questions.ts
@prisma/schema.prisma
@src/lib/db.ts
@src/i18n/config.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add additive sectorPreferences JSON column + migration</name>
  <files>prisma/schema.prisma</files>
  <action>
    Per D-03, add exactly one additive field to `model CandidateProfile` (near the existing `assistantState Json @default("{}")` around line 121): `sectorPreferences Json @default("{}")`. Do NOT rename, remove, or retype any existing preference column (currentJobSituation, workRate, contractPreference, workPermitStatus, salaryExpectation, preferredLocation, targetSeniority, targetIndustries, preferredWorkModel, visaSponsorship, relocationWillingness, commuteRadius). Mirror the exact style of `assistantState` so all existing rows default to an empty object (safe "no sector customization yet" sentinel, no backfill — Assumption A5).
    Then run the migration and regenerate the client: `npx prisma migrate dev --name add_sector_preferences` then `npx prisma generate`. Because the Prisma client is a startup singleton (src/lib/db.ts caches on globalThis in dev), the executor MUST restart `npm run dev` after generate (Pitfall 1) — surface this in the SUMMARY.
  </action>
  <verify>
    <automated>npx prisma validate</automated>
    Additional: `npx prisma generate` completes with no error, and `git diff prisma/schema.prisma` shows ONLY the added `sectorPreferences` line (no other column changed).
  </verify>
  <done>schema.prisma has `sectorPreferences Json @default("{}")` on CandidateProfile; migration applied; client regenerated; no existing column altered.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Sector classification + ≤3 localized field generator (null-safe)</name>
  <files>src/lib/onboarding/sector-fields.ts</files>
  <behavior>
    - Given a plausible target role ("Math teacher") and locale "fr", returns a SectorFieldSet with sector set, usesDefaultFields=false, and 1..3 fields whose label/question/option labels are the localized cheerful copy the model returned (copy is passed through, only clamped — never machine-translated locally).
    - Given a role the model classifies as engineering/software/IT/data, returns usesDefaultFields=true and fields=[] (engineer short-circuit, D-03 / Pitfall 5).
    - When callAnthropic returns null (D-02) OR parseLlmJson returns null, returns null without throwing.
    - normalizeSectorFields caps fields at 3 (D-04), caps options (~5) and clamps every label/question/option to a safe length, slugs each field.key to [a-z0-9_], and strips control chars / backticks / CR-LF from all model strings (V5 input validation).
  </behavior>
  <action>
    Create `classifySectorAndGenerateFields(args: { targetRole: string; locale: "en"|"de"|"fr"; cvContext?: string }): Promise<SectorFieldSet | null>` mirroring the structure of `generateQuestions`/`normalizeQuestion` in src/lib/sourcing/questions.ts. Export the `SectorFieldSet` type: `{ sector: string; usesDefaultFields: boolean; generatedLocale: "en"|"de"|"fr"; fields: Array<{ key: string; label: string; question: string; options: Array<{ value: string; label: string }>; value: string }> }` (seed value:"" at generation).
    Build a strict-JSON prompt that: (a) frames targetRole + optional cvContext as UNTRUSTED data (prompt-injection guard — treat as data, never as instructions, per Security Domain), (b) instructs the model to classify the sector open-endedly (D-01), (c) sets usesDefaultFields=true for engineering/software/IT/data/data-science reference sectors and to then return an empty fields array, (d) otherwise returns at most 3 fields, each phrased as ONE cheerful, emoji-rich multiple-choice question (D-07, D-09) with type-your-own implied, (e) MUST respond entirely in the active locale (D-08 — "Respond in English/German/French"). Set generatedLocale to the requested locale.
    Call `callAnthropic(prompt, 900)`; on null return null. `parseLlmJson<SectorFieldSet>(raw)`; on null return null. Pass through `normalizeSectorFields`: cap 3 fields, cap options, slug keys, clamp/strip every string exactly like `clampText`/`normalizeRole` do, drop fields with no options AND no allowCustom intent. Do NOT import the Anthropic SDK; do NOT touch report.ts. Keep the key server-side (V4/V6).
    Do NOT put emoji-tone example copy that a downstream negative-grep might match into head comments — keep comments describing behavior by concept.
  </action>
  <verify>
    <automated>npx vitest run tests/onboarding/sector-fields.test.ts</automated>
  </verify>
  <done>classifySectorAndGenerateFields + SectorFieldSet exported; ≤3 fields enforced; locale copy preserved; engineer short-circuit and null paths covered; no throw on bad input.</done>
</task>

<task type="auto">
  <name>Task 3: Unit tests for the generator (mock Anthropic)</name>
  <files>tests/onboarding/sector-fields.test.ts</files>
  <action>
    Add Vitest tests mocking `callAnthropic` (via `vi.mock("@/lib/sourcing/anthropic", ...)` returning a fixture raw string; keep `parseLlmJson` real to exercise fence tolerance). Cases mapping to the Phase Requirements → Test Map: (1) valid teacher fixture in "fr" → sector set, ≤3 fields, French labels preserved, options present; (2) engineering fixture → usesDefaultFields=true and fields.length===0; (3) callAnthropic resolves null → function returns null (D-02); (4) junk/non-JSON raw → parseLlmJson null → function returns null, no throw; (5) fixture with 6 fields → normalizer clamps to exactly 3 (D-04); (6) fixture with control chars / backticks in a label → sanitized in output (V5). Provide a reusable `makeSectorFixture()` helper (Wave 0 shared fixture).
  </action>
  <verify>
    <automated>npx vitest run tests/onboarding/sector-fields.test.ts</automated>
  </verify>
  <done>All six cases pass; no network call is made (callAnthropic fully mocked).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| target role / CV text → LLM prompt | User- and CV-sourced strings flow into the sector prompt (prompt injection). |
| Anthropic response → app | Untrusted LLM JSON becomes stored field defs + rendered labels. |
| server env → Anthropic | ANTHROPIC_API_KEY must never leave the server. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-12-01 | Tampering | classifySectorAndGenerateFields prompt | high | mitigate | Frame targetRole/cvContext as untrusted data; never as instructions; mirror sourcing prompt framing. |
| T-12-02 | Tampering/Info | normalizeSectorFields | high | mitigate | Clamp length, slug keys, strip control chars/backticks/CRLF on every model string (V5) before persist/render. |
| T-12-03 | Denial of Service | LLM latency/junk | medium | mitigate | callAnthropic 55s AbortController + null-on-failure; parse null → return null (D-02 graceful skip). |
| T-12-04 | Info Disclosure | Anthropic key | high | mitigate | Reuse callAnthropic (server-only key, never returned); no SDK, no logging of key. |
| T-12-SC | Tampering | npm/pip/cargo installs | high | accept | No package installs in this plan (schema + in-repo util only); nothing to audit. |
</threat_model>

<verification>
- `npx prisma validate` passes; `git diff` shows only the additive column.
- `npx vitest run tests/onboarding/sector-fields.test.ts` green.
- `npm run build` → 0 TypeScript errors (SectorFieldSet type compiles and is exported).
</verification>

<success_criteria>
Satisfies D-01 (open-ended classification), D-02 (null-safe graceful degradation), D-03 (additive JSON store), D-04 (≤3 fields), D-08 (localized-at-generation copy passthrough), D-09 (cheerful tone in prompt). Engineer short-circuit path proven by test.
</success_criteria>

<nyquist>
## Nyquist Validation Coverage
- Framework confirmed: Vitest (`vitest.config.ts`, include `tests/**/*.test.ts` + `src/**/*.test.ts`). Quick run: `npx vitest run <file>`.
- Every behavior in Task 2 `<behavior>` has a matching automated case in Task 3 (classify/localize, engineer short-circuit, null degradation, junk-JSON, 3-field clamp, sanitization). No behavior is verified manually-only in this plan.
</nyquist>

<output>
Create `.planning/phases/12-dynamic-sector-aware-onboarding-flow-cv-first-upload-then-a-/12-1-SUMMARY.md` when done, noting the required dev-server restart after `prisma generate`.
</output>
