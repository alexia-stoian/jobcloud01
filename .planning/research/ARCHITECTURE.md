# Architecture Research

**Domain:** Multilingual AI-assisted job-search application
**Researched:** 2026-07-08
**Confidence:** MEDIUM

## Standard Architecture

### System Overview

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                              Experience Layer                               │
├──────────────────────────────────────────────────────────────────────────────┤
│  Web App / Mobile Web                                                       │
│  - Auth screens   - CV upload   - Conversational intake   - Guidance UI     │
│  - Localized EN / DE / FR presentation using canonical locale tags          │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │ HTTPS + user session
┌──────────────────────────────────────────────────────────────────────────────┐
│                             Application Layer                               │
├──────────────────────────────────────────────────────────────────────────────┤
│  API Gateway / BFF                                                          │
│  Identity & Session Service                                                 │
│  Candidate Profile Service                                                  │
│  CV Ingestion Service                                                       │
│  Conversation Orchestrator                                                  │
│  Recommendation & Readiness Service                                         │
│  Localization / Content Service                                             │
│  Audit / Consent / Policy Service                                           │
└───────────────┬──────────────────────┬──────────────────────┬───────────────┘
                │                      │                      │
┌───────────────▼────────────┐ ┌───────▼──────────────┐ ┌────▼────────────────┐
│      Intelligence Layer    │ │     Data Access      │ │   Platform Layer    │
├────────────────────────────┤ ├──────────────────────┤ ├─────────────────────┤
│  LLM Gateway / Safety      │ │ Profile Memory API   │ │ Metrics / Logs       │
│  Prompt / Tool Orchestration│ │ Retrieval / Search   │ │ Traces / Eval        │
│  Extraction / Classification│ │ Security Filtering   │ │ Queues / Workers     │
│  Ranking / Heuristic Policy │ │ Provenance Resolver  │ │ Notifications        │
└───────────────┬────────────┘ └──────────┬───────────┘ └─────────┬───────────┘
                │                         │                       │
┌───────────────▼──────────────────────────────────────────────────────────────┐
│                               Storage Layer                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│  Relational DB        Object Storage        Search / Vector Store           │
│  - accounts           - raw CV files        - profile snippets              │
│  - candidate profile  - extracted text      - memory summaries              │
│  - job preferences    - generated assets    - guidance knowledge            │
│  - consent / audit    - interview kits      - retrieval metadata            │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| API gateway / BFF | Terminates client auth, shapes app-specific APIs, applies coarse rate limits and locale/session context | Web API layer with authenticated route handlers |
| Identity & session service | Account creation, login, passwordless or OAuth flows, session issuance, user-to-profile binding | Managed identity provider plus app-side session records |
| Candidate profile service | Owns canonical candidate schema and profile CRUD, separate from chat transcripts | Relational domain service over normalized tables / JSON columns |
| CV ingestion service | Validates uploads, extracts text, normalizes resume data, records provenance and confidence | Async worker pipeline backed by object storage and queue |
| Conversation orchestrator | Decides next question, calls retrieval and model tools, enforces job-search-only behavior | Stateless orchestration service with prompt templates and tool calls |
| Profile memory API | Gatekeeper for all candidate-memory reads and writes with authorization and audit | Internal API in front of DB, search, and vector access |
| Recommendation & readiness service | Generates next steps, interview prep, skill-gap guidance, readiness scoring | Policy layer with heuristics first, later ML/ranking |
| Localization / content service | Serves translated UI strings, prompt variants, fallback rules, and locale metadata | i18n catalog service with BCP 47 locale handling |
| Audit / consent / policy service | Tracks consent, data retention rules, access logs, and redaction policy | Compliance-oriented service with append-only logs |
| LLM gateway / safety layer | Centralizes model selection, prompt guards, redaction, retry, and observability | Single abstraction over foundation-model APIs |

## Recommended Project Structure

