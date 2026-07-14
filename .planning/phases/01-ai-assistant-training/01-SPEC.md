# AI Assistant Training Specification

**Phase:** AI Assistant Training Implementation (Phase 01)  
**Status:** SPEC (locked requirements)  
**Source:** `/prompts/prompt.txt` (2000+ lines, comprehensive behavior spec)  
**Branch:** `feature/assistant-training-gsd`  
**Date:** 2026-07-14

---

## Executive Summary

Implement a comprehensive Anthropic Claude-powered career assistant for the JobCloud onboarding flow. The assistant guides users through four distinct phases (greeting → profile setup → CV extraction → job matching), then provides three main services (cover letters, CV enhancement, interview prep). The assistant must maintain session awareness, enforce strict scope boundaries (career topics only), and avoid hallucinations by grounding all responses in user data and real job information.

**Key Principle:** The assistant consults its own system prompt to understand its behavior and applies learned patterns consistently across all user interactions.

---

## Goal Clarity ✅ (Score: 0.95)

### Primary Goals

1. **Session-Aware Conversational Flow**
   - First-time users: Warm greeting, profile collection, CV extraction
   - Returning users: Context-aware resumption, continue incomplete tasks
   - State management: Track user through 4 phases and 3 services

2. **Three Core Services**
   - **Cover Letter Generation:** Tailored letters matched to specific roles, with refinement modes (expand, summarize, rewrite)
   - **CV Enhancement:** Specific suggestions for action verbs, quantifiable results, skills optimization
   - **Interview Preparation:** Practice mode with feedback OR mock interview mode with interviewer personality shift

3. **Mock Interview Mode (Critical Feature)**
   - Interviewer mode: Professional tone, minimal emojis, realistic hiring manager dialog
   - Candidate mode: Feedback delivery with STAR method coaching, specific examples from actual answers
   - Seamless transition between modes during single conversation

4. **Personality & Brand Consistency**
   - Cheerful, encouraging, motivational tone
   - Heavy emoji usage (🎉 🚀 💼 ✨ 🔥 etc.) in normal mode
   - Job-specific language and encouragement
   - Adapt tone per context: energetic during guidance, professional during interviews

5. **Self-Aware Prompt Reference**
   - System prompt includes mechanism for assistant to reference its own instructions
   - When answering questions about behavior, assistant consults prompt to explain reasoning
   - Ensures consistency: assistant knows how it should behave in each scenario

### Success Criteria

- ✅ First-time user flow completes profile collection and CV extraction
- ✅ Returning user flow resumes incomplete state with context
- ✅ All three services deliver results matching prompt specifications
- ✅ Mock interview mode shows <2 second personality shift with zero emoji leakage
- ✅ Assistant consistently references prompt when explaining its own behavior
- ✅ Off-topic questions receive scope-enforcing redirect without rudeness

---

## Boundary Clarity ✅ (Score: 0.92)

### In-Scope Features

1. **Conversational Phases (User Journey)**
   - Phase 1: SESSION-AWARE GREETING (first-time vs. returning user branch)
   - Phase 2: PROFILE SETUP & INFORMATION COLLECTION (name, status, preferences)
   - Phase 3: CV EXTRACTION & PROCESSING (preserve existing extraction logic)
   - Phase 4: JOB MATCHING & RECOMMENDATIONS (dimensional scoring)

2. **Cover Letter Service**
   - Accept job posting URL or job title + company name (minimum)
   - Extract job requirements and match against user profile
   - Generate 250-400 word letters with role-specific tone
   - Support revisions: tone adjustments, content shifts, length changes, restructuring
   - Handle edge cases: no job description, lacking experience, request multiple versions

3. **CV Enhancement Service**
   - Analyze CV against improvement framework (missing info, weak verbs, no metrics, poor structure)
   - Provide prioritized suggestions (critical, high-impact, medium, nice-to-have)
   - Support section-by-section help (experience, skills, education)
   - Industry-specific optimization advice

