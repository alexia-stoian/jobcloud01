# Project Research Summary

**Project:** JobScout24 AI Job Copilot
**Domain:** Multilingual AI-assisted job-search and candidate profiling application
**Researched:** 2026-07-08
**Confidence:** MEDIUM

## Executive Summary

JobScout24 AI Job Copilot is a Switzerland-first, multilingual candidate-facing product: an authenticated web app that converts CV data, user answers, and job-search goals into a durable candidate profile, then uses that profile for targeted guidance, interview preparation, and skill-gap coaching. The research converges on one clear product shape: this is not a general chatbot and not a job-tracker CRM. Experts build this category by centering a canonical profile owned by the application, treating AI extraction as draft input rather than truth, and keeping the user in control of corrections, confirmations, and high-impact decisions.

The recommended implementation is a modular monolith in Next.js with TypeScript, PostgreSQL, Prisma, Auth.js, next-intl, and an app-owned AI orchestration layer over OpenAI via the Vercel AI SDK. The key architectural decision is to separate conversation, CV ingestion, and durable profile memory so chat transcripts never become the system of record. CV processing should be asynchronous, profile facts should carry provenance and confirmation state, and multilingual support should localize presentation while preserving one canonical schema underneath.

The main risks are privacy over-collection, hallucinated profile facts from imperfect CV parsing, multilingual drift across EN, DE, and FR, and prompt-scope drift into non-job-search advice. Those are not polish issues; they are roadmap-ordering constraints. Foundation phases must establish privacy boundaries, locale-safe schema design, confirmation UX, and guardrails before the product expands into deeper memory, readiness scoring, or interview and skill guidance.

## Key Findings

### Recommended Stack

The stack research strongly favors a current TypeScript-first web product stack that can support server-rendered onboarding, authenticated app flows, file upload, AI routes, and multilingual UX in one codebase. The recommended baseline is Next.js App Router plus React 19 and TypeScript, backed by managed PostgreSQL with Prisma for operational data and pgvector for lightweight semantic retrieval. Auth.js fits the need for app-owned identity and sessions, while next-intl is the right i18n layer for EN, DE, and FR in an App Router application.

The AI and operations layer should stay pragmatic: Vercel AI SDK plus OpenAI Responses API for chat, structured extraction, and tool calling; Zod at every browser, upload, and AI boundary; UploadThing for controlled CV uploads; Inngest for async ingestion and enrichment; and Sentry plus structured logging for observability. This keeps v1 simple enough to ship while preserving clean upgrade paths for privacy posture, provider swaps, and future recommendation features.

**Core technologies:**
- Next.js 16.2.10: full-stack application framework for app routing, server actions, uploads, and AI endpoints.
- React 19.2.7: UI runtime aligned with modern Next.js server and client boundaries.
- TypeScript 6.0.3: contract safety across auth, profile schema, AI payloads, and multilingual content.
- PostgreSQL 17 or 18 managed: primary durable store for accounts, candidate profile, audit, consent, and future recommendation state.
- Prisma 7.8.0: schema ownership, migrations, and type-safe application data access.
- pgvector 0.8.4: lightweight semantic retrieval for memory summaries and CV or guidance snippets without a separate vector platform.
- Auth.js 4.24.14 with Prisma adapter: conservative, app-owned auth and database-backed sessions.
- Vercel AI SDK 7 plus OpenAI Responses API: structured AI orchestration, streaming, tool use, and provider portability.
- next-intl 4.13.1: locale routing, typed messages, and consistent EN, DE, and FR rendering.

### Expected Features

The feature research is unusually consistent: the MVP is a focused job-seeker copilot, not a broad productivity assistant and not a two-sided marketplace. Users will expect an account-tied profile, CV import, multilingual onboarding, adaptive questioning, editable summaries, and practical next-step guidance. The differentiators come from profile fidelity and scope discipline: users should be able to see what the system believes about them, understand why a question is being asked, and correct incorrect or stale assumptions.

