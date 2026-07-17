# Phase 10: Dynamic Target-Role Binding - Research

**Researched:** 2026-07-17
**Domain:** LLM intent detection + state propagation inside a Next.js 15 App Router API route
**Confidence:** HIGH (all findings verified against the workspace source; no external package additions required)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
1. **Detection method → LLM intent detection.** Replace the brittle regex
   (`detectTargetRoleFromMessage`) with an LLM classifier that understands paraphrases
   ("I'd love to move into…", "aiming for…", "switch to…", "optimize for…"). It returns a
   normalized role string or null.
2. **Update behavior → Update silently, then tell the user.** On a detected role, update
   immediately (no pre-confirmation prompt) and acknowledge in the reply
   ("Got it — I'll optimize everything for {role} now.").
3. **Field cardinality → Replace (single active role).** One active target role at a time;
   a newly expressed role overwrites the previous one. The `Target Roles` field holds the
   active role, stored in `CandidateProfile.targetRoles` AND `OnboardingSession.targetRole`.
4. **Interview-answer safety → Require explicit first-person intent everywhere.** Detection
   runs across the whole conversation INCLUDING interview/practice turns, but only switches
   on clear first-person intent to pursue a role ("I want/aim/plan to…", "I'm targeting…"),
   never on a role merely mentioned while answering an interview question.
5. **Re-optimization → Future only.** The new role applies to all NEW generations (next
   interview questions, next cover letter, guidance). Already-generated artifacts are left
   as-is until regenerated. No proactive regeneration.

### Claude's Discretion
- Exact placement of the LLM detection call to avoid per-turn latency (cheap model, short
  prompt, and/or a lightweight keyword pre-filter gate before the LLM call).
- Confirm every generation path reads the freshly-updated `targetRoles` (avoid stale
  in-memory profile after update).

### Deferred Ideas (OUT OF SCOPE)
- Offer-to-regenerate the existing cover letter / interview set on role change.
- Target-role history / multiple simultaneous targets.
- A confirmation prompt before switching.
- Changing the Profile page UI for Target Roles (keep in sync only).
- Broader onboarding redesign.
</user_constraints>

<phase_requirements>
## Phase Requirements

Phase 10 in `.planning/ROADMAP.md` (line 213) is not yet broken into requirement IDs
("Requirements: TBD"). The locked decisions above are the authoritative acceptance
criteria until the planner assigns IDs. Suggested requirement mapping for the planner:

| Suggested ID | Description | Research Support |
|--------------|-------------|------------------|
| TRB-01 | LLM detects explicit first-person target-role intent anywhere in the conversation | New detector module + call-site in route STEP 2 GLOBAL block |
| TRB-02 | Detected role overwrites `CandidateProfile.targetRoles` + `OnboardingSession.targetRole` and reloads profile | Existing GLOBAL block already does this — swap detector, keep persistence |
| TRB-03 | Interview/practice turns only switch on explicit intent, never on mentioned roles | Gate detector with `state.services?.interviewPrep?.currentMode` context |
| TRB-04 | Assistant acknowledges the switch in its reply ("optimizing for {role}") in EN/DE/FR | Append to `answer` before `NextResponse.json({ answer })` |
| TRB-05 | Downstream generation (interview, cover letter, guidance, memory) reads the fresh role | Verify read paths in §Downstream Consumers |
| TRB-06 | No regressions; `npm run build` 0 errors; EN/DE/FR preserved | Existing test suite + new integration test |
</phase_requirements>

## Summary

The entire mechanism this phase changes already exists and works end-to-end — only the
**detection function** is brittle. The onboarding assistant route
([src/app/api/onboarding/assistant/route.ts](src/app/api/onboarding/assistant/route.ts))
has a "GLOBAL" step (STEP 2, ~L222-L250) that runs on **every** message across **every**
phase: it calls `detectTargetRoleFromMessage(userMessage)`, and on a hit it writes
`OnboardingSession.targetRole`, writes `CandidateProfile.targetRoles`, and **reloads the
profile** from the DB so the in-memory object is fresh. Two more redundant copies of this
detect+persist logic exist in the `profile-collection` branch (~L289) and the `services`
branch (~L504). All three call the same regex detector.

