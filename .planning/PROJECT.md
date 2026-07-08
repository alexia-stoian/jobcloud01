# JobScout24 AI Job Copilot

## What This Is

This is a Switzerland-first job-seeker application that helps users create an account, build a structured professional profile, and move through a focused AI-guided job search flow. The app supports English, German, and French and adapts the full experience to the selected language. The core interaction is a job-hunt-only AI assistant that interprets CV data, asks tailored follow-up questions, remembers user preferences, and turns that information into an accurate candidate profile and practical next steps.

## Core Value

Help a job seeker turn their CV, preferences, and goals into a complete, accurate, actionable profile for finding the right next job.

## Business Context

- **Customer**: Job seekers in Switzerland looking for guided, personalized help with job search and career positioning
- **Revenue model**: Pending product decision; validate job-seeker value first
- **Success metric**: Users complete onboarding and receive a high-quality structured profile they can use for job hunting
- **Strategy notes**: Inspired by the existing JobScout24-style landing and onboarding references in the repo images

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Users can create an account, log in, and persist a profile tied to their identity.
- [ ] Users can switch the app language between English, German, and French, and the whole app reflects that language choice.
- [ ] Users can upload or provide CV information that the AI interprets and uses to personalize follow-up questions.
- [ ] Users can describe their current job situation and employment objective, including finding a job, changing career direction, or pursuing growth.
- [ ] Users can define role interests, preferred location, contract type or period, work rate, skills, diplomas, and qualifications.
- [ ] Users can skip selected questions without breaking the profile-building flow.
- [ ] The AI remembers, documents, and structures everything the user shares into a reusable candidate profile.
- [ ] The AI asks relevant employer-style questions that help produce a more complete hiring-ready profile.
- [ ] The AI stays constrained to the job-hunt domain and does not drift into unrelated assistant behavior.
- [ ] The app gives tailored next-step guidance based on the user's background and target roles.
- [ ] The AI can help the user prepare for interviews and suggest realistic ways to improve missing skills.

### Out of Scope

- Employer or recruiter workflow in v1 — the first release focuses on the job seeker side only.
- Broad Europe-first expansion — v1 should stay Switzerland-first to match language scope and UI direction.
- General-purpose AI assistant behavior — the assistant must stay focused on job search, profile building, and career guidance.
- Fully autonomous applications to jobs in v1 — first validate profile quality and guidance before automating applications.

## Context

- The existing reference UI in the repo images sets the visual direction: a JobScout24-style landing page plus a guided conversational onboarding flow.
- The product is intended to feel personalized from the beginning, not like a static form dump.
- CV-aware questioning is central: the assistant should adapt its questions based on the uploaded CV and the roles the user wants.
- The experience must support multilingual usage in English, German, and French across the full app.
- The generated profile must be durable: account-tied, reusable, and detailed enough to support recommendations, interview prep, and skill-gap guidance.
- The AI should capture both explicit preferences and inferred constraints from user answers without losing context during the onboarding journey.

## Constraints

- **Localization**: English, German, and French at launch — the full user experience must be translated consistently.
- **Product scope**: Job seeker workflow first — keeps v1 focused on profile quality and useful guidance.
- **AI behavior**: Job-hunt-only assistant — prevents prompt drift and preserves user trust.
- **Personalization**: CV-aware questioning — the onboarding flow must adapt to the user's actual background and target roles.
- **Data persistence**: Account-tied profile memory — user preferences, CV details, and goals must remain available across sessions.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Switzerland-first launch | Matches the reference UI, language set, and market framing already chosen | — Pending |
| Job seeker copilot before marketplace expansion | Reduces v1 scope and validates the highest-value assistant experience first | — Pending |
| Multilingual support in EN/DE/FR from the start | Language coverage is part of the core product promise for the initial market | — Pending |
| Conversational AI onboarding instead of static profile forms | Better fit for CV-aware, adaptive questioning and richer profile formation | — Pending |
| AI must stay narrowly focused on job hunting | Prevents role drift and keeps recommendations relevant and trustworthy | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-08 after initialization*