The research also narrows what should not be built in v1. A full job-tracker CRM, autonomous job applications, opaque AI profile edits, and general-purpose chatbot behavior all create scope drag or trust risk before the core candidate-profile loop is proven.

**Must have (table stakes):**
- Account-tied candidate profile with durable persistence across sessions.
- CV import with structured extraction and follow-up questioning.
- Guided onboarding with skip-question flow.
- Full multilingual onboarding and chat in English, German, and French.
- Role, location, contract, work-rate, qualification, and preference capture.
- Job-hunt-only AI chat with clear guardrails.
- Structured profile summary and editability.
- Tailored next-step guidance, interview prep, and skill-gap guidance.
- Candidate readiness summary as the payoff artifact after onboarding.

**Should have (competitive):**
- Profile memory fidelity with provenance and confidence markers.
- Adaptive skip-and-return onboarding.
- CV-to-profile reconciliation loop that turns extraction into confirmed structured state.
- Role-relative skill improvement guidance.
- Profile-grounded interview prep and candidate readiness surfaces.
- Multilingual profile normalization under one canonical schema.

**Defer (v2+):**
- Full job application tracker and browser-extension-style workflow.
- Autofill or autonomous apply flows.
- Broad cover-letter and resume tailoring studio.
- Video interview analytics.
- Employer or recruiter marketplace features.

### Architecture Approach

The architecture research recommends a modular monolith with strong internal boundaries around identity, profile, CV ingestion, conversation orchestration, memory access, recommendations, localization, and audit or consent. The decisive pattern is a canonical candidate profile with provenance, while the conversation layer acts as an orchestrator over tool boundaries rather than directly querying storage. CV ingestion should run asynchronously, profile writes should only persist confirmed facts, and memory retrieval should pass through an internal profile-memory API so privacy, tenancy, and audit rules stay enforceable.

**Major components:**
1. Identity and session service: owns authentication, sessions, consent binding, and user-to-profile linkage.
2. Candidate profile service: owns the canonical candidate schema, editability, provenance, and durable profile mutations.
3. CV ingestion service: validates uploads, extracts text and entities, tags confidence, and produces reviewable profile deltas.
4. Conversation orchestrator: chooses next questions, enforces job-search scope, and writes only confirmed facts.
5. Profile memory API: mediates all retrieval and writes for durable candidate memory and grounding sources.
6. Recommendation and readiness service: generates next steps, interview prep, and skill-gap guidance from the canonical profile.
7. Localization and content service: keeps locale first-class while preserving language-neutral domain facts.
8. Audit, consent, and policy service: tracks retention, access, corrections, and compliance-relevant user actions.

### Critical Pitfalls

The pitfalls research is strong and directly impacts the roadmap. The biggest failure modes all come from collapsing boundaries too early: retaining too much sensitive data, promoting uncertain CV extraction into truth, letting stale memory harden into a fixed career narrative, and allowing multilingual or prompt behavior to drift without evaluation parity.

1. **Privacy debt disguised as personalization** — limit collection, separate raw uploads from structured facts, define retention per data class, and make delete or correct flows part of the foundation.
2. **Hallucinated candidate profiles from imperfect CV parsing** — split ingestion into parsing, extraction, confidence tagging, and user confirmation; never treat uncertain CV output as canonical.
3. **Prompt-scope drift into generic life coaching** — constrain the assistant to onboarding, profile clarification, job-search guidance, interview prep, and skill improvement with explicit redirect or refusal behavior.
4. **Multilingual drift creating three different products** — use one canonical domain schema, localize from schema values, and maintain EN, DE, and FR evaluation parity.
5. **Weak memory boundaries and stale retrieval** — use typed memory with provenance, timestamps, invalidation rules, and task-scoped retrieval rather than giant conversation summaries.

## Implications for Roadmap