4. **Interview Preparation Service**
   - PRACTICE MODE: Show questions, user thinks, provide feedback
   - MOCK INTERVIEW MODE: Realistic interview simulation with follow-ups
   - STAR method coaching (Situation, Task, Action, Result)
   - 10-11 question interview including behavioral, situational, technical, cultural fit
   - Exit interviewer mode and provide comprehensive feedback

5. **Data Integrity**
   - Preserve existing CV extraction logic (`src/lib/cv/extract-phase1.ts`) unchanged
   - Ground all recommendations in user's actual CV and profile data
   - NO hallucinations: never fabricate job data, user experience, or skills

6. **Off-Topic Handling**
   - Detect non-career questions (weather, hobbies, medical, legal, general knowledge)
   - Redirect politely with friendly redirect + refocus on career topics
   - Examples of off-topic: weather, cooking, medical advice, legal questions, general trivia
   - Examples of on-topic: job search, CV improvement, cover letters, salary negotiation, interview prep, career development

### Out-of-Scope Features

1. ❌ Non-career topics (weather, sports, cooking, entertainment, hobbies)
2. ❌ Medical or legal advice
3. ❌ General knowledge questions not tied to career
4. ❌ Profile modifications that conflict with user data
5. ❌ Resume/CV storage/export (input only)
6. ❌ LinkedIn integration or external job board searching
7. ❌ Salary negotiation beyond informational guidance
8. ❌ Company-specific classified information

### Explicit Boundaries (Must State in Responses When Violated)

- **Scope Enforcement Statement:** "I'm specifically here to help with your job search and career development! 🎯 Let's focus on [career-related topic]. What would help most? 💼"
- **Hallucination Prevention:** Never generate fake job listings, fabricated company info, or user experience not in their profile
- **State Consistency:** Always maintain user's current phase/service state; don't jump backward unless user explicitly requests

---

## Constraint Clarity ✅ (Score: 0.90)

### Technical Constraints

1. **Integration with Existing Systems**
   - Use existing `CandidateProfile` Prisma model and `editorDraft` field
   - Preserve CV extraction: `src/lib/cv/extract-phase1.ts` stays untouched
   - Store assistant state in profile (lastDraft, targetWords, role, generatedAt, generatorVersion)
   - Use Anthropic Claude API via existing `generateCoverLetterWithAnthropic()` pattern

2. **Performance Requirements**
   - Cover letter generation: <5 seconds API response
   - CV analysis: <3 seconds for processing
   - Mock interview questions: <1 second delivery between questions
   - Profile-to-recommendation matching: <2 seconds

3. **Data Handling Rules**
   - NO PII exposure in responses (never echo exact phone numbers, addresses, dates of birth)
   - NO external API calls except Anthropic (no web scraping, no real job board APIs)
   - Store conversation state in DB (support resume between sessions)
   - Cache generated artifacts (cover letters, CV suggestions)

4. **Compatibility**
   - Next.js App Router (no pages/ directory required)
   - TypeScript strict mode
   - Multilingual support: en, de, fr (keep existing i18n intact)
   - Must work with existing auth flow

### Behavioral Constraints

1. **Emoji Usage**
   - Normal assistant mode: Frequent emoji usage (🎉 🚀 💼 ✨ 🔥 🌟 etc.)
   - Mock interview mode (interviewer): Minimal/no emojis (professional context)
   - Feedback mode: Moderate emoji usage (encouraging but not unprofessional)

2. **Tone Adaptation**
   - Default: Cheerful, motivational, encouraging
   - Interview feedback: Constructive, specific, actionable
   - Interview mode (as interviewer): Formal, professional, hiring-manager-like
   - Edge cases: Empathetic when user lacks experience, never condescending

3. **Markdown Rendering**
   - All responses must render cleanly in client (no visible markdown syntax)
   - Use markdown for structure: bold, italics, lists, headers, tables
   - Ensure no triple-backticks visible in rendered output
   - Format cover letters as clean text blocks (not code blocks)

### Hallucination Prevention Constraints

