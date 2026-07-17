---
status: fixing
trigger: "Systematic regression debugging — cover-letter feature in the AI assistant lost most capabilities (profile use, word count, memory retrieval, resize/tone/proofread/add-remove/strengthen commands)"
created: 2026-07-17
updated: 2026-07-17
---

## Current Focus

hypothesis: The SERVICES phase (where post-onboarding users live) is wired to a
  degraded subset of the cover-letter subsystem. The fully-capable code paths were
  built but are either dead code or only wired into the profile-collection phase.
test: Trace real services-phase messages through route branches; compare wired vs.
  available code paths; confirm with git history which capable paths were never wired.
expecting: Restoring the capable wiring (profile qualifications + word-count into
  generation; full edit workflow into services; recency retrieval fallback) restores
  all four symptom areas without touching Phase 10 target-role work.
next_action: Apply 4 scoped fixes, then `npm run build` + assistant test suites.

reasoning_checkpoint:
  hypothesis: "Cover-letter capabilities are degraded in the SERVICES phase because the capable implementations (handleCoverLetterRefinement, handleArtifactEditWorkflow, profile.qualifications in the prompt, word-count parsing) are dead code or only wired into profile-collection — not because a commit deleted working services-phase code."
  confirming_evidence:
    - "grep: handleCoverLetterRefinement is defined (cover-letter-handler.ts:147) but never called anywhere in the route."
    - "grep: handleArtifactEditWorkflow is called exactly once — route.ts:374 (profile-collection). The services-phase edit branch (route.ts ~558-645) uses an inline applyEdit on the most-recent stored artifact and ignores pasted inline content."
    - "buildCoverLetterPrompt (cover-letter.ts) reads skills/experience only from cvData.qualifications; the handler passes cvData=undefined and never forwards profile.qualifications, so skills/experience are omitted."
    - "handleCoverLetterRequest never parses or forwards a requested word count (targetWordCount) for initial generation; the prompt hardcodes '250-400 words'."
    - "retrieve.ts matches only by explicit company/question; there is no recency fallback, so 'show me my last cover letter' (no company) returns 'I don't have a saved cover letter'."
    - "git: `git log -S coverLetterCache -- src/**/*.ts` returns nothing — the coverLetterCache design in the two cover-letter test files was NEVER implemented in source (added as RED/aspirational specs in a396031)."
  falsification_test: "If the services-phase branches already forwarded profile.qualifications, a word count, inline pasted content, and a recency fallback, the symptoms would not reproduce when tracing messages — but they do."
  fix_rationale: "Wire the already-built capable paths into the services phase and forward the missing inputs. This addresses the root cause (missing wiring) rather than symptoms, and reuses battle-tested functions already used in profile-collection."
  blind_spots: "The two cover-letter test files encode a different storage design (profile.editorDraft.coverLetterCache) that was never in source; making them green requires a separate design decision, not a wiring fix. They also 502 due to a known dbMock gap (no onboardingSession/storedArtifact models)."

## Symptoms

expected: Cover-letter assistant tailors to the candidate's Profile (name, experience,
  skills, target role), extends/condenses to a requested word count, retrieves the last
  cover letter from memory, and supports commands: resize (longer/shorter), switch tone,
  proofread another/pasted letter, add/remove content about a subject, strengthen.
actual: Profile skills/experience not used; word count ignored; last cover letter not
  retrieved; resize/tone/proofread/add-remove/strengthen no longer work in the assistant.
errors: none thrown at runtime (behavioral degradation); the two cover-letter integration
  tests 502 because their dbMock lacks onboardingSession/storedArtifact models.
reproduction: In the services phase, send "make my cover letter for a Product Manager role
  at X, ~400 words", then "make it more formal", "proofread this: Dear ...", "show me my
  last cover letter".
started: Symptoms trace to the services-phase wiring, not a single deleting commit.

## Eliminated

- hypothesis: "Phase 10 (a51486e/a6bf6c7) reordered the services-phase branches so
    cover-letter requests no longer reach cover-letter.ts."
  evidence: "Phase 10 diff only replaced regex target-role detection with an LLM detector
    and removed duplicate detect+persist blocks. Branch order (offtopic→retrieval→edit→
    cover-letter→cv→interview) is unchanged and functional. Cover-letter requests DO reach
    handleCoverLetterRequest."
  timestamp: 2026-07-17