Based on the combined research, the roadmap should be structured around the candidate profile as the backbone. The first phases should establish identity, localization, profile schema, privacy controls, and orchestration boundaries before any advanced coaching surface. CV ingestion belongs early because it is the main accelerator for onboarding, but it must ship with confirmation UX and provenance. Memory fidelity, readiness, and recommendation surfaces should come only after the canonical profile and multilingual state model are stable.

### Phase 1: Foundation, Identity, And Canonical Profile
**Rationale:** Everything else depends on having a durable user identity, a locale-safe profile schema, clear privacy boundaries, and a job-hunt-only assistant contract.
**Delivers:** Authenticated application shell, EN/DE/FR locale framework, canonical candidate profile model, consent and audit foundations, basic profile CRUD, and assistant guardrails.
**Addresses:** Account-tied candidate profile, multilingual onboarding baseline, role and preference capture, structured profile summary and editability, job-hunt-only chat boundaries.
**Avoids:** Privacy debt, multilingual schema drift, prompt-scope drift, and accessibility failures caused by treating chat as a toy instead of a process.

### Phase 2: CV Ingestion And Guided Onboarding
**Rationale:** CV-aware intake is the core user-value accelerator, but it must land on top of the profile foundation so extracted facts have somewhere safe to go.
**Delivers:** Authenticated CV upload, async parsing pipeline, structured extraction with confidence and provenance, guided conversational onboarding, skip-question flow, and review or confirmation UX.
**Uses:** UploadThing, Inngest, Zod, OpenAI structured extraction, object storage, and profile service write boundaries.
**Implements:** CV ingestion service, conversation orchestrator, and localization-aware onboarding UI.
**Addresses:** CV import, CV-aware follow-up questioning, guided onboarding, profile completion acceleration.
**Avoids:** Hallucinated profile facts, prompt injection from document text, synchronous latency traps, and multilingual extraction inconsistencies.

### Phase 3: Memory Fidelity, Editing, And Readiness
**Rationale:** Once onboarding and profile writes exist, the next risk is memory quality. This phase stabilizes what the system remembers, how users correct it, and how readiness is surfaced.
**Delivers:** Provenance-aware memory model, correction and invalidation flows, editable profile assumptions, candidate readiness summary, and initial recommendation or next-step projections.
**Uses:** PostgreSQL, pgvector, profile-memory API, audit trail tables, and projection workers.
**Implements:** Profile memory API and readiness service over canonical profile data.
**Addresses:** Structured profile editability, candidate readiness summary, profile memory fidelity with confidence markers, adaptive skip-and-return foundations.
**Avoids:** Bad personalization lock-in, stale retrieval, contradictory follow-up questions, and opaque AI auto-edits.

### Phase 4: Interview Prep And Skill-Gap Guidance
**Rationale:** These are in-scope launch value multipliers, but they should consume the stabilized canonical profile rather than shape it.
**Delivers:** Role-grounded interview question generation, answer coaching, skill-gap guidance, prioritized next actions, and certainty-labeled guidance outputs.
**Uses:** AI orchestration layer, curated guidance content, profile projections, and localized content catalogs.
**Implements:** Recommendation and readiness service extensions for interview prep and skill development guidance.
**Addresses:** Interview prep tailored to target role, skill-gap and next-step guidance, profile-grounded coaching.
**Avoids:** Overconfident pseudo-expertise, generic advice reuse, and off-domain assistant drift.

### Phase 5: Post-MVP Execution Surfaces
**Rationale:** Only after the profile-quality and guidance loop proves value should the product widen into execution tooling.
**Delivers:** Lightweight saved opportunities or next-actions list first; any job-tracking or application automation remains explicitly deferred pending validation.
**Addresses:** Optional execution support without diluting the candidate-profile core.
**Avoids:** Premature CRM sprawl, autonomous application risk, and employment-decisioning creep.

