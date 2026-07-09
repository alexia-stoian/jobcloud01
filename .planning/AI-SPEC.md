# AI-SPEC — Phase 2: CV-Aware Guided Onboarding

## 1b. Domain Context

> Researched by `gsd-domain-researcher`. Grounds the evaluation strategy in domain expert knowledge.

**Industry Vertical:** Job search / career guidance

**User Population:** Switzerland-based job seekers using EN/DE/FR onboarding to turn a CV into a structured candidate profile

**Stakes Level:** High

**Output Consequence:** AI follow-up questions and extracted CV facts shape the candidate profile, which affects what roles users pursue, what constraints they disclose, and what guidance they trust later; unconfirmed assumptions can misrepresent eligibility or readiness.

### What Domain Experts Evaluate Against

Dimension: CV fact handling
Good (domain expert would accept): Extracts work history, education, languages, skills, and qualifications as candidate suggestions, clearly marking uncertainty and asking the user to confirm before storing as fact.
Bad (domain expert would flag): Turns partial CV text into definitive profile data, merges similar roles or dates without warning, or silently drops relevant experience.
Stakes: High
Source: Practitioner expectation for resume parsing and profile-building workflows

Dimension: Follow-up question relevance
Good (domain expert would accept): Asks only job-search-relevant questions tied to the target role and CV gaps, such as permit status, certifications, availability, or working conditions when they matter.
Bad (domain expert would flag): Drifts into generic chat, asks redundant questions already answered in the CV, or probes unrelated personal topics.
Stakes: High
Source: Product scope and job-seeker onboarding practice

Dimension: Ambiguity escalation
Good (domain expert would accept): Flags unclear dates, titles, permits, languages, or qualifications and resolves them with a short clarification prompt or skip option.
Bad (domain expert would flag): Hides ambiguity, over-interprets incomplete fields, or blocks onboarding because one item is unclear.
Stakes: High
Source: Candidate-profile quality control practice

Dimension: Multilingual consistency
Good (domain expert would accept): EN/DE/FR wording preserves the same meaning, field labels, and confirmation status across languages.
Bad (domain expert would flag): Changes the meaning of profile fields or questions between languages, causing mismatched answers or inconsistent stored data.
Stakes: High
Source: Switzerland-first multilingual product requirement

Dimension: Confirmation before commit
Good (domain expert would accept): Shows what the system inferred, lets the user confirm or edit it, and never stores inferred values as final without review.
Bad (domain expert would flag): Treats model guesses as user facts, especially for permit status, salary expectations, location, or target role.
Stakes: Critical
Source: Trust and profile integrity requirement

### Known Failure Modes in This Domain

- Resume parsing overstates confidence on dates, titles, seniority, or language fluency, creating a profile that looks complete but is wrong.
- The assistant asks employer-style questions that are not relevant to the target role or repeats information already present in the CV, increasing abandonment.
- Ambiguous CV fragments such as short project entries, mixed-language resumes, or missing employment gaps are treated as final facts instead of clarification prompts.
- EN/DE/FR translation drift changes the semantics of eligibility, qualification, or work-authorization questions.

### Regulatory / Compliance Context

- Swiss data protection law and general privacy obligations apply to CV and profile processing, including data minimization, purpose limitation, and user-facing transparency.
- EU AI Act context is relevant if recruitment or employment-selection functionality expands later; this phase should avoid crossing into automated hiring decisions or ranking.
- Work permit and eligibility questions must be handled carefully because they affect lawful work access and can expose sensitive employment constraints.

### Domain Expert Roles for Evaluation

| Role | Responsibility in Eval |
|------|----------------------|
| Senior recruiter or talent acquisition specialist | Judge whether follow-up questions are role-relevant and realistic |
| Career coach or job-search advisor | Calibrate what a good candidate profile should surface and how much clarification is enough |
| Multilingual reviewer (EN/DE/FR) | Check meaning parity, tone, and field-label consistency across languages |
| Privacy or compliance reviewer | Review handling of CV data, consent language, and over-collection risks |

### Research Sources
- `.planning/PROJECT.md`
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/phases/01-account-language-and-candidate-profile-foundation/01-CONTEXT.md`
- `.planning/phases/01-account-language-and-candidate-profile-foundation/01-PLAN.md`
- `.claude/gsd-core/references/ai-evals.md`