```text
src/
├── app/                    # Framework entrypoints, routing, bootstrapping
│   ├── api/                # HTTP handlers / server actions
│   └── ui/                 # App shells and localized screens
├── domains/                # Business domains with clear ownership boundaries
│   ├── identity/           # Account, auth, sessions, consent links
│   ├── profile/            # Candidate schema, preferences, profile mutations
│   ├── cv/                 # Upload, parsing jobs, extraction, provenance
│   ├── conversation/       # Intake turns, orchestration, question state
│   ├── memory/             # Profile memory access API and retrieval contracts
│   ├── recommendations/    # Guidance, readiness, interview prep, skill gaps
│   └── localization/       # Locale, translation, language-tag helpers
├── platform/               # Cross-cutting concerns
│   ├── ai/                 # Model gateway, prompt runners, safety filters
│   ├── data/               # Persistence adapters, repositories, migrations
│   ├── search/             # Search/vector adapters and indexing
│   ├── events/             # Queue publishers, workers, outbox
│   ├── observability/      # Logging, tracing, metrics, evaluations
│   └── security/           # Redaction, policy enforcement, audit
├── shared/                 # Shared types and low-level utilities only
└── tests/                  # Boundary-focused unit, integration, and eval tests
```

### Structure Rationale

- **domains/:** Keeps product capabilities aligned to roadmap slices. Identity, profile, CV, conversation, memory, and recommendations can ship incrementally without collapsing into one AI service.
- **platform/:** Centralizes model, storage, search, and security infrastructure so later interview prep and skill-gap guidance reuse the same profile and memory foundations.
- **conversation/ vs profile/:** Prevents chat history from becoming the source of truth. The profile domain owns durable candidate facts; conversation only proposes or confirms them.
- **memory/:** Makes privacy and authorization testable because every retrieval or write path crosses one internal boundary.

## Architectural Patterns

### Pattern 1: Canonical Profile with Provenance

**What:** Store a normalized candidate profile as the durable source of truth, with each field carrying source metadata such as CV, user answer, inferred extraction, or manual confirmation.
**When to use:** From day one. This is the core pattern that makes multilingual reuse, interview prep, and skill-gap guidance reliable.
**Trade-offs:** Slightly more schema work up front, but far less rework than treating chat output as unstructured memory.

**Example:**
```typescript
type CandidateFact = {
  key: 'roleTargets' | 'skills' | 'workRate' | 'locationPreference';
  value: unknown;
  source: 'cv' | 'chat' | 'user-edit';
  confidence: number;
  locale?: string;
  lastConfirmedAt?: string;
};
```

### Pattern 2: Orchestrator over Tool Boundaries

**What:** The conversation service orchestrates specialized tools instead of directly reading databases or calling models with raw user context.
**When to use:** For conversational intake, follow-up question generation, and profile-aware guidance.
**Trade-offs:** More service boundaries and contracts, but much better control over privacy, prompt discipline, and auditability.

**Example:**
```typescript
const turnPlan = await orchestrator.run({
  userId,
  locale,
  message,
  tools: ['loadProfileSummary', 'getMissingFields', 'saveConfirmedFacts']
});
```

### Pattern 3: Async CV Ingestion with Human-Readable Artifacts

**What:** Process CV upload through an asynchronous pipeline that produces extracted text, normalized entities, and reviewable parsing results before profile writes are finalized.
**When to use:** Any file upload path. It protects the conversational flow from slow parsing and lets the product recover from partial extraction.
**Trade-offs:** Requires queueing and job-state handling, but avoids long request latency and opaque parsing failures.

## Data Flow

### Request Flow

```text
[User Action]
    ↓
[Web App] → [API/BFF] → [Domain Service] → [Profile Memory API] → [Store]
    ↓            ↓             ↓                  ↓                 ↓
[Localized UI] ← [DTO map] ← [Policy rules] ← [Authorized data] ← [DB/Search]
```

### State Management

```text
[Profile Store]
    ↓
[Selectors / Queries] ←→ [UI + Conversation State] → [Commands] → [Profile Store]
                           ↓
                    [Transient Chat State]
```