### Phase Ordering Rationale

- Identity, locale, privacy, and profile schema come first because every later feature depends on durable, correct, and governable candidate state.
- CV ingestion follows the foundation because extraction quality is only useful when its output can be reviewed, confirmed, and persisted safely.
- Memory and readiness come before richer coaching because the same canonical profile should power all downstream surfaces.
- Interview prep and skill guidance should consume structured profile projections, not raw chat transcripts, to stay testable, localized, and explainable.
- Job tracking and automation stay out of the core roadmap until onboarding quality and trust are validated.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** CV ingestion and extraction quality across multilingual Swiss CV formats, OCR fallback thresholds, and evidence-span UX need implementation-specific research.
- **Phase 3:** Memory invalidation, provenance UX, and retrieval-scoping need careful planning because they directly affect trust and privacy.
- **Phase 4:** Interview and skill-gap guidance should research grounding sources and evaluation design for Swiss-market relevance and certainty labeling.

Phases with standard patterns (skip research-phase):
- **Phase 1:** Auth, App Router setup, Prisma schema foundations, managed Postgres, next-intl, and audit logging all have well-documented standard patterns.
- **Phase 5:** Lightweight next-actions surfaces are straightforward if kept intentionally narrow and advisory.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Based mostly on official product documentation and mature ecosystem defaults; strong agreement across sources. |
| Features | MEDIUM | Competitor and product-pattern research is directionally clear, but launch priorities still need user validation. |
| Architecture | MEDIUM | Patterns are strong and well-supported, but some boundaries remain inferred from best practice rather than product-specific implementation evidence. |
| Pitfalls | MEDIUM | Risks are credible and well-framed by established guidance, but several mitigation details need project-specific validation during planning. |

**Overall confidence:** MEDIUM

### Gaps to Address

- **Swiss-market grounding sources:** Interview prep and skill guidance should validate whether curated local labor-market content is needed or whether profile-grounded generic guidance is sufficient for v1.
- **CV parsing quality thresholds:** The team still needs concrete acceptance criteria for OCR fallback, unsupported layouts, and when to force manual confirmation.
- **Locale-specific domain taxonomy:** Contract types, work-rate labels, diploma naming, and canton or location semantics need a canonical mapping before implementation drifts by language.
- **Fairness and evaluation design:** The roadmap should explicitly add multilingual and profile-variant eval sets for extraction quality, question quality, and recommendation parity.
- **Accessibility test strategy:** Conversational onboarding needs a concrete keyboard, screen-reader, and status-message verification plan, not just design intent.

## Sources

### Primary (HIGH confidence)
- Next.js docs and App Router internationalization guidance — framework direction, routing, and server-first multilingual patterns.
- next-intl docs — locale routing, typed messages, and App Router integration.
- Prisma ORM docs and pgvector docs — schema, migration, and vector-storage guidance.
- OpenAI Responses API docs and Vercel AI SDK docs — structured outputs, tool use, and provider abstraction.
- UploadThing docs, Inngest docs, and Sentry Next.js docs — upload boundaries, async job orchestration, and observability patterns.

### Secondary (MEDIUM confidence)
- Microsoft Learn secure multitenant RAG guidance, AWS Generative AI Lens, Google Rules of Machine Learning, and RFC 5646 — architecture and boundary-setting patterns.
- ICO guidance, NIST AI RMF, OWASP GenAI guidance, WCAG 2.2, Anthropic agent guidance, and EU AI Act overview — privacy, security, safety, accessibility, and governance pitfalls.
- Competitor product research across Teal, Huntr, Jobscan, and Kickresume — table stakes, differentiators, and anti-feature signals.

### Tertiary (LOW confidence)
- Current project brief in PROJECT.md — authoritative for scope intent, but still pre-validation and likely to evolve quickly once implementation and user learning begin.

---
*Research completed: 2026-07-08*
*Ready for roadmap: yes*
