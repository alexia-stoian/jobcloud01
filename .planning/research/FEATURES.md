# Feature Research

**Domain:** multilingual AI-assisted job-search app for candidate onboarding, CV-aware profiling, and coaching
**Researched:** 2026-07-08
**Confidence:** MEDIUM

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Account-tied candidate profile | Users expect their profile, preferences, and progress to persist across sessions and devices | MEDIUM | Must persist structured candidate facts, preferences, goals, and conversation-derived fields under one identity |
| CV import with structured extraction | AI job-search tools commonly begin from an uploaded resume or LinkedIn-style profile import | MEDIUM | Needs reliable parsing into experience, skills, education, languages, location, and gaps/uncertainties for follow-up |
| Guided onboarding with skip-question flow | Users expect to get started quickly without being forced through every field before seeing value | MEDIUM | Skips must be explicit, reversible, and tracked as “unknown” rather than silently defaulted |
| Multilingual onboarding and chat | Switzerland-first scope makes EN/DE/FR support part of the product promise, not a later add-on | HIGH | Language choice must affect prompts, labels, summaries, and stored display text without corrupting normalized profile fields |
| Role, location, and work-preference capture | Candidates expect to specify target role, location, contract type, work rate, salary context, and work authorization constraints | LOW | Core search intent inputs; should accept both direct entry and AI-inferred drafts for confirmation |
| CV-aware follow-up questioning | Strong products do not stop at resume parsing; they use missing or ambiguous resume details to drive the next questions | HIGH | The system should ask for achievements, seniority, domain focus, employment objective, and constraints only where the profile is incomplete |
| Job-hunt-only AI chat | Users expect conversational help, but trust falls if the assistant drifts into generic life coaching or unrelated tasks | MEDIUM | Requires clear system boundaries, allowed topics, refusal behavior, and routing back to job-search goals |
| Structured profile summary and editability | Users need to see what the AI believes about them and correct it | MEDIUM | A durable, editable candidate profile is the control surface that keeps AI memory trustworthy |
| Interview prep tailored to target role | Interview practice is now a common adjacent feature in strong job-search products | MEDIUM | v1 should focus on role-specific question generation and answer coaching, not full video analytics |
| Skill-gap and next-step guidance | Users increasingly expect the tool to tell them what to improve, not only what to apply to | MEDIUM | Guidance should connect missing skills to realistic next actions, not generic inspirational advice |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Profile memory fidelity with confidence markers | Makes the assistant feel reliable because remembered facts are explicit, traceable, and correctable | HIGH | Store each fact with source, confidence, last-confirmed state, and contradiction handling rather than flattening everything into a blob |
| Adaptive skip-and-return onboarding | Reduces friction by letting users skip weak or sensitive questions while the AI intelligently revisits them only when needed | HIGH | Strong differentiator for conversion because it preserves momentum without sacrificing profile completeness |
| On-role conversational guardrails | A narrowly scoped job-hunt copilot feels safer and more useful than a general chatbot | MEDIUM | The assistant should redirect off-topic requests and explain what it can do: profile building, interview prep, job targeting, and skill improvement |
| CV-to-profile reconciliation loop | Converts messy resume text plus chat answers into a cleaner hiring-ready profile with explicit confirmations | HIGH | Differentiates from simple resume analyzers by treating AI extraction as a draft that gets refined through dialogue |
| Skill improvement guidance tied to target role | Moves from “you are missing X” to “here is the shortest path to become credible for Y role” | MEDIUM | Best if guidance is role-relative, prioritized, and separated into immediate, short-term, and longer-term actions |
| Interview prep grounded in the candidate profile | Produces more realistic questions and better coaching because it uses the user’s actual background, target role, and weak spots | MEDIUM | More valuable than generic interview question lists; should reference the candidate’s own examples and likely follow-ups |
| Candidate readiness summary | Gives the user a concise picture of profile completeness, interview readiness, and top blockers to action | MEDIUM | Useful as a home screen artifact after onboarding and after every major profile update |
| Multilingual profile normalization | Lets the user converse in EN/DE/FR while the system keeps one canonical structured profile underneath | HIGH | Important for memory fidelity and searchability across localized phrasing, diploma names, and skill synonyms |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Fully autonomous job applications | Sounds like the fastest way to apply at scale | Poor fit for trust-building v1, high risk of low-quality submissions, and depends on job-board automation that distracts from profile quality | Provide candidate-ready materials and guided next steps; defer automation until profile quality is validated |
| Broad general-purpose chatbot behavior | Users may try to use the assistant for unrelated personal or productivity tasks | Causes prompt drift, weaker profile quality, and blurred product identity | Keep the assistant constrained to job-search, candidate profiling, interview prep, and skill guidance |
| Large job-tracker CRM in v1 | Competitors offer it, so it is easy to assume it is mandatory | Adds a parallel product surface with workflows, reminders, browser extensions, and pipeline state that dilute onboarding/profile quality work | Keep a lightweight target-role and next-step model first; add full tracking only after core coaching value is proven |
| Full video interview analytics | Feels advanced and impressive on demos | High implementation and privacy complexity for uncertain v1 value | Start with text-based mock interviews, answer critique, and optional transcript review |
| Employer/recruiter marketplace features | Can look like a natural business expansion | Conflicts with the job-seeker-first scope and introduces two-sided marketplace complexity | Stay candidate-only in v1 |
| Opaque AI auto-edits to profile data | Seems convenient because the AI “just fixes everything” | Damages trust when users cannot see what changed or why; dangerous for CV facts and qualifications | Require visible summaries, confirmations, and edit history for material profile changes |
| Pseudo-psychometric scoring or destiny-style career matching | Marketable on landing pages | Often low-signal, hard to justify, and risky for user trust if recommendations feel arbitrary | Base guidance on explicit goals, CV evidence, transferable skills, and confirmed constraints |