Transient chat state should never be the only place where confirmed candidate facts live.

### Key Data Flows

1. **Account creation and language bootstrapping:** User signs up through the identity provider, the app creates an internal user record, initializes a candidate profile shell, stores consent, and assigns a canonical locale such as `en-CH`, `de-CH`, or `fr-CH`. Privacy matters immediately here because identity, consent, and profile identifiers must be bound before any CV or AI data is accepted.
2. **Candidate profile storage:** The profile service persists normalized job-seeker facts such as role interests, location preferences, contract type, work rate, education, skills, and constraints in a relational store. Each fact should preserve provenance and last-confirmed metadata so later guidance can distinguish explicit user statements from model inferences.
3. **CV ingestion:** The client uploads the CV to object storage through a signed path, the ingestion service validates file type and size, scans for threats, extracts text and entities, and writes a parse artifact plus a proposed structured profile delta. The conversation service consumes only the structured delta and provenance summary, not the raw file, unless explicit review is required.
4. **Conversational intake:** The web app sends each user turn to the conversation orchestrator with the session locale and user token. The orchestrator loads a profile summary and missing-field list from the memory API, decides the next domain-safe question, optionally calls extraction or normalization helpers, and emits both the assistant reply and a list of confirmed profile mutations.
5. **Profile memory updates:** Confirmed facts flow through the profile service into canonical storage, then a projection/indexing worker updates search or vector representations. Unconfirmed model guesses should remain in a proposal buffer, not in the durable profile. This boundary is critical for privacy, correctness, and later explainability.
6. **Recommendation and readiness:** The readiness service reads the canonical profile, inferred gaps, and activity history to produce next steps such as profile completion prompts, interview-prep question sets, and skill-gap suggestions. This should be downstream from the profile platform, not embedded into onboarding chat logic, so the same candidate record can support multiple future coaching surfaces.
7. **Interview prep and skill-gap guidance:** The service combines target roles, extracted experience, and missing qualifications with curated guidance content or retrieval sources. Because this layer consumes structured profile facts rather than replaying entire conversations, it is easier to localize, test, and evolve independently.

## Major Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Identity ↔ profile | API / domain commands | Identity owns authentication; profile owns candidate data. Never let auth tables become the profile schema. |
| Conversation ↔ profile memory | Internal API only | Orchestrator reads summaries and writes confirmed facts, but does not query storage directly. |
| CV ingestion ↔ profile | Async events + explicit review payloads | Parsing proposes facts; profile service decides persistence. |
| Recommendations ↔ conversation | API / projections | Guidance consumes profile projections and event history, not raw prompt transcripts. |
| Localization ↔ all user-facing domains | Shared locale contracts | Locale is first-class request context, but domain facts remain mostly language-neutral. |
| LLM gateway ↔ domain services | Tool contracts | Centralizes safety, model versioning, prompt policy, and tracing. |

## Privacy and Security Constraints

- **Memory access must be mediated:** Official multitenant RAG guidance consistently recommends an API boundary in front of grounding stores. Apply the same rule here for candidate profiles, memory summaries, and retrieval indexes.
- **Consent and retention are domain data:** Store consent version, accepted policy timestamp, and retention status separately from conversation transcripts.
- **Raw CVs are more sensitive than normalized facts:** Restrict direct access to file blobs and extracted text. Most product flows should use normalized profile facts and provenance summaries.
- **Locale can reveal demographic signals:** Treat language preference as profile data subject to the same access controls and analytics minimization as other personal attributes.
- **Audit all memory reads used for AI grounding:** If a model response was grounded on candidate facts or uploaded documents, log which sources were retrieved and why.
- **Redact before prompts where possible:** Prompt payloads should prefer compact structured summaries over full transcripts or raw documents.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k users | Modular monolith is appropriate. Keep one app deploy, one relational DB, object storage, one async worker queue, and a single model gateway. |
| 1k-100k users | Split CV ingestion workers from synchronous app traffic, add search/vector indexes for memory and curated guidance retrieval, and tighten observability around model latency and profile-update fanout. |
| 100k+ users | Consider dedicated profile-memory APIs, regional data controls, separate recommendation pipelines, and stricter partitioning for audit and storage workloads before splitting the full product into many microservices. |