The regex detector ([src/lib/onboarding/detect-target-role.ts](src/lib/onboarding/detect-target-role.ts))
over-matches (e.g. it will fire `become a ...` inside an interview answer) and misses
paraphrases. The locked decision is to replace it with an **LLM classifier** that (a)
returns a normalized role or `null`, and (b) only fires on explicit first-person intent —
even inside interview/practice turns.

The codebase already has a battle-tested Anthropic house style to copy verbatim: a raw
`fetch("https://api.anthropic.com/v1/messages")` call with `x-api-key` + `anthropic-version:
2023-06-01` headers, `AbortController` timeout, model resolved from
`process.env.ANTHROPIC_MODEL ?? env.ANTHROPIC_MODEL` (sanitized), and a "return priors on
ANY failure, never throw" contract. The best reference is the signals engine
([src/lib/ai/signals/engine.ts](src/lib/ai/signals/engine.ts)) and CV extraction
([src/lib/cv/extract-phase1.ts](src/lib/cv/extract-phase1.ts)).

**Primary recommendation:** Create a new module `src/lib/onboarding/detect-target-role-llm.ts`
exporting `async function detectTargetRoleIntent({ message, inPractice, apiKey, model }):
Promise<string | null>`. Gate the LLM call behind a cheap first-person keyword pre-filter
(reuse a trimmed set of the existing intent verbs) so most turns skip the network call
entirely. Call it **once** in the GLOBAL block (STEP 2), remove the two duplicate detect
blocks, capture whether a switch happened, and append a localized acknowledgement to
`answer` just before `return NextResponse.json({ answer })`. Everything downstream already
reads `targetRoles`/`targetRole` — the reload already in place keeps them fresh within the
request.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Intent detection (LLM classify) | API / Backend (route + lib) | — | Requires the Anthropic key; must run server-side inside the POST handler |
| Persist active role | Database (Prisma) | API | `CandidateProfile.targetRoles` + `OnboardingSession.targetRole` are the field of record |
| Keep in-memory profile fresh | API / Backend | — | Route already reloads profile after update within the same request |
| Re-optimized generation | API / Backend (lib generators) | LLM | Cover-letter / interview / guidance prompts read the active role at generation time |
| Acknowledgement text | API / Backend | i18n | Composed in-route; EN/DE/FR string table |
| Target Roles field UI | Frontend | — | Out of scope — already exists; only kept in sync |

## Standard Stack

