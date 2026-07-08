# Stack Research

**Domain:** multilingual AI-assisted job-search web application
**Researched:** 2026-07-08
**Confidence:** MEDIUM

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 16.2.10 | Full-stack web app framework | This is the standard TypeScript choice for a greenfield product that needs marketing pages, authenticated app flows, server-rendered onboarding, file upload endpoints, and AI routes in one codebase. App Router is the current default path in official docs, and it fits multilingual routing, server actions, streaming UI, and secure server-side handling of CV/profile data. |
| React | 19.2.7 | UI runtime | Next.js App Router is built around modern React server and client boundaries. For a conversational onboarding app, React 19 gives the current framework-aligned model rather than forcing older client-heavy patterns. |
| TypeScript | 6.0.3 | End-to-end type safety | This product has many structured boundaries: auth claims, parsed CV fields, multilingual message catalogs, profile schemas, tool-call payloads, and admin actions. TypeScript remains the default way to keep those contracts from drifting. |
| PostgreSQL | 17 or 18 managed | Primary transactional database | This app is profile-centric, not feed-centric. Postgres is the right default because it handles accounts, profiles, CV metadata, AI memory records, audit trails, admin tables, and future recommendation state in one durable system with strong queryability and compliance-friendly operations. Prefer a managed provider with automated backups, PITR, read replicas, and pgvector support. |
| Prisma ORM | 7.8.0 | Database schema, migrations, type-safe data access | Prisma remains the most pragmatic TypeScript ORM for a greenfield product team that wants clear schema ownership and fast iteration. Prisma 7's adapter model makes the direct-connection story explicit instead of hiding infra details. Use it for the operational data model, not for abstracting away every performance concern. |
| pgvector | 0.8.4 on Postgres | Semantic memory and retrieval | Candidate profiling needs lightweight semantic retrieval for prior answers, CV fragments, and future recommendation features. pgvector is the standard "keep vectors with your app data" choice until scale clearly justifies a separate vector store. It supports exact and approximate search plus hybrid search with Postgres text search. |
| Auth.js | next-auth 4.24.14 + @auth/prisma-adapter 2.11.2 | Authentication and sessions | For this product, first-party control over user accounts and profile data matters more than fastest possible auth UI setup. Auth.js is the conservative default when you want app-owned auth flows, database-backed sessions, and minimal vendor lock-in inside a Next.js stack. |
| Vercel AI SDK | ai 7.0.17 + @ai-sdk/openai 4.0.8 | AI orchestration layer in the app | AI SDK 7 is the standard TypeScript abstraction for chat streaming, structured outputs, tool use, and provider portability. It lets the app start with OpenAI while keeping the option to swap providers later without rewriting the UI and transport layers. |
| OpenAI API | openai 6.45.0 via Responses API | Primary LLM provider for chat and profile completion | For new projects, OpenAI explicitly recommends the Responses API over Chat Completions. It is the right default for multi-turn AI guidance, structured profile extraction, tool calling, and future agent-like workflows. Use `store: false` by default for privacy-sensitive flows unless there is a deliberate reason to persist provider-side state. |
| next-intl | 4.13.1 | App internationalization | For EN/DE/FR, next-intl is the strongest Next.js-native choice because it fits App Router, ICU messages, locale-aware formatting, and typed message keys. That matters for multilingual onboarding prompts, salary/location formatting, and admin copy consistency. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | 4.4.3 | Validation for profile schemas, upload input, AI structured outputs | Use for every boundary where the browser, AI, upload route, or admin tooling can send malformed data. Especially important for CV-derived profile fields and tool-call arguments. |
| uploadthing | 7.7.4 | Resume/CV upload pipeline | Use for authenticated CV uploads in Next.js when you want typed file routes, server-side auth checks, size/type limits, and predictable callbacks. Create a dedicated `resume` route limited to PDF and optionally DOCX MIME types, and persist metadata in Postgres after upload. |
| @uploadthing/react | 7.3.3 | React upload components | Use only for the upload UX. Keep all sensitive parsing, normalization, and persistence on the server side after upload completion. |
| @prisma/adapter-pg | 7.8.0 | Prisma 7 PostgreSQL driver adapter | Required for direct Prisma 7 PostgreSQL connections. Use this rather than older Prisma connection patterns. |
| openai | 6.45.0 | Provider SDK for Responses API | Use server-side for model calls, embeddings, and structured generation where AI SDK provider integration alone is not enough. |
| Inngest | 4.11.0 | Background jobs and future workflows | Use for non-request-path work: CV parsing, embedding generation, profile enrichment, reminder emails, future job recommendation refreshes, and reprocessing after taxonomy changes. Durable steps and retries are a better fit than ad hoc cron scripts. |
| @sentry/nextjs | 10.64.0 | Error monitoring and tracing | Use from day one because AI apps fail at multiple layers: uploads, parsing, provider calls, queue execution, and locale-specific UX. Capture both request errors and background-job failures. |
| pino | 10.3.1 | Structured server logging | Use for application logs that need correlation IDs, user IDs, job IDs, and redactable fields. Do not rely on console logging once CV ingestion and AI calls are in play. |
| posthog-js | 1.398.4 | Product analytics | Use only for product analytics events such as onboarding completion, profile completeness, locale selection, and chat drop-off. Disable capture of raw CV content, free-text chat content, or sensitive PII. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| pnpm | Fast, workspace-friendly package management | Preferred for deterministic installs and a cleaner monorepo path if the product later splits into app plus workers. |
| ESLint + Next.js config | Static analysis | Keep strict rules around server/client boundaries, no accidental secret leakage into client bundles, and no untyped AI payloads. |
| Prisma Migrate + Prisma Studio | Schema changes and operational debugging | Use Migrate for all schema evolution. Use Studio for local inspection, not as an admin console replacement. |
| Playwright | End-to-end verification | Required for multilingual onboarding, auth, upload, and AI conversation regression checks. Unit tests alone will miss route, locale, and streaming breakage. |
| Vitest | Fast unit/integration tests | Use for schema validation, prompt contract tests, CV normalization helpers, and permission logic. |