- hypothesis: "An artifact DAL change broke storage/retrieval of cover letters."
  evidence: "dal.ts store/findByUserAndType are intact and unchanged since 57863bc.
    Retrieval fails only for the no-company 'last cover letter' case (missing recency
    fallback), not due to a DAL regression."
  timestamp: 2026-07-17

## Evidence

- timestamp: 2026-07-17
  checked: route.ts services-phase branch order and handlers
  found: cover-letter branch calls handleCoverLetterRequest with cvData=undefined; edit
    branch uses inline applyEdit on most-recent stored artifact (ignores pasted content).
  implication: Skills/experience + word count + inline-paste edit are unreachable here.

- timestamp: 2026-07-17
  checked: grep for handleCoverLetterRefinement / handleArtifactEditWorkflow / profile.qualifications
  found: handleCoverLetterRefinement never called; handleArtifactEditWorkflow only at route.ts:374
    (profile-collection); buildCoverLetterPrompt never reads profile.qualifications.
  implication: Capable paths exist but are not wired into services phase.

- timestamp: 2026-07-17
  checked: git log -S coverLetterCache
  found: coverLetterCache only ever appeared in the two cover-letter test files (a396031),
    never in src. The tests are aspirational specs for an unbuilt editorDraft cache design.
  implication: Those 7 tests cannot be made green by wiring alone; they encode a different design.

## Resolution

root_cause: The services phase runs a degraded subset of the cover-letter subsystem.
  (1) generation omits profile.qualifications and any requested word count;
  (2) the services-phase edit branch uses a simpler inline applyEdit that ignores pasted
      content and lacks proofread/strengthen/add-remove/tone/translate feedback wiring,
      while the full handleArtifactEditWorkflow is only wired into profile-collection;
  (3) memory retrieval has no recency fallback for "my last cover letter".
fix: >
  (1) cover-letter-handler.ts: parse an explicit requested word count (parseRequestedWordCount)
      and forward it as targetWordCount into generateCoverLetter.
  (2) cover-letter.ts: buildCoverLetterPrompt now includes the candidate's profile
      qualifications (skills & experience) and honours targetWordCount for initial
      generation, not just refinement.
  (3) route.ts services-phase edit branch now calls the shared handleArtifactEditWorkflow
      (same as profile-collection) — restores resize with word targets, switch tone,
      proofread a pasted/another letter, add/remove content about a subject, strengthen,
      simplify, translate, incl. editing inline-pasted letters. Removed the now-unused
      applyEdit/storeEditedVersion imports.
  (4) retrieve.ts: added findMostRecentByType + generic "my/last cover letter" retrieval
      detection; route retrieval branches (both phases) fall back to the most recent
      cover letter when no company is named or no company match is found.
verification: >
  npm run build → Compiled successfully, 0 errors (pre-existing warnings only).
  npx vitest onboarding-target-role-detection + assistant-services → 30/30 passed
  (Phase 10 target-role work intact; no adjacent regressions).
files_changed:
  - src/lib/ai/assistant/services/cover-letter-handler.ts
  - src/lib/ai/assistant/services/cover-letter.ts
  - src/app/api/onboarding/assistant/route.ts
  - src/lib/artifacts/retrieve.ts

## Follow-up (decision needed — not a wiring fix)

The two spec files `tests/integration/onboarding-assistant-cover-letter.test.ts` and
`onboarding-assistant-cover-letter-self-debug.test.ts` have been RED since they were
authored (a396031). They assert a DIFFERENT storage design — a `profile.editorDraft.coverLetterCache`
state machine (lastDraft/targetWords/role/generatedAt/generatorVersion, return-cached-draft
on plain "cover letter", regenerate on "switch role", numeric-only "350" refinement). That
design was NEVER implemented in source (`git log -S coverLetterCache -- src` is empty); the
route instead persists via the `storedArtifact` DAL. They also currently 502 due to a known
dbMock gap (no `onboardingSession`/`storedArtifact` models — see 10-*/deferred-items.md).
Making them green requires building a new cache state machine that conflicts with the
artifactDAL approach used everywhere else, OR realigning the tests to assert the
artifactDAL-based behavior. This is a design fork, so it is surfaced for confirmation
rather than guessed.

