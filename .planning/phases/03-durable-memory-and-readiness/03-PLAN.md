# Phase 3 Plan: Durable Memory And Readiness

## Phase Goal (MVP)
As a logged-in user, I want my confirmed onboarding and profile facts to persist across sessions and drive a readiness summary, so I am not repeatedly asked the same things and can clearly see what is missing.

## Scope Guardrails
- In scope only: MEMG-01, MEMG-02, MEMG-03, MEMG-04, MEMG-10.
- Every memory/write path must be correlated to the authenticated `userId` and existing `CandidateProfile`.
- Reuse only confirmed profile/onboarding facts; never promote uncertain CV facts into durable memory.
- Keep assistant behavior restricted to profile and job-search context.

## 19-Step Execution Plan (with intermediate profile-correlation checks)

1. Create Phase 3 scaffolding files and route placeholders.
2. Define a shared readiness model bound to `CandidateProfile` critical fields and qualification coverage.
3. Add profile-linked memory snapshot utility that merges `CandidateProfile`, `ProfileQualification`, and confirmed onboarding signals.
4. Add intermediate check: assert all memory snapshot queries are filtered by authenticated `userId`.
5. Add API `GET /api/profile/readiness` returning readiness score, missing fields, and evidence.
6. Add API `GET /api/profile/memory` returning durable profile memory payload for assistant context.
7. Add API `GET /api/onboarding/dataset` exporting profile-correlated training rows (prompt/response/context metadata).
8. Add intermediate check: ensure dataset rows include `profileId`, `userId`, locale, and confirmation provenance.
9. Add API `POST /api/onboarding/eval` that scores candidate assistant replies against profile/memory constraints.
10. Add eval rubric utilities: relevance, grounding-to-profile, safety/domain-scope, and actionability.
11. Add intermediate check: reject eval requests lacking user auth or profile context.
12. Add readiness trend utility from profile history events.
13. Extend profile summary response to include readiness block and memory freshness timestamp.
14. Add assistant context builder that injects profile memory + readiness hints into onboarding assistant requests.
15. Add intermediate check: block assistant context builder from using uncertain onboarding facts.
16. Add integration tests for readiness API and profile-correlation invariants.
17. Add integration tests for dataset export and eval scoring contract.
18. Add docs/runbook for Phase 3 data flow and profile-correlation guarantees.
19. Run validation (`vitest`, `build`) and close Phase 3 slice with verification notes.

## Verification Criteria
- Returning users see persisted, profile-correlated memory.
- Readiness summary is deterministic and based on durable profile evidence.
- Training/eval artifacts are generated from confirmed, user-scoped facts only.
- Assistant context can reuse prior profile facts without re-asking answered items.