**No new packages required.** Everything is already installed and in use.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Anthropic Messages API (raw `fetch`) | `anthropic-version: 2023-06-01` | LLM intent classification | House pattern in signals/CV/edit modules — no SDK dependency, works in the route runtime `[VERIFIED: src/lib/ai/signals/engine.ts, src/lib/cv/extract-phase1.ts]` |
| `@anthropic-ai/sdk` | installed | Used only by `src/lib/interview/engine.ts` | Route + libs prefer raw fetch; do NOT introduce the SDK into the detector to match the GLOBAL-block house style `[VERIFIED: src/lib/interview/engine.ts L1-L11]` |
| Zod env (`@/lib/env`) | installed | Resolve `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | `ANTHROPIC_MODEL` defaults to `claude-sonnet-5`; key is optional `[VERIFIED: src/lib/env.ts L20-L21]` |

### Model env vars (verified)
- `ANTHROPIC_API_KEY` — `z.string().min(1).optional()` `[VERIFIED: src/lib/env.ts L20]`
- `ANTHROPIC_MODEL` — `z.string().min(1).default("claude-sonnet-5")` `[VERIFIED: src/lib/env.ts L21]`
- Resolution idiom used everywhere:
  ```ts
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim() || env.ANTHROPIC_API_KEY?.trim();
  const anthropicModel = (process.env.ANTHROPIC_MODEL ?? env.ANTHROPIC_MODEL)
    .replace(/["'`\r\n]/g, "")
    .trim();
  ```
  `[VERIFIED: src/app/api/onboarding/assistant/route.ts L98-L101, src/lib/cv/extract-phase1.ts L89-L92]`

### Cheap-model note
There is **no separate "haiku" env var** in the codebase — all callers use the single
`ANTHROPIC_MODEL`. Recommendation: keep using `anthropicModel` (already resolved in the
route) for consistency, and keep latency low via (a) the keyword pre-filter gate and (b) a
tiny `max_tokens` (≤ 20) + terse prompt. Introducing a second "cheap model" env var is a
Claude's-discretion option but would add config surface; NOT recommended unless the planner
wants it. `[ASSUMED]` that `claude-sonnet-5` latency at ~20 output tokens is acceptable for
the gated call path.

## Package Legitimacy Audit

No external packages are installed in this phase — all dependencies (`@anthropic-ai/sdk`,
`zod`, Prisma) are already present in the repo. **Package Legitimacy Gate: N/A (no new installs).**

## Architecture Patterns

### Current data flow (verified)

```
POST /api/onboarding/assistant
  │
  ├─ auth() → userId                                  [route L82-L85]
  ├─ resolve anthropicApiKey / anthropicModel         [route L98-L101]
  ├─ STEP 1: load/create CandidateProfile + OnboardingSession + AssistantState
  │
  ├─ STEP 2 (GLOBAL): detectTargetRoleFromMessage(userMessage)   ◄── REPLACE THIS
  │     └─ on hit:  db.onboardingSession.update({ targetRole })
  │                 db.candidateProfile.update({ targetRoles })
  │                 profile = db.candidateProfile.findUnique(...)   ◄── reload (fresh)
  │
  ├─ phase routing:
  │     greeting → routeGreeting
  │     profile-collection → (DUPLICATE detect L289) → cover-letter / interview / claude
  │     services         → (DUPLICATE detect L504) → retrieval / edit / cover-letter / interview / claude
  │
  ├─ generation reads role via:
  │     buildDurableProfileMemory({ profile, onboardingSession })   → targetRoles ?? onboardingSession.targetRole
  │     buildMemoryPromptFragment(memory, onboardingSession)         → onboardingSession.targetRole ?? primaryRole
  │     interview inline prompts: onboardingSession?.targetRole ?? profile?.primaryRole
  │     cover-letter.ts: userProfile.targetRoles
  │
  ├─ STEP 4: persist assistantState
  ├─ runInferenceSafely(...)  (awaited)
  └─ return NextResponse.json({ answer })              ◄── APPEND acknowledgement here
```

### Pattern 1: House Anthropic call (copy this shape for the detector)
**What:** Raw fetch, abort timeout, sanitized model, swallow errors → return null.
**When to use:** The new detector, to match GLOBAL-block style (NOT the SDK).
**Example:**
```ts
// Source: src/lib/cv/extract-phase1.ts L87-L127 (verified)
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 50000);
try {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: anthropicModel,
      max_tokens: 3500,             // detector: use ≤ 20
      messages: [{ role: "user", content: prompt }]
    }),
    signal: controller.signal,
    cache: "no-store"
  });
  const data = (await response.json()) as AnthropicResponse;
  if (!response.ok) return null;
  const text = data.content?.find((p) => p.type === "text")?.text?.trim();
  return text ?? null;
} catch {
  return null;                      // never throw — same contract as signals engine
} finally {
  clearTimeout(timeout);
}
```
For the detector, prefer a **short timeout** (e.g. 8-10 s) since it's on the hot path, and a
`system` prompt like the signals engine uses (`system` + `messages` fields — see
[src/lib/ai/signals/engine.ts](src/lib/ai/signals/engine.ts) L86-L96).

### Pattern 2: JSON parse with fence tolerance (for structured detector output)
**What:** Strip an accidental ```` ```json ```` fence, `JSON.parse`, return null on failure.
**Example:**
```ts
// Source: src/lib/ai/signals/engine.ts L160-L169 (verified)
const cleaned = text
  .replace(/^```(?:json)?\s*/i, "")
  .replace(/\s*```$/i, "")
  .trim();
let obj: unknown;
try { obj = JSON.parse(cleaned); } catch { return null; }
```
The interview engine ([src/lib/interview/engine.ts](src/lib/interview/engine.ts) L26-L62)
shows an alternative strip-`\`\`\`json`-prefix approach. Either is house style. For a detector
returning a single role, a minimal `{"role": "..."|null}` schema is cleanest.

### Pattern 3: Keyword pre-filter gate (latency control)
**What:** Cheaply reject turns with no first-person role intent before the LLM call.
**When to use:** Before every LLM detection call, so ordinary turns cost 0 network.
**Example seed (derive from existing regex verbs):**
```ts
// First-person intent triggers only (subset of the current regex verbs)
const INTENT_HINT = /\b(i\s+(?:want|aim|plan|hope|wish|would like|'?d like|intend)|i'?m\s+(?:targeting|aiming|looking|pursuing|switching|moving|transitioning)|my\s+goal|aiming\s+for|switch\s+to|move\s+into|optimize\s+for|target(?:ing)?\s+role)\b/i;
if (!INTENT_HINT.test(message)) return null;   // skip LLM entirely
```
This keeps the LLM as the *disambiguator* (paraphrase + false-positive rejection), while the
regex is only a cheap *gate* — inverting today's brittle "regex decides" into "regex gates,
LLM decides."

### Anti-Patterns to Avoid
- **Three detection sites.** Today the same detect+persist logic is duplicated in GLOBAL
  (L224), profile-collection (L289), and services (L504). Do NOT port all three to the LLM
  (3× latency + cost). **Consolidate to the single GLOBAL block** and delete the other two.
- **Detecting on interview *answers*.** The current regex fires on `become a ...` in any
  text, so answering "I helped the team become a data-driven org" flips the role. The LLM
  prompt + `inPractice` context flag must explicitly reject non-first-person mentions.
- **Stale profile object.** After the DB update you MUST keep using the reloaded `profile`
  (the GLOBAL block already reassigns `profile = await db.candidateProfile.findUnique(...)`).
  Do not read a captured pre-update copy in later branches.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Paraphrase understanding | More regex patterns | LLM classifier | The whole point of the phase; regex is what we're removing |
| Anthropic client | New fetch wrapper from scratch | Copy the verified fetch shape from `extract-phase1.ts`/`engine.ts` | House style, correct headers/version, error contract |
| JSON salvage | New parser | `parseUpdates`/fence-strip idiom from signals engine | Already handles fences & failures |
| Role normalization | Bespoke title-case everywhere | Reuse the existing title-case step from the old detector (or ask the LLM to return normalized) | Keeps output shape identical to what downstream already stores |

## Current Detection + Update Path (deep dive)

### Detector to replace
[src/lib/onboarding/detect-target-role.ts](src/lib/onboarding/detect-target-role.ts):
- `detectTargetRoleFromMessage(message: string): string | null` — regex intent patterns,
  title-cases the captured role, filters stopwords (L14-L62).
- `extractTargetRoleFromHistory(history): string | null` — walks history newest-first,
  calls `detectTargetRoleFromMessage` per user turn (L65-L84). **Currently has ZERO
  production callers** (see §Callers) — only referenced in `TARGET_ROLE_FIX_VALIDATION.md`.
- `getTargetRoleQuestion(locale): string` — EN/DE/FR clarifying question after CV upload
  (L87-L100). **Keep this** — it's the CV-upload prompt, unrelated to detection, still
  called at route L325.

### GLOBAL update site (the one to keep + rewire)
[src/app/api/onboarding/assistant/route.ts](src/app/api/onboarding/assistant/route.ts) L222-L250:
```ts
// STEP 2: GLOBAL - Check for target role in EVERY message across ALL phases
const detectedGlobalTargetRole = detectTargetRoleFromMessage(userMessage);   // ◄ swap for LLM
if (detectedGlobalTargetRole && onboardingSession) {
  const updatedSession = await db.onboardingSession.update({
    where: { userId: session.user.id },
    data: { targetRole: detectedGlobalTargetRole }
  });
  onboardingSession = updatedSession;
  if (profile) {
    await db.candidateProfile.update({
      where: { userId: session.user.id },
      data: { targetRoles: detectedGlobalTargetRole }
    });
    profile = await db.candidateProfile.findUnique({           // ◄ reload keeps memory fresh
      where: { userId: session.user.id },
      include: { qualifications: true }
    }) || profile;
  }
}
```
Persistence + reload are correct and satisfy locked decision #3. **Only the detector call
changes**, plus: (a) pass `inPractice` context, (b) capture a `roleJustSwitched`/`newRole`
flag for the acknowledgement.

### Interview/practice context signals available here
- `state.services?.interviewPrep?.currentMode === "practice"` — the definitive
  "we are mid-mock-interview" flag `[VERIFIED: route L539, src/types/assistant-state.ts L72-L73]`.
  `InterviewPrepServiceState.currentMode?: "practice" | "mock"`.
- At the GLOBAL block, `state` is already loaded (STEP 1 completed). Pass
  `state.services?.interviewPrep?.currentMode === "practice"` into the detector so its prompt
  can be told "the user is answering an interview question; only switch on explicit
  first-person career intent." This is the mechanism for locked decision #4.

## Downstream Consumers (verified read paths)

| Consumer | File / line | Reads active role via | Stale risk after update? |
|----------|-------------|-----------------------|--------------------------|
| System-prompt memory fragment | route L38-L64 `buildMemoryPromptFragment` | `onboardingSession?.targetRole ?? memory.profile.primaryRole` | None — `onboardingSession` reassigned in GLOBAL block |
| Durable memory builder | [src/lib/profile/memory.ts](src/lib/profile/memory.ts) L42 | `profile.targetRoles \|\| onboardingSession?.targetRole` | None — both reloaded/reassigned before generation |
| Inline mock-interview prompts | route L757, L466 | `onboardingSession?.targetRole ?? profile?.primaryRole` | None — same-request reload |
| Cover-letter generation | [src/lib/ai/assistant/services/cover-letter.ts](src/lib/ai/assistant/services/cover-letter.ts) L239-L240 | `userProfile.targetRoles` | None — receives reloaded `profile` (`profile!`) at route L676 |
| Skill-gap guidance | [src/lib/interview/parse-gaps.ts](src/lib/interview/parse-gaps.ts) L197 | `profile.targetRoles \|\| profile.primaryRole` | None — reads DB fresh in its own query (L185) |
| Interview engine (separate route) | [src/lib/interview/engine.ts](src/lib/interview/engine.ts) via `buildInterviewPrompt` | `targetRole` arg | ⚠ see note below |

**⚠ Stale/inconsistent read in the separate mock-interview route:**
[src/app/api/mock-interview/start/route.ts](src/app/api/mock-interview/start/route.ts) L48-L53
calls `generateFirstQuestion(interviewType, targetRole || profile.primaryRole || null, ...)`.
It uses the **request-body `targetRole`** or falls back to `profile.primaryRole` — it does
**NOT** read `profile.targetRoles`. So the standalone mock-interview UI can generate
questions for the wrong (old/primary) role even after a switch. This is a real gap for locked
decision #5 ("all NEW generations use the active role"). **Recommendation:** change the
fallback to `targetRole || profile.targetRoles || profile.primaryRole || null`. The planner
should decide whether this standalone route is in scope; the assistant-route interview path
(which the phase text lists) already reads `onboardingSession?.targetRole` correctly.

## Memory ("in memory alongside cover letter + interview answers")

- **Profile memory injection:** `buildDurableProfileMemory`
  ([src/lib/profile/memory.ts](src/lib/profile/memory.ts)) maps
  `profile.targetRoles || onboardingSession?.targetRole` → `memory.profile.targetRole`, and
  `buildMemoryPromptFragment` (route L38-L64) injects it into the system prompt as
  `Target role (what they want to become): {targetRole}`. This is the "in memory" surface the
  LLM sees on every generation. Because the GLOBAL block reloads `profile` and reassigns
  `onboardingSession`, the memory fragment is already built from fresh data. **No change
  needed beyond the detector swap.**
- **Artifact neighbors (`StoredArtifact`):** cover letters and interview Q&A are persisted
  via `artifactDAL.store(...)` (route L465, L706) and `storeInterviewQA(...)` (route L925).
  These are historical artifacts; per locked decision #5 they are **not** rewritten on role
  change. The "keep consistent" requirement is satisfied by ensuring the *next* generation
  reads the new role — which the read paths above already do. No migration of existing
  artifacts.

## Acknowledgement Wiring

- The reply is a single `answer: string` variable assigned in each phase branch and returned
  once at route **L965**: `return NextResponse.json({ answer });`.
- **Recommended approach:** In the GLOBAL block, when a switch happens, set
  `const roleAck: string | null`. Then immediately before the final return (after all
  branches assigned `answer`), do:
  ```ts
  if (roleAck) answer = `${roleAck}\n\n${answer}`;   // prepend, or append — planner's choice
  ```
  Prepending keeps the acknowledgement visible even when a downstream branch replaces
  `answer` wholesale (retrieval/edit/off-topic branches assign `answer` directly, so an
  in-branch append would be lost — do the concat at the end, near L963).
- **i18n:** `locale: "en" | "de" | "fr"` is available (route L91, defaulted `"en"`). Build a
  small string table mirroring `getTargetRoleQuestion`'s shape
  ([detect-target-role.ts](src/lib/onboarding/detect-target-role.ts) L87-L100). Example:
  ```ts
  const ack = {
    en: (r: string) => `Got it — I'll optimize everything for ${r} now. 🎯`,
    de: (r: string) => `Verstanden — ich optimiere ab jetzt alles für ${r}. 🎯`,
    fr: (r: string) => `C'est noté — j'optimise désormais tout pour ${r}. 🎯`
  }[locale];
  ```
  Do NOT translate the role string itself.

## Tests

### Test framework
| Property | Value |
|----------|-------|
| Framework | Vitest `[VERIFIED: vitest.config.ts, tests import from "vitest"]` |
| Config | [vitest.config.ts](vitest.config.ts) — `include: ["tests/**/*.test.ts"]` (no global setupFiles) |
| Quick run | `npx vitest run tests/integration/onboarding-assistant-*.test.ts` |
| Full suite | `npx vitest run` |
| Build gate | `npm run build` (0 errors required per scope) |

### Pattern to mirror
[tests/integration/onboarding-assistant-cover-letter.test.ts](tests/integration/onboarding-assistant-cover-letter.test.ts)
is the closest template. It:
- Uses `vi.hoisted()` + `vi.mock("@/auth/config")`, `vi.mock("@/lib/db")`,
  `vi.mock("@/lib/profile/memory")`, and **`vi.mock("@/lib/env", () => ({ env: {
  ANTHROPIC_API_KEY: "test-key", ANTHROPIC_MODEL: "claude-test" } }))`** (L22-L27).
- Imports `POST` from `@/app/api/onboarding/assistant/route` AFTER the mocks.
- Provides a `fetchMock`/`anthropicResponse(text)` helper returning
  `{ ok: true, json: async () => ({ content: [{ type: "text", text }] }) }` (L42-L50).

### Env-setup gotcha (verified)
Modules that validate env at import (via `@/lib/env`) need `DATABASE_URL` and `AUTH_SECRET`.
Two accepted approaches exist in the repo:
1. **Mock `@/lib/env`** in the test (what the cover-letter test does) — preferred for
   assistant-route tests since they already mock `db` and `auth`.
2. **Side-effect import** [tests/integration/_setup-env.ts](tests/integration/_setup-env.ts)
   which sets `process.env.DATABASE_URL`/`AUTH_SECRET` defaults — import BEFORE any
   env-validating module. Use this for tests that exercise the real detector module without
   mocking env.

### New tests to add (per locked decisions)
- LLM returns a role → `db.onboardingSession.update` and `db.candidateProfile.update` both
  called with the normalized role; `answer` contains the localized acknowledgement.
- LLM returns null (no intent) → neither update called; no acknowledgement.
- Interview practice turn mentioning a role in an *answer* (`currentMode === "practice"`,
  non-first-person) → detector returns null (mock the LLM response to null) → no switch.
- Explicit first-person switch *during* practice → switch happens.
- DE/FR locale → acknowledgement in the right language.
- Detector network failure (fetch throws / non-ok) → no switch, request still returns 200.

## Common Pitfalls

### Pitfall 1: Per-turn latency from an unconditional LLM call
**What goes wrong:** Adding a blocking Anthropic call to every message doubles latency.
**How to avoid:** Keyword pre-filter gate (Pattern 3) so only intent-bearing turns hit the
LLM; tiny `max_tokens` (≤ 20); short timeout (~8-10 s). The call is already on the awaited
hot path, so keep the prompt terse.

### Pitfall 2: False positives inside interview answers
**What goes wrong:** "I want the team to become cloud-native" flips the target role.
**How to avoid:** Pass `inPractice` context; prompt the LLM to only return a role when the
user expresses a first-person *career* intent to pursue that role, else `null`.

### Pitfall 3: Losing the acknowledgement in branch overwrites
**What goes wrong:** Retrieval/edit/off-topic branches assign `answer` directly, discarding
an in-branch acknowledgement string.
**How to avoid:** Concatenate the acknowledgement once at the end, right before
`return NextResponse.json({ answer })` (route ~L963).

### Pitfall 4: Duplicate detection drift
**What goes wrong:** Leaving the L289 and L504 regex blocks means two code paths disagree
with the new LLM path.
**How to avoid:** Delete both duplicates; rely solely on the GLOBAL block (it already runs
before phase routing, so profile-collection and services both see the updated role).

### Pitfall 5: `detectTargetRoleFromMessage` import removal breaks build
**What goes wrong:** The named import at route L9 (`detectTargetRoleFromMessage,
getTargetRoleQuestion`) — removing the function while still importing it fails TS build.
**How to avoid:** Update the import to keep `getTargetRoleQuestion` (still used at L325) and
drop `detectTargetRoleFromMessage`; add the new detector import.

## Enumerated Callers of Code Being Replaced

`detectTargetRoleFromMessage` (the function being replaced) — production callers:
1. [src/app/api/onboarding/assistant/route.ts](src/app/api/onboarding/assistant/route.ts) **L9** — import.
2. …route.ts **L224** — GLOBAL block (KEEP the block, swap the detector). ← primary rewire.
3. …route.ts **L289** — `profile-collection` branch duplicate (DELETE this detect+persist).
4. …route.ts **L504** — `services` branch duplicate (DELETE this detect+persist).

`extractTargetRoleFromHistory` — **no production callers.** Only referenced in
`TARGET_ROLE_FIX_VALIDATION.md` (docs) and its own definition. Safe to delete with the module
rewrite, or leave unused. `[VERIFIED: grep across workspace]`

`getTargetRoleQuestion` — **KEEP.** Called at route **L325** (CV-upload clarifying question);
imported at **L9**. Not part of detection; unaffected by the phase.

`detect-target-role.ts` other references: `.planning/phases/10-.../CONTEXT.md` (spec) and
`TARGET_ROLE_FIX_VALIDATION.md` (historical doc) — non-code.

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Regex intent patterns decide the role | LLM disambiguates; regex only gates | Handles paraphrases; rejects false positives in interview answers |
| Detect+persist duplicated in 3 branches | Single GLOBAL detect+persist | 1× latency/cost, no drift |
| Silent switch, no user feedback | Silent switch + localized acknowledgement | Satisfies locked decision #2 |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Anthropic API key | LLM detection | Runtime env (`ANTHROPIC_API_KEY`) | — | Route already 503s if unset (L104); detector returns null on missing key |
| Postgres (Prisma) | Persist role | ✓ (existing) | — | — |
| Node fetch (Next runtime) | Anthropic call | ✓ | — | — |

No new external tools. Detector must degrade gracefully (return null) when the key is absent,
matching the signals engine contract ([engine.ts](src/lib/ai/signals/engine.ts) L63-L65).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | [vitest.config.ts](vitest.config.ts) |
| Quick run command | `npx vitest run tests/integration/onboarding-assistant-cover-letter.test.ts` |
| Full suite command | `npx vitest run` |

### Requirements → Test Map
| Req | Behavior | Test Type | Command | File Exists? |
|-----|----------|-----------|---------|--------------|
| TRB-01/03 | Explicit intent switches; mentioned role does not | integration | `npx vitest run tests/integration/onboarding-target-role-*.test.ts` | ❌ Wave 0 |
| TRB-02 | Both DB fields updated + reload | integration | same | ❌ Wave 0 |
| TRB-04 | Acknowledgement in EN/DE/FR | integration | same | ❌ Wave 0 |
| TRB-06 | Build clean | build | `npm run build` | ✅ |

### Wave 0 Gaps
- [ ] `tests/integration/onboarding-target-role-detection.test.ts` — new, mirrors
  `onboarding-assistant-cover-letter.test.ts` mocking setup.
- [ ] (optional) unit test for the new detector module with mocked `fetch`.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | User message → LLM; validate/normalize returned role (length cap, strip control chars) before persisting to `targetRoles`. The role is later interpolated into system prompts, so treat it as untrusted text. |
| V2 Authentication | yes (inherited) | Route already gates on `auth()` (L82) |
| V6 Cryptography | no | — |

### Known Threat Patterns
| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| Prompt-injection via user message steering the classifier | Tampering | Constrain the classifier system prompt to output only a role string or null; cap output length; never execute the role text — only store/interpolate as data |
| Stored-then-reflected role in system prompt | Tampering/Info | Normalize (title-case, length ≤ ~60 chars, strip newlines/backticks) before persisting — reuse the sanitization idiom already applied to `ANTHROPIC_MODEL` |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `claude-sonnet-5` latency at ~20 output tokens (behind the keyword gate) is acceptable per turn | Standard Stack | If too slow, planner adds a dedicated cheap-model env var |
| A2 | Standalone `/api/mock-interview/start` route is likely in-scope for the "reads fresh role" fix | Downstream Consumers | If out of scope, leave as-is; assistant-route interview path is unaffected |
| A3 | Prepending the acknowledgement to `answer` is acceptable UX vs. appending | Acknowledgement Wiring | Trivial; planner/UX picks placement |

## Open Questions

1. **Is the standalone `/api/mock-interview/*` route in Phase 10 scope?**
   - Known: it reads `targetRole || profile.primaryRole`, ignoring `profile.targetRoles`.
   - Unclear: phase text lists `src/lib/interview/engine.ts` + `prompts.ts` (which take a
     `targetRole` arg) but not the mock-interview route explicitly.
   - Recommendation: fix the one-line fallback (`|| profile.targetRoles`) for consistency;
     low risk, honors locked decision #5.
2. **Dedicated cheap model env var vs. reuse `ANTHROPIC_MODEL`?**
   - Recommendation: reuse `ANTHROPIC_MODEL` + keyword gate; revisit only if latency is felt.

## Sources

### Primary (HIGH confidence — workspace source, verified)
- [src/app/api/onboarding/assistant/route.ts](src/app/api/onboarding/assistant/route.ts) — GLOBAL/duplicate detection, generation branches, return site.
- [src/lib/onboarding/detect-target-role.ts](src/lib/onboarding/detect-target-role.ts) — detector being replaced.
- [src/lib/ai/signals/engine.ts](src/lib/ai/signals/engine.ts) — house Anthropic + JSON-parse/salvage pattern.
- [src/lib/cv/extract-phase1.ts](src/lib/cv/extract-phase1.ts) — raw fetch + abort + retry pattern.
- [src/lib/profile/memory.ts](src/lib/profile/memory.ts) — memory read path.
- [src/lib/ai/assistant/services/cover-letter.ts](src/lib/ai/assistant/services/cover-letter.ts) — cover-letter read of `targetRoles`.
- [src/lib/interview/parse-gaps.ts](src/lib/interview/parse-gaps.ts) — guidance read path.
- [src/lib/interview/engine.ts](src/lib/interview/engine.ts) / [prompts.ts](src/lib/interview/prompts.ts) — interview generation.
- [src/app/api/mock-interview/start/route.ts](src/app/api/mock-interview/start/route.ts) — standalone interview read path (gap).
- [src/lib/env.ts](src/lib/env.ts) — env var contract.
- [src/types/assistant-state.ts](src/types/assistant-state.ts) — `InterviewPrepServiceState.currentMode`.
- [tests/integration/onboarding-assistant-cover-letter.test.ts](tests/integration/onboarding-assistant-cover-letter.test.ts) + [tests/integration/_setup-env.ts](tests/integration/_setup-env.ts) — test pattern + env gotcha.

## Metadata

**Confidence breakdown:**
- Detection/update path: HIGH — read the exact lines.
- Anthropic house pattern: HIGH — three concordant reference modules.
- Downstream read freshness: HIGH — reload verified in GLOBAL block; one gap flagged.
- Latency/model choice: MEDIUM — no cheap-model var exists; behavioral assumption A1.

**Research date:** 2026-07-17
**Valid until:** ~2026-08-16 (stable internal code; revisit if the assistant route is refactored)
