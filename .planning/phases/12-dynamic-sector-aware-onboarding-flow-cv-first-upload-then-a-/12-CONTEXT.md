# Phase 12: Dynamic Sector-Aware Onboarding Flow - Context

**Gathered:** 2026-07-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a sector-aware onboarding/preferences flow driven by the AI assistant, in this order:

1. **CV first** — the assistant's first ask is the user's CV upload.
2. **Target-role question** —
   - **With a CV:** ask target role as a **multiple-choice** question whose options are **tailored to the CV content** (e.g. a "math teacher" CV surfaces "High school teacher", "University lecturer", …).
   - **Without a CV:** ask target role as an **open-ended** question.
3. **Dynamic Preferences fields** — once the target role is set in BOTH the assistant's memory AND `Profile > Preferences > Target Role` for that user, customize the Preferences fields to the detected **job sector** (teacher, firefighter, construction, engineer, marketing, PR, HR, …). **Engineers keep the current fields as-is.** At most **3 sector-specific fields** are shown.
4. **Sector-specific follow-up questions** — the ≤3 sector fields ARE the follow-ups: each is asked in-chat as a **multiple-choice** question that also allows the user to **type their own** answer.
5. **Universal fields** — always present, on top of the sector-specific ones.
6. **Tone** — keep the established cheerful, enthusiastic, emoji-rich personality throughout (per `prompts/prompt.txt`).

**Out of scope:** changing scoring/matching, sourcing, or non-onboarding surfaces; adding brand-new profile capabilities beyond sector-aware preference fields.

</domain>

<decisions>
## Implementation Decisions

### Sector detection
- **D-01:** The assistant uses the **LLM to classify the job sector open-endedly** from the target role (any sector works — teacher, firefighter, PR, HR, etc.) and to **generate the most relevant fields** for that sector. Not limited to a curated list.
- **D-02:** The LLM is treated as **always available** — do not build an elaborate offline fallback path (graceful degradation only, no dedicated fallback UX required).

### Dynamic fields — storage & persistence
- **D-03:** Sector-specific field definitions + values are **persisted per-user and survive across sessions**, surfaced in **Profile > Preferences**. Store them on the candidate profile as structured data (recommended: a new additive `sectorPreferences` JSON field on `CandidateProfile` holding `{ sector, fields: [{ key, label, value, options }] }`) — engineer/default columns stay untouched (additive migration only).
- **D-04:** Maximum **3 sector-specific fields** shown/stored per user.

### Preferences UI scope
- **D-05:** Sector-specific fields are **both** collected in the onboarding chat **and rendered dynamically on the Profile > Preferences page** (read from the persisted store), alongside the universal fields.

### Universal fields (always present)
- **D-06:** The always-present universal set is: **Current situation, Work rate, Contract type, Work permit, Salary expectation, Preferred location.** These render on top of the sector-specific fields for every sector.

### Fields ↔ follow-up questions relationship
- **D-07:** The ≤3 sector fields **ARE** the follow-up questions — each field is asked as **one multiple-choice question** (with a type-your-own option). No separate extra question set beyond the 3.

### Localization
- **D-08:** Dynamically generated field **labels, questions, and options are localized to the user's active locale (EN/DE/FR)**.

### Tone
- **D-09:** All new copy stays in the cheerful, emoji-rich personality from `prompts/prompt.txt` (reduced-emoji applies only to mock-interview mode, which is not part of this phase).

### the agent's Discretion
- Exact JSON shape of the sector-field store, the LLM prompt design for sector/field generation, MCQ option counts, and how the dynamic Preferences renderer is wired are left to research/planning — as long as the decisions above hold.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Personality / tone
- `prompts/prompt.txt` — the full cheerful, emoji-rich personality guide; §"YOUR PERSONALITY & TONE" and the mock-interview exception.

### Roadmap / requirements
- `.planning/ROADMAP.md` — Phase 12 entry (this phase) and prior onboarding phases (2, 5, 10).
- `.planning/REQUIREMENTS.md` — CVIN-*/AION-* onboarding requirements the flow must not regress.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/api/onboarding/interactive/route.ts` — the structured quick-flow question engine (fields, MCQ options, save-to-profile). The dynamic sector fields/questions plug in here.
- `src/lib/onboarding/interactive.ts` — `getInteractiveQuestionStateForMode` defines the current (engineer-oriented) preference fields/questions; the universal vs sector-specific split builds on this.
- `src/lib/onboarding/detect-target-role-llm.ts` + `detect-target-role.ts` — existing LLM target-role detection + `getTargetRoleQuestion`/`getTargetRoleAck`; extend for CV-tailored MCQ options vs open-ended.
- `src/components/onboarding/OnboardingCvUploadForm.tsx` — the onboarding chat UI (MCQ rendering + type-your-own input already exist; sector questions reuse this).
- `src/app/api/onboarding/resume/route.ts` — resume/rehydrate; must include the new sector fields.
- `src/lib/sourcing/anthropic.ts` (pattern) / house Anthropic fetch pattern — reuse for the sector/field generation call (raw fetch, `x-api-key`, fence-tolerant JSON parse, null-on-failure).
- Profile Preferences UI under `src/components/profile/` + `src/app/(app)/profile/summary` — where dynamic sector fields render.

### Established Patterns
- `CandidateProfile` has FIXED preference columns (`currentJobSituation`, `workRate`, `contractPreference`, `preferredWorkModel`, `salaryExpectation`, `targetSeniority`, `targetIndustries`, `workPermitStatus`, `visaSponsorship`, `relocationWillingness`, `commuteRadius`, …) → sector-specific fields must live in a flexible JSON store, not new columns.
- Onboarding writes both `CandidateProfile.targetRoles` and `OnboardingSession.targetRole` (Phase 10 dynamic target-role binding) — the sector customization triggers off this same "target role set" event.
- Prisma client is a startup singleton (`src/lib/db.ts`) — a migration requires a dev-server restart + `npx prisma generate`.
- i18n via `messages/{en,de,fr}.json` + next-intl; dynamic LLM-generated copy is localized at generation time, not via static keys.

### Integration Points
- Trigger point: when the target role is confirmed (both memory + profile) → classify sector → generate ≤3 localized fields → persist → deliver as MCQ follow-ups in chat → render on Profile > Preferences.

</code_context>

<specifics>
## Specific Ideas

- CV-tailored role options example given by the user: a CV mentioning "math teacher" should surface options like "High school teacher", "University lecturer", etc.
- Sector examples the agent must differentiate: teacher, firefighter, construction worker, engineer (keep current fields), marketing, PR, HR.
- Engineers are the reference/default sector — their existing preference fields stay exactly as they are today.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 12-dynamic-sector-aware-onboarding-flow*
*Context gathered: 2026-07-20*