## Feature Dependencies

```
[Account-tied candidate profile]
    └──requires──> [Structured profile summary and editability]
                           └──requires──> [CV import with structured extraction]
                                                   └──enhances──> [CV-aware follow-up questioning]
                                                                           └──enables──> [CV-to-profile reconciliation loop]
                                                                                           └──enables──> [Profile memory fidelity with confidence markers]

[Multilingual onboarding and chat]
    └──requires──> [Multilingual profile normalization]
                           └──enhances──> [Profile memory fidelity with confidence markers]

[Guided onboarding with skip-question flow]
    └──enhances──> [Adaptive skip-and-return onboarding]
                           └──enhances──> [Candidate readiness summary]

[Role, location, and work-preference capture]
    └──enables──> [Skill improvement guidance tied to target role]
    └──enables──> [Interview prep tailored to target role]

[Job-hunt-only AI chat]
    └──requires──> [On-role conversational guardrails]

[Structured profile summary and editability]
    └──enables──> [Candidate readiness summary]

[Large job-tracker CRM in v1] ──conflicts──> [Focused onboarding/profile-quality MVP]
[Fully autonomous job applications] ──conflicts──> [Trust-first candidate copilot positioning]
[Opaque AI auto-edits to profile data] ──conflicts──> [Profile memory fidelity with confidence markers]
```

### Dependency Notes

