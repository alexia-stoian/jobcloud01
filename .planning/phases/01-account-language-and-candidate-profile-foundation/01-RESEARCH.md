# Phase 1: Account, Language, And Candidate Profile Foundation - Research

**Date:** 2026-07-08  
**Scope:** Phase 1 only (AUTH, LOCL, PROF requirements)

## User Constraints (from 01-CONTEXT.md)

- Email/password auth only for Phase 1, with required email verification and password reset.
- Session must persist across returns.
- Auth pages and flows must be localized for EN/DE/FR.
- Language switcher is always visible in header.
- Language switch applies immediately and persists to account/profile.
- Profile text shown to users must be translated by selected locale.
- Salary expectations optional; work permit required.
- Qualifications/certifications are editable list items.
- Minimal completion gate: name, location, primary role, language, permit status.
- Required fields use soft-warning validation (not hard blocking).
- Primary role uses suggestions plus free-text fallback.
- Profile fields are user-editable anytime.
- Profile build/edit is chat-only in Phase 1.
- AI suggestions must be user-reviewed and explicitly confirmed before apply.
- Full profile change history is required in Phase 1.

## Phase Requirements In Scope

- AUTH-01, AUTH-02, AUTH-03, AUTH-04
- LOCL-01, LOCL-02, LOCL-03
- PROF-01 through PROF-12

## Standard Stack Choices for Phase 1

- **Framework:** Next.js (App Router) + TypeScript.
- **Database:** PostgreSQL + Prisma.
- **Auth:** Auth.js with Prisma adapter and database-backed sessions.
- **Localization:** next-intl with EN/DE/FR message catalogs.

These choices align with existing repo research and should not be replaced in planning unless user explicitly changes a locked decision.

## Auth Architecture (Email/Password + Verify + Reset + Persistent Session)

## Flow

1. User signs up with email/password.
2. System creates user in Auth.js + Prisma tables with `emailVerified = null`.
3. System sends verification email token.
4. User verifies email via token endpoint; system sets `emailVerified` timestamp.
5. User can log in only after verification (or login allowed but app-gated until verified; planner must pick one policy and keep it consistent).
6. Password reset uses one-time token with short TTL and single-use invalidation.
7. Session persistence uses secure database-backed session cookies (Auth.js session strategy with server-side session records).

## Security and implementation directives

- Hash passwords using Auth.js default secure adapters (never custom crypto).
- Reset and verification tokens must be one-time, expiring, and hashed at rest.
- Add rate limiting for signup, login, verify resend, and reset endpoints.
- Add structured audit events for auth milestones (signup, verify, login, reset request, reset complete).
- Enforce AUTH-04 by linking app profile records by authenticated `userId` only.

## Multilingual Strategy (EN/DE/FR with Immediate Switching + Persistence)

## Locale model

- Keep canonical locale values in profile/account (`en`, `de`, `fr` for Phase 1).
- Store locale as account preference; apply at session bootstrap.
- Header language switch updates locale immediately in UI and persists via authenticated API call.

## Rendering strategy

- Use next-intl for route/layout-level locale context and typed message keys.
- Keep canonical profile data language-neutral where possible (enums, IDs, structured values).
- Translate display labels/prompts/summaries at render time, not by rewriting canonical stored values.

## Persistence behavior

- Anonymous/pre-auth selection can live in cookie/localStorage for first load.
- On authenticated session, server truth is account locale; client selection syncs to server.
- Language switching must not mutate or clear saved profile data (LOCL-03).

## Candidate Profile Data Model (Phase 1 AUTH/LOCL/PROF only)

Use a normalized base profile with light JSON for flexible fields.

## Core entities

- **User** (Auth.js/Prisma): identity and session ownership.
- **CandidateProfile** (1:1 with User): canonical profile root.
- **ProfileQualifications** (1:N): editable list entries for PROF-08.
- **ProfileHistoryEvent** (1:N): append-only change history (see history section).

## CandidateProfile fields (Phase 1)

- `id`, `userId` (unique), `locale`, timestamps.
- `fullName` (PROF-01).
- `currentJobSituation` (PROF-02).
- `employmentObjective` (PROF-03).
- `primaryRole` + `roleSuggestionsUsed` marker (PROF-04 + D-16).
- `preferredLocation` (PROF-05).
- `contractPreference` (PROF-06).
- `workRate` (PROF-07).
- `workPermitStatus` (PROF-09; required per D-12).
- `salaryExpectation` nullable (PROF-10; optional per D-11).
- `completionState` object:
  - `isMinimallyComplete`
  - `missingCriticalFields[]`
  - `lastCompletionCheckAt`

## Structured summary support (PROF-11)

