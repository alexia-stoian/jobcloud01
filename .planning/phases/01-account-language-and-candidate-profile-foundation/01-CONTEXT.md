# Phase 1: Account, Language, And Candidate Profile Foundation - Context

**Gathered:** 2026-07-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver secure account access, EN/DE/FR language experience, and a durable baseline candidate profile that users can create, edit anytime, and reuse in later AI-guided phases.

</domain>

<decisions>
## Implementation Decisions

### Account flow and access
- **D-01:** Use email/password authentication for Phase 1.
- **D-02:** Signup is direct (no invite code or waitlist gate).
- **D-03:** Email verification is required.
- **D-04:** Session should persist across returns so users can continue with saved profile data.
- **D-05:** Password reset is required.
- **D-06:** Auth surfaces must be localized for English, German, and French.

### Language UX
- **D-07:** Language switcher is always visible in the header.
- **D-08:** Selected language is saved to the user account/profile.
- **D-09:** Language switching applies immediately.
- **D-10:** Profile-related text shown to the user should also be translated by the selected locale.

### Profile fields and validation
- **D-11:** Salary expectations are optional in Phase 1.
- **D-12:** Work permit/authorization is always required.
- **D-13:** Qualifications/certifications are captured as an editable list with add/remove item behavior.
- **D-14:** Phase-1 profile completion gate is minimal: name, location, primary role, language, and permit status.
- **D-15:** Required fields use soft-warning validation (not hard blocking).
- **D-16:** Primary role uses suggestions with free-text fallback.
- **D-17:** Profile fields can be changed by the user at any time.

### Profile editing model
- **D-18:** Profile build/edit interaction in Phase 1 is chat-only.
- **D-19:** Editing is available anytime from profile settings.
- **D-20:** AI suggestions require explicit user review and confirmation before applying.
- **D-21:** Include full profile change history in Phase 1.

### the agent's Discretion
- No explicit discretion areas were delegated; decisions were user-directed.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product and scope anchors
- `.planning/PROJECT.md` - Product intent, constraints, and out-of-scope boundaries.
- `.planning/REQUIREMENTS.md` - Requirement IDs and phase traceability for Phase 1.
- `.planning/ROADMAP.md` - Phase 1 goal, dependencies, and success criteria.
- `.planning/STATE.md` - Current workflow status and planning progression.

### Research context
- `.planning/research/SUMMARY.md` - Synthesized stack and implementation guidance baseline.
- `.planning/research/STACK.md` - Chosen platform and library direction.
- `.planning/research/ARCHITECTURE.md` - System architecture direction for upcoming phases.
- `.planning/research/FEATURES.md` - Feature decomposition context.
- `.planning/research/PITFALLS.md` - Known implementation risks and mitigation cues.

### UX references provided by user
- `images/img1.png` - Landing/auth visual reference.
- `images/img2.png` - AI onboarding/profile visual reference.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- No application-level components or utilities were identified in the current workspace snapshot.

### Established Patterns
- Planning-first workflow is established via `.planning/*` artifacts and GSD phase lifecycle.

### Integration Points
- New Phase 1 implementation should align directly with requirements and roadmap artifacts under `.planning/`.

</code_context>

<specifics>
## Specific Ideas

- Keep multilingual UX consistently visible and persistent, not hidden in settings.
- Preserve user control over profile data changes at all times.
- Favor review-before-apply behavior for AI-generated profile suggestions.
- Use the two provided UI images as directional references for landing/auth and onboarding feel.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 1-Account, Language, And Candidate Profile Foundation*
*Context gathered: 2026-07-08*