## Installation

```bash
# Core
pnpm add next@16.2.10 react@19.2.7 react-dom@19.2.7 typescript@6.0.3 next-intl@4.13.1

# Data, auth, AI, uploads, ops
pnpm add next-auth@4.24.14 @auth/prisma-adapter@2.11.2 prisma@7.8.0 @prisma/client@7.8.0 @prisma/adapter-pg@7.8.0 zod@4.4.3 ai@7.0.17 @ai-sdk/openai@4.0.8 openai@6.45.0 uploadthing@7.7.4 @uploadthing/react@7.3.3 inngest@4.11.0 @sentry/nextjs@10.64.0 pino@10.3.1 posthog-js@1.398.4

# Dev dependencies
pnpm add -D eslint @types/node @types/react @types/react-dom vitest playwright pino-pretty@13.1.3
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Next.js 16 App Router | Nuxt 4 | Use Nuxt only if the team is already deeply Vue-first. For a greenfield TypeScript AI web product, Next.js has the stronger default gravity across auth, AI SDK examples, App Router patterns, and hiring ecosystem. |
| Auth.js | Clerk | Use Clerk if the team wants fastest time-to-market for polished auth and user management and accepts stronger vendor dependency. It is a good product, but for this app I would not outsource the user identity core unless speed dominates control. |
| Auth.js | Better Auth | Use Better Auth if the team explicitly wants a newer in-app auth framework with richer built-in enterprise/security surface and is comfortable adopting a faster-moving auth platform. For a conservative v1, Auth.js is the steadier default. |
| PostgreSQL + pgvector | Separate vector DB from day one | Use a dedicated vector database only if retrieval scale, multi-tenant ranking complexity, or recall/latency requirements materially exceed what Postgres can handle. That is unlikely at v1 for a candidate-profile product. |
| Inngest | Trigger.dev | Use Trigger.dev when the team strongly prefers job-centric execution with its developer experience and hosted workflow model. Inngest gets the recommendation here because evented, retriable, multi-step functions map very cleanly to CV processing and future recommendation refresh flows. |
| OpenAI via AI SDK | Azure OpenAI via AI SDK | Use Azure OpenAI when procurement, EU residency controls, or enterprise networking requirements are stronger than the convenience of direct OpenAI usage. Keep AI SDK as the abstraction either way. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Pages Router for a new build | It leaves performance, server-component ergonomics, and current framework guidance on the table. Starting new on the old routing model creates migration debt with no upside here. | Next.js App Router |
| Firebase or Firestore as the primary system of record | This product needs relational profile data, auditability, mature SQL querying, and future recommendation workflows that join multiple structured entities. Firestore becomes awkward fast for hiring-profile domain models. | PostgreSQL + Prisma |
| A separate vector database in v1 | It adds operational burden, consistency problems, and more privacy surface area before you know semantic retrieval is a bottleneck. | PostgreSQL + pgvector |
| LangChain as the default application layer | It is useful in some agent-heavy systems, but for this product it adds abstraction weight too early. Most required flows are structured extraction, memory retrieval, and constrained tool use, which AI SDK plus direct provider APIs handle well. | Vercel AI SDK + direct provider SDKs |
| Provider-side long-term memory as the source of truth | Candidate profile state must be inspectable, editable, and privacy-governed by the app. Remote opaque memory makes compliance and debugging worse. | App-owned profile memory in Postgres |
| Parsing CVs only with raw LLM prompting | Raw prompting alone is too brittle for employment data extraction. You need deterministic file handling, schema validation, and reviewable normalization layers. | Upload pipeline + text extraction + Zod-validated structured AI extraction |

## Stack Patterns by Variant

**If privacy and residency risk are the top concern from day one:**
- Keep the application stack the same, but choose a managed Postgres provider in Switzerland or the EU and prefer Azure OpenAI through the same AI SDK abstraction.
- Because the architectural shape does not need to change; only the provider and data-governance choices do.

**If the first milestone is profile-building and guidance only:**
- Keep retrieval simple: Postgres tables for profile facts plus pgvector only for conversational memory and CV segment similarity.
- Because introducing recommendation pipelines, ranking services, or external search infra before validated usage is premature.

**If future job recommendations become a major product line:**
- Add a separate ingestion workflow for job feeds, embedding jobs, ranking experiments, and offline eval tables, but keep user/profile state in the primary Postgres database.
- Because recommendation workflows expand compute and experimentation needs, but they should not force a rewrite of identity and profile persistence.

**If enterprise customers become a near-term requirement:**
- Re-evaluate auth toward Better Auth enterprise features or Clerk enterprise plans, and formalize audit logs, RBAC, SIEM export, and admin approval flows.
- Because B2C-friendly auth defaults are not enough once SSO, SCIM, and compliance evidence become sales blockers.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| next@16.2.10 | react@19.2.7 | Current official Next.js docs surface 16.2.10 and App Router behavior aligned to React 19-era features. |
| prisma@7.8.0 | @prisma/client@7.8.0 and @prisma/adapter-pg@7.8.0 | Keep these versions aligned. Prisma 7 direct Postgres connections require a driver adapter. |
| ai@7.0.17 | @ai-sdk/openai@4.0.8 | Keep provider package aligned with AI SDK major version to avoid transport and streaming mismatches. |
| next-auth@4.24.14 | @auth/prisma-adapter@2.11.2 | Stable database-backed auth combination for a Next.js app using Prisma. |
| uploadthing@7.7.4 | @uploadthing/react@7.3.3 | File route features and React helpers should stay within the same current generation. |

## Recommended Service Posture

For this specific product, the standard 2026 deployment posture is:

1. Next.js app on Vercel or a comparable Node-capable platform.
2. Managed PostgreSQL with pgvector, PITR, and encrypted backups.
3. Object storage for uploaded CV files, with server-side MIME/size constraints and malware scanning before downstream processing.
4. Inngest for background processing.
5. Sentry for monitoring and tracing.
6. App-owned memory and profile persistence in Postgres.

That is the right default because it keeps the first product version simple: one web app, one transactional database, one background workflow system, one observability layer, and an AI abstraction that can switch providers later.

## Privacy and Admin/Ops Guidance

- Treat CVs, chat transcripts, skill gaps, and inferred preferences as sensitive employment data.
- Persist normalized profile facts separately from raw chat transcripts so admins can inspect and correct the durable profile without reading every conversation.
- Default OpenAI requests to `store: false` unless legal and product owners explicitly approve stateful provider-side storage for a flow.
- Add PII redaction to logs from day one. Logs should contain IDs and categories, not CV paragraphs.
- Keep an admin audit table in Postgres for profile edits, AI override actions, locale changes, and support interventions.
- Plan for explicit consent copy around CV upload, AI profiling, and recommendation use before launch.

## Sources

- Next.js docs - https://nextjs.org/docs - official App Router guidance, internationalization guidance, current docs version 16.2.10. Confidence: HIGH for framework direction.
- Next.js internationalization guide - https://nextjs.org/docs/app/guides/internationalization - official locale routing patterns and server-first localization examples. Confidence: HIGH.
- next-intl docs - https://next-intl.dev/ - App Router-friendly i18n, ICU messages, typed keys, locale routing support. Confidence: HIGH.
- Prisma ORM docs - https://www.prisma.io/docs/orm - Prisma 7 guidance, driver adapter requirement, schema and migration workflow. Confidence: HIGH.
- pgvector docs - https://github.com/pgvector/pgvector - vector storage, HNSW/IVFFlat, hybrid search, supported Postgres versions. Confidence: HIGH.
- Auth.js docs - https://authjs.dev/ and https://authjs.dev/security - production usage and support posture; note that some `@auth/*` packages outside adapters are still marked as under development. Confidence: MEDIUM.
- Better Auth site - https://better-auth.com/ - current positioning and enterprise/security/auth feature breadth. Confidence: MEDIUM.
- Clerk docs - https://clerk.com/docs - strong managed-auth alternative with user management and security/compliance surface. Confidence: MEDIUM.
- AI SDK docs - https://ai-sdk.dev/docs/introduction - AI SDK 7 positioning for TypeScript AI apps, provider abstraction, UI/chat support. Confidence: HIGH.
- OpenAI Responses migration guide - https://developers.openai.com/api/docs/guides/migrate-to-responses - Responses recommended for new projects, state handling, structured outputs, streaming, and tool calling. Confidence: HIGH.
- UploadThing docs - https://docs.uploadthing.com/ and https://docs.uploadthing.com/file-routes - typed upload routes, input validation, auth middleware, file-type and size constraints. Confidence: HIGH.
- Inngest docs - https://www.inngest.com/docs/features/inngest-functions - durable, retriable, event-driven TypeScript workflows for background processing. Confidence: HIGH.
- Sentry Next.js docs - https://docs.sentry.io/platforms/javascript/guides/nextjs/ - current setup and runtime coverage for Next.js apps. Confidence: HIGH.

---
*Stack research for: multilingual AI-assisted job-search web application*
*Researched: 2026-07-08*