### Scaling Priorities

1. **First bottleneck:** CV ingestion and model latency. Fix by moving extraction and enrichment to queued workers with resumable job states.
2. **Second bottleneck:** Memory retrieval and profile projection freshness. Fix by separating transactional writes from search/vector indexing and monitoring lag explicitly.

## Anti-Patterns

### Anti-Pattern 1: Chat Transcript as the Profile Database

**What people do:** Save raw conversations and later ask the model to reconstruct the candidate profile from chat history.
**Why it's wrong:** Creates privacy sprawl, weak provenance, hard-to-correct facts, and brittle interview-prep or recommendation logic.
**Do this instead:** Persist explicit normalized profile facts with provenance, and keep transcripts as supporting evidence only.

### Anti-Pattern 2: Direct Model Access to Candidate Stores

**What people do:** Let the orchestration or model layer query profile/search stores directly without a policy boundary.
**Why it's wrong:** Authorization, tenancy, and audit logic leaks across the codebase and becomes impossible to validate cleanly.
**Do this instead:** Put a profile-memory API in front of all durable candidate data, retrieval indexes, and grounding sources.

### Anti-Pattern 3: Locale-Coupled Candidate Schema

**What people do:** Store separate profile structures per language or persist candidate facts as translated free text only.
**Why it's wrong:** Makes cross-language consistency, recommendation reuse, and later job-matching logic far harder.
**Do this instead:** Store canonical structured facts and localize rendering, prompts, and summaries at the edge.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Identity provider | Redirect or embedded auth with token exchange | Required before any profile memory or CV association occurs. |
| Foundation model provider | Centralized gateway adapter | Keep model choice and safety policy out of business domains. |
| OCR / document extraction | Async worker integration | Optional if native text extraction is sufficient for common CV formats. |
| Email / notification provider | Event-driven integration | Useful for readiness nudges and incomplete-profile follow-ups. |
| Search / vector infrastructure | Internal retrieval adapter | Use for memory summaries and curated guidance retrieval, not as the primary source of truth. |

### Internal Boundaries for Later Roadmap Simplicity

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Profile ↔ readiness | Read model / projection | Makes interview prep and skill-gap guidance additive phases instead of onboarding rewrites. |
| Profile ↔ job recommendations | Read model / ranking API | Supports future matching or ranking work without changing account or intake flows. |
| Guidance content ↔ localization | Catalog lookups | Allows the same guidance logic to render EN/DE/FR outputs consistently. |
| Conversation ↔ evaluation / observability | Structured events | Needed for later prompt tuning, policy enforcement, and quality review. |

## Architecture Recommendation for This Project

For JobScout24 AI Job Copilot, the right default is a **modular monolith with strong internal service boundaries**. The durable backbone should be a canonical candidate profile service plus a separate profile-memory API. CV ingestion should be asynchronous and deterministic, while conversational intake should be an orchestrator that reads profile summaries and writes only confirmed facts. Recommendations, readiness, interview prep, and skill-gap guidance should sit downstream as consumers of the canonical profile rather than being embedded into the intake chat flow.

That choice simplifies the roadmap in two important ways. First, interview prep and skill-gap guidance become new services over an existing candidate model instead of a redesign of onboarding memory. Second, multilingual support stays manageable because locale is treated as first-class request state and rendering concern, while the underlying candidate facts remain stable across English, German, and French.

## Sources

- Microsoft Learn, Design a Secure Multitenant RAG Inferencing Solution, updated 2026-07-02
- AWS Well-Architected Framework, Generative AI Lens, published 2025-11-19
- Google Developers, Rules of Machine Learning, updated 2025-08-25
- IETF RFC 5646, Tags for Identifying Languages

---
*Architecture research for: multilingual AI-guided job-search and candidate profiling systems*
*Researched: 2026-07-08*
