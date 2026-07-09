# Phase 3 Runbook: Memory And Readiness

## Objective
Establish durable, profile-correlated memory and readiness so the assistant can reuse confirmed user facts across sessions without re-asking answered questions.

## Profile-Correlation Rules
- Every read/write must be scoped by authenticated `userId`.
- All training/eval exports must carry `profileId`, `userId`, and locale.
- Uncertain onboarding/CV facts are excluded from durable memory and assistant grounding.
- Only confirmed profile evidence should affect readiness and training datasets.

## Implemented Endpoints
- `GET /api/profile/readiness`
- `GET /api/profile/memory`
- `GET /api/onboarding/dataset`
- `POST /api/onboarding/eval`

## 19-Step Mapping Status
1. Scaffolding: done.
2. Readiness model: done.
3. Durable profile memory builder: done.
4. userId-correlation checks: done.
5. Readiness API: done.
6. Memory API: done.
7. Dataset export API: done.
8. Dataset profile provenance: done.
9. Eval API: done.
10. Eval rubric utility: done (relevance/grounding/safety/actionability).
11. Eval auth/profile guard: done.
12. Readiness trend utility: done.
13. Summary readiness integration: done.
14. Assistant memory context injection: done.
15. Uncertain-fact exclusion guard in prompting: done.
16. Readiness integration tests: done.
17. Memory integration tests: done.
18. Runbook docs: done.
19. Validation (`vitest`, `build`): done.
