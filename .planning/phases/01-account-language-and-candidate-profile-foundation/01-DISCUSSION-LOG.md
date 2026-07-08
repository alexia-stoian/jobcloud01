# Phase 1: Account, Language, And Candidate Profile Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-07-08
**Phase:** 1-Account, Language, And Candidate Profile Foundation
**Areas discussed:** Account flow, Language UX, Profile fields, Profile editing

---

## Account flow

| Option | Description | Selected |
|--------|-------------|----------|
| Email/password auth | Standard credential flow | ✓ |
| Magic link only | Passwordless email-first flow | |
| Social-only auth | OAuth-first login | |

**User's choice:** Email/password auth with direct signup, required email verification, persistent sessions, and password reset.
**Notes:** Auth experience must be localized for EN/DE/FR.

---

## Language UX

| Option | Description | Selected |
|--------|-------------|----------|
| Header switcher always visible | Fast access and high discoverability | ✓ |
| Settings-only language control | Lower visual prominence | |
| One-time setup language | Set once during onboarding only | |

**User's choice:** Always-visible header switcher, saved preference, immediate switching.
**Notes:** Profile-facing text should also reflect selected language.

---

## Profile fields (round 1)

| Option | Description | Selected |
|--------|-------------|----------|
| Salary optional in Phase 1 | Capture when available, do not block | ✓ |
| Salary required in Phase 1 | Mandatory before progression | |

**User's choice:** Salary optional.
**Notes:** Work permit was explicitly set as always required.

---

## Profile fields (round 2)

| Option | Description | Selected |
|--------|-------------|----------|
| Qualifications editable list | Add/remove structured entries | ✓ |
| Single free-text box | Low structure | |
| Strict taxonomy only | Controlled vocabulary only | |

**User's choice:** Editable list with add/remove.
**Notes:** User requested more questions after this round.

---

## Profile fields (round 3)

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal completion gate | Name, location, primary role, language, permit | ✓ |
| Strict completion gate | Include all mandatory fields | |
| No completion gate | Always proceed regardless | |

**User's choice:** Minimal completion gate.
**Notes:** Validation preference was soft warnings (not strict blocking).

---

## Profile fields (round 4)

| Option | Description | Selected |
|--------|-------------|----------|
| Role suggestions + free text fallback | Balanced structure and flexibility | ✓ |
| Free text only | Maximum flexibility, low normalization | |
| Suggestions only | High structure, low flexibility | |

**User's choice:** Suggestions + free text fallback.
**Notes:** User clarified that profile fields can be changed at any time.

---

## Profile editing

| Option | Description | Selected |
|--------|-------------|----------|
| Both form and chat | Structured form with assistant support | |
| Form only | Deterministic and simple MVP path | |
| Chat only | Conversational profile build/edit | ✓ |

**User's choice:** Chat-only entry/editing in Phase 1.
**Notes:** Editing anytime from profile settings; AI suggestions must be user-confirmed before apply; full profile history requested.

---

## the agent's Discretion

- No discretion areas were delegated.

## Deferred Ideas

- None.