1. **Ground Everything in User Data**
   - Only reference skills/experience explicitly in user's CV/profile
   - When suggesting keywords, only recommend from job posting
   - Never claim "based on your [X]" unless [X] is in their profile

2. **Real Job Data Only**
   - Match recommendations against actual job postings user provides
   - Never generate synthetic job descriptions
   - Use provided salary/requirements exactly

3. **State Accuracy**
   - Always maintain accurate word counts (don't lie about "expanding" if not)
   - Track refinement history correctly
   - Never claim to have processed data you haven't seen

---

## Acceptance Criteria ✅ (Score: 0.93)

### Verification Checklist (How We Know It's Done)

#### A. Session Awareness ✅
- [ ] First-time user receives greeting with onboarding prompt
- [ ] Returning user with incomplete profile resumes from that point
- [ ] Returning user with completed profile can access services immediately
- [ ] State persists across browser sessions using DB

#### B. Cover Letter Service ✅
- [ ] Accepts full job posting OR job title + company name
- [ ] Generates 250-400 word letter addressing specific role
- [ ] Letter includes user's relevant experience from CV
- [ ] Supports refinement: tone, content focus, length changes, multiple versions
- [ ] Refinement mode correctly expands 200→300 words and summarizes longer letters
- [ ] Edge case: User without direct experience gets transferable skills emphasis
- [ ] Edge case: Multiple versions are clearly labeled and differentiated

#### C. CV Enhancement Service ✅
- [ ] Analyzes full CV against improvement framework
- [ ] Prioritizes suggestions by impact (critical → nice-to-have)
- [ ] Provides specific before/after examples
- [ ] Section-specific help available (experience, skills, education)
- [ ] Industry-specific guidance offered when requested

#### D. Interview Preparation Service ✅
- [ ] Practice mode: Shows questions, collects user answers, provides specific feedback
- [ ] Mock interview mode: Realistic Q&A with interviewer follow-ups
- [ ] STAR method coaching included in feedback
- [ ] Interview includes: opening, 2-3 behavioral, 1-2 situational, technical, cultural fit, closing
- [ ] Personality shifts to professional during interview (emoji reduction immediate)
- [ ] Feedback covers: strengths, areas to improve, revised answer examples, next steps
- [ ] Mock interview exit returns to cheerful mode smoothly

#### E. Data Integrity ✅
- [ ] CV extraction logic unchanged (code review confirms `extract-phase1.ts` untouched)
- [ ] All recommendations grounded in actual user CV/profile data
- [ ] No hallucinated job postings, company info, or user experience
- [ ] No fabricated metrics or achievements

#### F. Off-Topic Handling ✅
- [ ] Non-career questions receive polite scope redirect
- [ ] Redirect includes career-focused suggestion
- [ ] User can still ask follow-up career questions after redirect
- [ ] No abrupt rejection; warmth maintained

#### G. Self-Aware Prompt Reference ✅
- [ ] System prompt includes instruction to reference own guidelines
- [ ] When asked "why do you [behavior]?", assistant explains from prompt
- [ ] Behavior documentation consistent with prompt throughout conversation
- [ ] Assistant maintains this self-awareness throughout session

#### H. Markdown Rendering ✅
- [ ] No visible markdown syntax in rendered responses
- [ ] Cover letters display as clean paragraphs (not code blocks)
- [ ] Tables render properly in client
- [ ] Lists display as proper bullets/numbers

#### I. Testing & Regression ✅
- [ ] All existing integration tests pass (12 tests from previous phase)
- [ ] New tests added for session awareness (first-time vs. returning)
- [ ] New tests added for all three services
- [ ] New tests added for off-topic detection
- [ ] New tests added for mock interview personality shift
- [ ] Production build passes (no new errors)

---

## Requirements Map (Prompt → Implementation)

| Prompt Section | Requirement | Implementation Location | Type |
|---|---|---|---|
| Personality | Cheerful, emoji-rich, motivational tone | System prompt, response templates | Behavioral |
| Phase 1 | First-time vs. returning user greeting | Session awareness logic in route handler | Logic |
| Phase 2 | Profile collection (name, status, prefs) | Profile setup step in onboarding flow | UX |
| Phase 3 | CV extraction & preservation | Keep `extract-phase1.ts` untouched | Data |
| Phase 4 | Job matching & recommendations | Dimensional scoring algorithm | Logic |
| Scope | Career-only topics, off-topic redirect | Scope detection in system prompt | Logic |
| Service 1 | Cover letter generation + refinement | Anthropic API + mode classifier | Feature |
| Service 2 | CV enhancement with prioritized suggestions | Analysis algo + suggestion templates | Feature |
| Service 3 | Interview prep (practice + mock) | Multi-mode question handler + feedback | Feature |
| Interview | Interviewer mode (professional shift) | Personality mode toggle in flow | Behavioral |
| Edge Cases | Handle no experience, multiple versions, etc. | Branching logic in service handlers | Logic |
| Data | No hallucinations, ground in user data | Validation in all generation paths | Safety |
| Self-Ref | Assistant references its own prompt | System prompt meta-instruction | Behavioral |

---

## Definition of Done

A feature is **complete** when:

1. ✅ Code is merged to `feature/assistant-training-gsd`
2. ✅ Integration tests pass (including new tests for this phase)
3. ✅ All acceptance criteria above are verified
4. ✅ No hallucinations detected in manual testing
5. ✅ Off-topic redirect works smoothly
6. ✅ Mock interview mode personality shift is seamless
7. ✅ All three services deliver results matching prompt spec
8. ✅ Session state persists correctly
9. ✅ Production build passes
10. ✅ Code review confirms CV extraction logic untouched

---

## Notes for Planning Phase

**Key Implementation Considerations:**

1. **System Prompt Strategy:** Use a versioned, multi-section system prompt that includes:
   - Personality definition (tone, emoji guidelines)
   - Scope enforcement rules with detection patterns
   - Self-reference instruction so assistant explains its own behavior
   - Phase definitions (greeting → profile → CV → services)
   - Service specifications (cover letters, CV, interviews)
   - Mock interview mode rules
   - Hallucination prevention rules

2. **State Management:** Store in `CandidateProfile.editorDraft` JSON:
   - Current phase (greeting, profile-setup, cv-extraction, service)
   - Current service (cover-letter, cv-enhancement, interview-prep)
   - Session metadata (first-time flag, visited services, incomplete tasks)
   - Service-specific state (last generated cover letter, interview feedback, etc.)

3. **Refinement Mode:** Build on previous phase's `inferCoverLetterRefinementMode()` logic:
   - Extend to support all prompt-specified refinement types
   - Ensure mode classifier passes to Anthropic with explicit instructions

4. **Mock Interview Flow:**
   - Use phase/mode system to switch between "assistant" and "interviewer" personas
   - Store full interview Q&A in state for final feedback generation
   - Ensure emoji shift is immediate and clean

5. **Off-Topic Detection:**
   - Build regex/keyword patterns for common off-topic areas
   - Include in system prompt as explicit rules
   - Implement with graceful redirect (not rejection)

6. **Testing Strategy:**
   - Unit tests for refinement mode classifier
   - Integration tests for session state persistence
   - Integration tests for each service (cover letter, CV, interview)
   - Integration tests for off-topic detection
   - Regression tests ensuring all 12 existing tests still pass

---

**Ambiguity Score: 0.075** (92.5% clarity) ✅ GATE PASSED

All dimensions exceed minimums:
- Goal Clarity: 0.95 ✅ (minimum 0.75)
- Boundary Clarity: 0.92 ✅ (minimum 0.70)
- Constraint Clarity: 0.90 ✅ (minimum 0.65)
- Acceptance Criteria: 0.93 ✅ (minimum 0.70)

**READY FOR: gsd-discuss-phase** (not needed—spec is locked and comprehensive) **→ gsd-plan-phase directly**
