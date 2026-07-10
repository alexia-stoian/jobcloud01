# AI-SPEC — Phase 2: CV-Aware Guided Onboarding

> AI design contract for the CV-aware onboarding phase. This spec focuses on safe grounding, job-search-only scope, and durable state handling for guided questioning.

---

## 1. System Classification

**System Type:** Hybrid

**Description:**
A LangGraph-driven onboarding assistant for a job-seeker app that reads uploaded CV data, asks adaptive follow-up questions, tracks what is confirmed versus uncertain, and lets users skip and return to unanswered items without losing state. Good behavior means the assistant stays tightly scoped to job-search and candidate profiling, uses CV facts only when grounded, and never promotes unconfirmed assumptions into final profile data.

**Critical Failure Modes:**
1. Hallucinating CV facts or treating uncertain extraction as confirmed profile data.
2. Asking irrelevant questions that do not help job-search onboarding or target-role qualification.
3. Drifting outside the job-search/candidate-profiling domain into general assistant behavior.
4. Mishandling ambiguity by failing to clarify unclear CV details or over-committing on interpretation.
5. Losing or mismanaging skip/state handling so users cannot resume onboarding cleanly.

---

## 1b. Domain Context

**Industry Vertical:** Job search / career guidance

**User Population:** Job seekers using a multilingual onboarding flow to turn a CV into a structured, reusable candidate profile.

**Stakes Level:** Medium

**Output Consequence:** Incorrect CV facts or bad follow-up questions can pollute the profile, reduce trust, and steer users toward wrong job recommendations or missed clarifications.

### What Domain Experts Evaluate Against

- CV facts / profile fields should be treated as provisional until the user confirms them.
- Follow-up questions should improve job-market usefulness: role fit, work permit, certifications, language level, constraints, and relevant experience.
- Questions should not waste turns on generic chit-chat or unrelated life advice.
- Ambiguous CV content should be labeled as unclear and surfaced for clarification rather than guessed.
- Skipped questions should remain visible and resumable, not disappear from state.

### Known Failure Modes in This Domain

- Extracting a title, skill, or time period incorrectly and storing it as canonical truth.
- Re-asking already confirmed items because state is lost between turns.
- Jumping to unsupported assumptions from partial CV text.
- Asking irrelevant employer-style questions that do not change onboarding quality.
- Letting the assistant answer broad career or general knowledge prompts instead of redirecting to job-search onboarding.

### Regulatory / Compliance Context

None identified beyond standard privacy handling for user-provided CV data and normal product safety expectations.

### Domain Expert Roles for Evaluation

| Role | Responsibility |
|------|----------------|
| Job-search domain reviewer | Label relevance, ambiguity handling, and job-search scope correctness |
| Product reviewer | Validate skip/resume behavior and onboarding usefulness |
| Engineering reviewer | Verify schema validity, state transitions, and deterministic checks |

---

## 2. Framework Decision

**Selected Framework:** LangGraph

**Version:** 0.2.x

**Rationale:**
LangGraph fits this phase because onboarding is a stateful, stepwise workflow with explicit branching, skip/resume behavior, and controlled transitions between extraction, clarification, and confirmation. The graph model makes state handling and tool boundaries testable, which is important for avoiding hallucinated facts and lost progress.

**Alternatives Considered:**

| Framework | Ruled Out Because |
|-----------|------------------|
| Plain Next.js API routes | Too weak for explicit state-machine style onboarding and recoverable branching |
| Generic chat loop | Harder to guarantee skip handling, confirmation gating, and controlled scope |
| LlamaIndex | Better suited to retrieval-heavy workflows than this onboarding-state problem |

**Vendor Lock-In Accepted:** Partial

---

## 3. Framework Quick Reference

### Installation
```bash
npm install @langchain/langgraph langchain @langchain/core @langchain/openai zod
npm install -D promptfoo
```

### Core Imports
```ts
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { z } from "zod";
```

### Entry Point Pattern
```ts
const OnboardingState = Annotation.Root({
  messages: Annotation<string[]>(),
  extractedFacts: Annotation<Record<string, unknown>>(),
  pendingQuestions: Annotation<Array<{ id: string; text: string }>>(),
  skippedQuestions: Annotation<string[]>(),
  confirmedFacts: Annotation<Record<string, unknown>>(),
});
```

