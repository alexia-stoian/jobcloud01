# Phase 10 — Dynamic Target-Role Binding

## Intent (from user)

The candidate's **target role** should be tied to the **Profile > Preferences > "Target Roles"** field.

Whenever the candidate answers **any** onboarding/assistant question that expresses what
role they want to optimize for / are looking for / want to become (many phrasings), the
assistant must **understand the intent** and write that role into the **Target Roles** box.

This must work **throughout the entire conversation** with the assistant — not just
onboarding. Every time the user expresses wanting a new/different role, the assistant must:
1. Understand the need,
2. Update the **Target Roles** field, and
3. Re-optimize how it talks to the user — interview questions about the role, cover letter
   about the role, etc. — so the whole conversation is optimized to the new target role.

The current target role should live **in memory alongside** the last cover letter and the
interview answers, so downstream generation always reflects it.

## Locked decisions (discuss)

1. **Detection method → LLM intent detection.** Replace the brittle regex
   (`detectTargetRoleFromMessage`) with an LLM classifier that understands paraphrases
   ("I'd love to move into…", "aiming for…", "switch to…", "optimize for…"). It returns a
   normalized role string or null.
2. **Update behavior → Update silently, then tell the user.** On a detected role, update
   immediately (no pre-confirmation prompt) and acknowledge in the reply
   ("Got it — I'll optimize everything for {role} now.").
3. **Field cardinality → Replace (single active role).** One active target role at a time;
   a newly expressed role overwrites the previous one. Everything optimizes to the current
   active role. (The `Target Roles` field holds the active role.)
4. **Interview-answer safety → Require explicit first-person intent everywhere.** Detection
   runs across the whole conversation INCLUDING interview/practice turns, but only switches
   on clear first-person intent to pursue a role ("I want/aim/plan to…", "I'm targeting…"),
   never on a role merely mentioned while answering an interview question.
5. **Re-optimization → Future only.** The new role applies to all NEW generations (next
   interview questions, next cover letter, guidance). Already-generated artifacts (e.g. the
   last cover letter) are left as-is until regenerated. No proactive regeneration.

## Scope

**In scope**
- Replace regex detection with an LLM-based target-role intent detector that:
  - understands many phrasings, returns a normalized role or null,
  - only fires on explicit first-person intent (safe inside interview mode).
- On detection: overwrite `onboardingSession.targetRole` AND `profile.targetRoles`
  (single active role), then acknowledge the change in the assistant reply.
- Ensure the updated role flows into downstream generation so it is "in memory":
  interview question generation, cover-letter generation, guidance — all read the current
  active target role.
- Run across the whole assistant conversation (all phases), not just onboarding.
- No regressions; `npm run build` 0 errors; EN/DE/FR user-facing text preserved.

**Out of scope**
- Regenerating already-produced artifacts when the role changes (future-only).
- Maintaining a multi-role list / history UI (single active role only).
- A confirmation prompt before switching.
- Changing the Profile page UI for Target Roles (it already exists; we only keep it in sync).
- Broader onboarding redesign.

## Existing building blocks (reuse / replace)

- **Detector to replace:** `src/lib/onboarding/detect-target-role.ts`
  (`detectTargetRoleFromMessage` — brittle, over-matches; also
  `extractTargetRoleFromHistory`).
- **Global update site:** `src/app/api/onboarding/assistant/route.ts` — the "GLOBAL"
  step (~L222-L250) already detects per message and writes both
  `onboardingSession.targetRole` and `profile.targetRoles`, then reloads the profile.
  This is where LLM detection + explicit-intent gating + acknowledgement plug in.
- **Field of record:** `CandidateProfile.targetRoles` (Profile > Preferences) and
  `OnboardingSession.targetRole`.
- **Memory read path:** `src/lib/profile/memory.ts` (`profile.targetRole` / stated goal)
  and `buildOnboardingSystemPrompt` in the assistant route (injects target role into the
  system prompt).
- **Downstream consumers to verify read the active role:**
  - Interview: `src/lib/interview/prompts.ts`, `src/lib/interview/engine.ts` (targetRole arg).
  - Cover letter: `src/lib/ai/assistant/services/cover-letter.ts` (`userProfile.targetRoles`).
  - Guidance / skill gaps: `src/lib/interview/parse-gaps.ts` (targetRoles || primaryRole).
- **Artifacts (memory neighbors):** `StoredArtifact` model / `src/lib/artifacts/*` holds
  last cover letter and interview data; the active role must be consistent with these.

## Open questions for research/planning

- Where exactly to place the LLM detection call so it doesn't add latency to every turn
  (e.g. cheap model, short prompt, or gate on a lightweight keyword pre-filter first).
- Confirm every generation path reads the freshly-updated `targetRoles` (avoid stale
  in-memory profile after update; the route already reloads the profile).

## Deferred ideas
- Offer-to-regenerate the existing cover letter / interview set on role change.
- Target-role history / multiple simultaneous targets.
