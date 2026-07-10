# Phase 2: CV-Aware Guided Onboarding - Context

**Gathered:** 2026-07-09
**Status:** Ready for planning
**Source:** Phase 2 planning + AI design contract

<domain>
## Phase Boundary

Deliver CV-aware onboarding that can ingest uploaded CV content, prefill or propose profile data, and guide the user through role-relevant clarification questions without locking in unconfirmed facts.

</domain>

<decisions>
## Implementation Decisions

### CV ingestion and grounding
- CV upload is part of the onboarding flow, not a separate post-login utility.
- Extracted CV details are provisional until the user confirms them.
- Parsed facts may prefill or propose profile values, but they must not become canonical without confirmation.
- Partial or incomplete CV parsing must still allow onboarding to continue.

### Questioning behavior
- The assistant must ask role-relevant follow-up questions tied to the uploaded CV and the user’s target role.
- Questions must stay inside the job-search / candidate-profiling domain.
- Ambiguous or unclear CV items must be surfaced for clarification rather than guessed.
- Users must be able to skip individual onboarding questions and return later.

### State and confirmation model
- Skip state is first-class and must survive across turns.
- Confirmed facts and unconfirmed suggestions must remain separate in state.
- Only explicit confirmation can promote inferred data into saved profile data.
- The user should always be able to continue the flow even when some items remain unresolved.

### Localization and user experience
- Phase 2 must preserve EN/DE/FR semantics across prompts, labels, and confirmations.
- Profile and onboarding language must stay aligned with the selected locale.
- Skip/resume prompts and clarification text must be localized as part of the onboarding flow.

### the agent's Discretion
- Exact upload UX, progress presentation, and whether extraction is synchronous or staged are implementation choices.
- Internal graph node naming, persistence layout, and prompt structure are left to implementation as long as the confirmation and skip rules above hold.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product and scope anchors
- `.planning/PROJECT.md` - Product intent, constraints, and out-of-scope boundaries.
- `.planning/ROADMAP.md` - Phase 2 goal, dependencies, and success criteria.
- `.planning/STATE.md` - Current workflow status and planning progression.

### Phase 1 foundation
- `.planning/phases/01-account-language-and-candidate-profile-foundation/01-CONTEXT.md` - Phase 1 decisions, locale/account, and profile foundation.
- `.planning/phases/01-account-language-and-candidate-profile-foundation/01-PLAN.md` - Implemented baseline slices and guardrails.
- `.planning/phases/01-account-language-and-candidate-profile-foundation/01-SUMMARY.md` - Verified Phase 1 outcomes.

### AI design contract
- `.planning/AI-SPEC.md` - Phase 2 AI architecture, domain context, evaluation strategy, and guardrails.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Authenticated account and profile foundation from Phase 1.
- Locale persistence and translation catalog structure from the existing multilingual app.
- Account-scoped candidate profile storage and profile history concepts.

### Established Patterns
- Server-side auth gating and request-time user resolution.
- Translation-driven UI copy in EN/DE/FR.
- Profile changes are account-specific and must not leak between users.

### Integration Points
- A new onboarding route or section should connect to the existing authenticated app shell.
- CV extraction and question orchestration should write into the candidate profile model rather than creating a parallel data store.
- The onboarding flow should reuse the existing locale and profile persistence paths.

</code_context>

<specifics>
## Specific Ideas

- The assistant should ask relevant profile-building questions instead of replaying a canned example conversation.
- The flow should feel like guided employer-style intake, not a generic chatbot.
- CV parsing should prioritize clarification over certainty when information is incomplete or ambiguous.
- Skip/resume handling should be visible enough that users trust they can continue later.

</specifics>

<deferred>
## Deferred Ideas

- General-purpose career coaching beyond onboarding.
- Job application automation.
- Long-term memory/readiness scoring belongs to later phases.

</deferred>

---

*Phase: 2-CV-Aware Guided Onboarding*
*Context gathered: 2026-07-09*