- **CV import with structured extraction requires structured profile summary and editability:** extraction quality will never be perfect, so users need a visible place to confirm and correct parsed facts.
- **CV-aware follow-up questioning depends on extracted and normalized profile data:** without a first-pass profile, follow-up questions become generic and repetitive.
- **Profile memory fidelity depends on the reconciliation loop:** memory quality comes from explicit confirmation, contradiction handling, and source tracking, not from raw chat history alone.
- **Multilingual onboarding depends on multilingual profile normalization:** storing only localized free text will fragment memory and make downstream guidance inconsistent.
- **Adaptive skip-and-return depends on onboarding state tracking:** the system must remember what was skipped, why it matters, and when to ask again.
- **Interview prep and skill guidance depend on target-role capture:** both features are weak if the system does not know the user’s intended role, seniority, and constraints.
- **On-role conversational guardrails are required for chat quality:** role drift undermines trust and makes profile collection less reliable.
- **Large job-tracker CRM conflicts with a focused MVP:** it pulls the roadmap toward browser extension, pipeline management, and reminder systems instead of candidate profiling depth.
- **Opaque AI profile edits conflict with memory fidelity:** silent mutation of profile facts is the fastest way to make users distrust the assistant.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] Account-tied candidate profile — essential for durable memory and reuse across sessions
- [ ] CV import with structured extraction — essential to make onboarding faster and more personalized from the first interaction
- [ ] Guided onboarding with skip-question flow — essential to reduce drop-off while still collecting enough signal
- [ ] Multilingual onboarding and chat — essential because EN/DE/FR is part of the initial market promise
- [ ] Role, location, and work-preference capture — essential to ground job-hunt guidance in real constraints
- [ ] CV-aware follow-up questioning — essential to avoid generic forms and deliver the product’s core value
- [ ] Job-hunt-only AI chat with guardrails — essential to keep the assistant useful and trustworthy
- [ ] Structured profile summary and editability — essential for user trust and correction of AI mistakes
- [ ] Interview prep tailored to target role — essential because it is in current project scope and reuses collected profile data well
- [ ] Skill-gap and next-step guidance — essential because users need actionable direction, not only a stored profile
- [ ] Candidate readiness summary — essential as the v1 payoff artifact showing what is complete and what still blocks progress

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] Profile memory fidelity with confidence markers — add once the base profile schema and reconciliation loop are stable enough to expose confidence cleanly
- [ ] Adaptive skip-and-return onboarding — add once baseline onboarding analytics show where users abandon or defer questions
- [ ] Skill improvement guidance tied to curated resources — add once guidance quality is validated and content partnerships or resource curation are ready
- [ ] Mock interview session history and progress trends — add once users demonstrate repeat interview-prep usage
- [ ] Lightweight saved opportunities or next-actions list — add if users need more execution support without expanding to full job-tracker CRM

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Full job application tracker with browser extension — defer because it is a separate operational surface with significant scope weight
- [ ] Autofill or auto-apply workflows — defer until profile quality, trust, and application quality safeguards are proven
- [ ] Full cover-letter and resume tailoring studio — defer until the candidate-profile core clearly wins user retention
- [ ] Career-path explorer with salary mapping — defer because it broadens the product from job-hunt copilot to long-horizon career planning
- [ ] Video interview analytics and body-language scoring — defer due to privacy, UX, and implementation complexity

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Account-tied candidate profile | HIGH | MEDIUM | P1 |
| CV import with structured extraction | HIGH | MEDIUM | P1 |
| Guided onboarding with skip-question flow | HIGH | MEDIUM | P1 |
| Multilingual onboarding and chat | HIGH | HIGH | P1 |
| Role, location, and work-preference capture | HIGH | LOW | P1 |
| CV-aware follow-up questioning | HIGH | HIGH | P1 |
| Job-hunt-only AI chat with guardrails | HIGH | MEDIUM | P1 |
| Structured profile summary and editability | HIGH | MEDIUM | P1 |
| Interview prep tailored to target role | HIGH | MEDIUM | P1 |
| Skill-gap and next-step guidance | HIGH | MEDIUM | P1 |
| Candidate readiness summary | MEDIUM | MEDIUM | P1 |
| Profile memory fidelity with confidence markers | HIGH | HIGH | P2 |
| Adaptive skip-and-return onboarding | MEDIUM | HIGH | P2 |
| Lightweight saved opportunities or next-actions list | MEDIUM | MEDIUM | P2 |
| Full job tracker CRM | MEDIUM | HIGH | P3 |
| Autofill or auto-apply workflows | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Competitor A | Competitor B | Our Approach |
|---------|--------------|--------------|--------------|
| Resume/CV import and tailoring | Teal emphasizes resume creation and role-specific tailoring from job descriptions | Jobscan emphasizes ATS match scoring, keyword coverage, and in-context resume optimization | Start from CV-aware profile extraction and follow-up questions instead of making document editing the center of the product |
| Job-search organization | Teal and Huntr both treat trackers as major surfaces | Jobscan also offers tracking, saved jobs, and pipeline state | Keep organization lightweight in v1; do not let tracker scope overtake candidate profiling |
| Interview prep | Teal offers AI mock interviews, role-specific questions, and progress review | Kickresume offers AI interview question generation tied to roles | Focus on profile-grounded question generation and coaching before richer media features |
| Skill-gap guidance | Kickresume positions career maps and coaching around missing skills and next steps | Jobscan and Teal are stronger on resume/job matching than on deep developmental coaching | Make role-relative skill improvement guidance a core differentiator tied to the user’s confirmed profile |
| AI control model | Jobscan highlights one-click accept/reject and preserved original content | Kickresume stresses resume-based personalization with editable outputs | Preserve user control by making profile summaries editable and major AI inferences confirmable |

## Sources

- Teal product pages: AI resume builder, job tracker, and AI interview practice
- Huntr product pages: job tracker, resume tailoring, resume review, and autofill positioning
- Jobscan product pages: AI Optimize, resume scanner, ATS matching, and job tracker
- Kickresume product pages: AI cover letter builder, AI career map, AI career coach, and AI interview tools
- Project context from `.planning/PROJECT.md`

---
*Feature research for: multilingual AI-assisted job-search app focused on candidate onboarding and coaching*
*Researched: 2026-07-08*