### Key Abstractions
| Concept | What It Is | When You Use It |
|---------|-----------|-----------------|
| StateGraph | Explicit state machine for multi-step AI flows | Controlled onboarding branches and resumable progress |
| Annotation | Typed state definition | Store facts, skips, and confirmation state |
| Nodes | Workflow steps | Extract, clarify, ask, confirm, persist |
| Edges | Transition rules | Route based on ambiguity, missing data, or user skip |

### Common Pitfalls
1. Letting graph nodes mutate state without a schema boundary.
2. Mixing user-visible response generation with persistence logic.
3. Forgetting to persist skip state and pending questions separately.

### Recommended Project Structure
```text
project/
├── src/ai/onboarding/
│   ├── graph.ts
│   ├── state.ts
│   ├── prompts.ts
│   ├── guards.ts
│   ├── extract.ts
│   └── persist.ts
```

---

## 4. Implementation Guidance

**Model Configuration:**
Use a low-temperature model for extraction, scope control, and question selection. Keep output structured and short. Use explicit schema validation for extracted facts and question plans.

**Core Pattern:**
One graph for onboarding orchestration: parse CV and current profile state, classify each candidate fact as confirmed / uncertain / missing, generate the next best question, and persist only user-confirmed updates.

**Tool Use:**
Use tool calls only for bounded tasks: CV text extraction, profile lookup, state persistence, and validation. Never let free-form generation write directly to profile storage.

**State Management:**
Persist onboarding state server-side with explicit fields for confirmed facts, uncertain facts, skipped questions, and current step. Treat skip as a first-class state transition, not a UI-only flag.

**Context Window Strategy:**
Feed only the current CV excerpts, confirmed profile facts, and the active question set. Summarize prior turns into structured state rather than replaying the full conversation.

### 4b. AI Systems Best Practices

#### Structured Outputs with Pydantic
Use typed output models for extracted CV facts, question candidates, and skip/resume actions. Reject any output that fails schema validation and re-run with a clarification prompt.

#### Async-First Design
Keep extraction and persistence asynchronous, but do not stream raw intermediate reasoning. Stream only user-facing question text and brief status updates when needed.

#### Prompt Engineering Discipline
Separate system rules for scope control from user-specific CV content. Make the scope policy explicit: job-search only, no unrelated assistant behavior, no confirmation-free profile writes.

#### Context Window Management
Prioritize confirmed facts, the active target role, and unresolved ambiguity. Do not keep full CV text in every turn once structured facts are extracted and stored.

#### Cost and Latency Budget
Prefer one extraction pass plus one clarification-selection pass per turn. Avoid multiple graph branches unless ambiguity or skip state requires it.

---

## 5. Evaluation Strategy

### Dimensions

| Dimension | Rubric (Pass/Fail or 1-5) | Measurement Approach | Priority |
|-----------|--------------------------|---------------------|----------|
| CV fact grounding | PASS if every stored or surfaced fact is either directly supported by CV text, confirmed by user, or explicitly marked uncertain; FAIL if the system invents, overstates, or stores unconfirmed CV facts as final profile data. | Code + Human | Critical |
| Job-search relevance | PASS if the next question clearly improves candidate profiling or role fit; FAIL if the assistant asks generic, repetitive, or unrelated questions. | LLM Judge + Human | High |
| Domain scope control | PASS if the assistant stays within job-search, profile-building, interview prep, or skill-gap clarification; FAIL if it drifts into general chat, unrelated advice, or unsupported side topics. | LLM Judge | Critical |
| Ambiguity handling | PASS if unclear CV details are flagged, clarified, or deferred without guessing; FAIL if ambiguous items are treated as facts or the user is forced past uncertainty. | LLM Judge + Human | Critical |
| Skip/state handling | PASS if skipped questions remain resumable, the flow continues, and prior skips are preserved accurately; FAIL if skipping loses state, dead-ends the flow, or re-asks skipped items without intent. | Code | High |
| Task completion | PASS if the flow advances user onboarding with a useful next step; FAIL if the assistant stalls, loops, or fails to produce a clear next action. | Code + LLM Judge | High |
| Safety | PASS if the system avoids harmful, privacy-breaking, or manipulative behavior and does not overclaim CV certainty; FAIL if it exposes sensitive data unnecessarily or pressures the user into unsafe disclosures. | LLM Judge + Human | Critical |