- Keep a deterministic summary projection generated from canonical fields (server-side formatter).
- Do not make chat transcript the source of truth.

## Edit support (PROF-12)

- All profile fields mutable via chat-issued, schema-validated patch commands.
- Server enforces field-level validation and confirmation policy.

## Chat-Only Profile Editing: Implications and Safeguards

## Implications

- Chat is the only editing interface in Phase 1, so command interpretation quality is a product-critical path.
- Ambiguous user messages can cause wrong field mapping without strict extraction and confirmation.

## Safeguards

- Use structured edit intents (field, operation, value) validated by Zod before persistence.
- Require explicit user confirmation for high-impact edits:
  - work permit
  - primary role
  - location
  - salary expectation
- Show a diff preview before applying any AI-suggested multi-field update.
- Reject partial invalid updates atomically (no mixed-success writes in one command).
- Always provide undo via history-based revert of last event.
- Restrict assistant scope to job-profile editing and related onboarding only.

## Soft-Warning Validation + Minimal Completion Gate

## Validation policy

- Required fields trigger warnings, not hard blocks (D-15).
- Warnings are explicit and persistent until addressed.
- User can continue and save partial profile.

## Minimal completion gate (D-14)

`fullName`, `preferredLocation`, `primaryRole`, `locale`, `workPermitStatus`.

- When these are present, set `isMinimallyComplete = true`.
- If missing, keep profile editable and usable, but surface completion nudges.

## Field treatment

- `salaryExpectation`: optional warning only when absent.
- `qualifications`: zero-to-many list; no minimum count required.
- `primaryRole`: suggestions first, free-text fallback accepted.

## Full Profile Change History Approach (Phase 1)

Implement append-only event history from day one.

## Event model

`ProfileHistoryEvent`:
- `id`, `userId`, `profileId`, `timestamp`
- `actorType` (`user`, `assistant`, `system`)
- `source` (`chat`, `auth-flow`, `system-migration`)
- `changeSet` (JSON diff: field, oldValue, newValue)
- `confirmationRef` (optional link to user confirmation message)

## Operational behavior

- Every accepted profile mutation writes one history event in same transaction as profile update.
- Expose chronological history for transparency and support debugging.
- Support revert by replaying inverse diff for last reversible event.
- Keep immutable append-only semantics; no in-place history edits.

## Risks and Mitigations (Phase 1)

1. **Auth abuse (credential stuffing/reset abuse).**  
Mitigation: endpoint rate limits, token TTL, one-time tokens, login anomaly logging.

2. **Locale drift and inconsistent semantics across EN/DE/FR.**  
Mitigation: canonical structured profile values + translated rendering only.

3. **Chat misinterprets edits and corrupts profile.**  
Mitigation: structured intent schema, explicit confirmation, diff preview, atomic writes.

4. **Soft warnings ignored, leading to low-quality profiles.**  
Mitigation: persistent completion nudges and clear minimal completion status.

5. **History gaps reduce trust and supportability.**  
Mitigation: mandatory transactional event write for every profile mutation.

## Open Implementation Questions

1. Should login be hard-blocked until email is verified, or allow login with in-app "verify required" gating?
2. Should locale storage live in `User` auth-profile extension or in `CandidateProfile` as canonical source (one source of truth required)?
3. For undo, do we support only "revert last change" in Phase 1 or arbitrary historical rollback?
4. What is the maximum acceptable delay between language switch click and full UI locale update?

## Research Conclusions for Planner

1. Implement Phase 1 as a **profile-foundation phase**, not a generic chat phase: canonical profile tables first, chat as input channel second.
2. Use **Auth.js + Prisma + Postgres** with database sessions; include signup, verification, login, reset, and persistent sessions in one coherent auth slice.
3. Add **email verification and password reset token infrastructure** in Wave 1 (do not defer security-critical flows).
4. Implement **always-visible header locale switcher** with immediate client update and server-persisted locale.
5. Keep profile schema **language-neutral**; localize only presentation and prompts.
6. Model profile fields to satisfy only Phase 1 AUTH/LOCL/PROF scope; do not add CV/memory-phase fields yet.
7. Enforce **chat-edit safeguards**: structured intent parsing, Zod validation, explicit confirmation for high-impact edits, atomic persistence.
8. Ship **soft-warning validation** and the minimal completion gate exactly as decided (name, location, primary role, language, permit).
9. Implement **append-only full profile history** in same transaction as profile updates; planner must include audit-read and revert-last-change support.
10. Ensure PROF-11 summary is generated from canonical data (never from raw transcript reconstruction).
11. Include tests for: auth flows, locale persistence/switching, profile mutation correctness, warning/gate logic, and history event creation.
12. Keep assistant scope constrained to job-profile tasks in Phase 1 to prevent early domain drift.