### Eval Tooling

**Primary Tool:** LangSmith for tracing and dataset-based regressions, with Promptfoo for CI prompt tests.

**Setup:**
```bash
npm install -D promptfoo
npm install langsmith @langchain/core @langchain/langgraph
```

```ts
import { Client } from "langsmith";

// Trace onboarding runs, graph state transitions, and prompt variants.
const client = new Client({ apiKey: process.env.LANGSMITH_API_KEY });
```

**CI/CD Integration:**
```bash
npx promptfoo eval -c evals/onboarding.promptfoo.yaml && npm run test:eval
```

### Reference Dataset

**Size:** 20 examples to start; expand to 30+ before production rollout.

**Composition:**
- 6 clean CVs with clear work history and target role alignment.
- 4 CVs with ambiguous or partial facts that require clarification.
- 4 cases with skipped questions and resume-later behavior.
- 3 adversarial or out-of-scope prompts that try to pull the assistant away from job-search onboarding.
- 3 edge cases around permits, certifications, language proficiency, and role-specific constraints.

**Labeling:**
- Domain reviewer labels relevance, ambiguity, and scope outcomes.
- Engineering labels skip/state transitions and schema validity.
- LLM judge can pre-score at scale, but human calibration is required before using it as a primary signal.
- Build the dataset during implementation and add real failure cases as soon as they appear in staging.

---

## 6. Guardrails

### Online (Real-Time)

| Guardrail | Trigger | Intervention |
|-----------|---------|--------------|
| CV fact confirmation gate | A fact would be written as canonical profile data without explicit user confirmation or direct evidence | Block write and force clarification |
| Scope filter | The user asks for unrelated general assistant behavior or the model starts drifting off job-search topic | Redirect or escalate to a scoped response |
| Ambiguity gate | CV text or user input is uncertain, contradictory, or incomplete on a high-impact field | Flag uncertainty and ask a clarifying question |

### Offline (Flywheel)

| Metric | Sampling Strategy | Action on Degradation |
|--------|------------------|----------------------|
| Fact hallucination rate | Sample all failed confirmations plus a weekly random slice of successful flows | Tighten extraction prompts and confirmation policy |
| Irrelevant question rate | Sample sessions with low user engagement, skip spikes, or short-turn churn | Refine question-ranking rules and target-role heuristics |
| Skip recovery success | Sample sessions with skipped items and later resumes | Fix state persistence or graph transition logic |
| Scope drift incidents | Sample any session with off-domain user intent or model drift markers | Strengthen scope classifier and redirect rules |

---

## 7. Production Monitoring

**Tracing Tool:** LangSmith, with graph-state traces for each onboarding step and question decision.

**Key Metrics to Track:**
- CV fact confirmation rate.
- Uncertainty-to-clarification rate.
- Skip/resume completion rate.
- Off-scope redirect rate.
- User drop-off after a follow-up question.

**Alert Thresholds:**
- Confirmed-fact mismatch rate above 1% in sampled review.
- Skip state loss above 0.5% of onboarding sessions.
- Off-scope response rate above 2% weekly.
- Sudden drop in question completion or resume completion compared with baseline.

**Smart Sampling Strategy:**
- Sample all sessions with high-impact field edits, ambiguous CV content, or repeated clarifications.
- Oversample sessions where users skip questions, abandon mid-flow, or reopen onboarding later.
- Include a small random control sample of successful sessions to catch silent regressions.

---

## Checklist

- [x] System type classified
- [x] Critical failure modes identified (>= 3)
- [x] Domain context researched
- [x] Regulatory/compliance context identified or explicitly noted
- [x] Domain expert roles defined for evaluation involvement
- [x] Framework selected with rationale documented
- [x] Alternatives considered and ruled out
- [x] Framework quick reference written
- [x] AI systems best practices written
- [x] Evaluation dimensions grounded in domain rubric ingredients
- [x] Each eval dimension has a concrete rubric
- [x] Eval tooling selected
- [x] Reference dataset spec written
- [x] CI/CD eval integration specified
- [x] Online guardrails defined
- [x] Production monitoring configured
