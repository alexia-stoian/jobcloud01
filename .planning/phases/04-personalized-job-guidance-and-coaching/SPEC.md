# Phase 4 Specification: Personalized Job Guidance And Coaching

**Phase:** 04 (Personalized Job Guidance And Coaching)  
**Status:** Specification Phase  
**Created:** 2026-07-14  
**Target:** Production-ready personal job coaching system

---

## Goal

Users receive actionable, profile-grounded job-search guidance, interview preparation, salary coaching, and readiness feedback. All guidance is tailored to their confirmed profile data (roles, location, skills, constraints) and respects their locale preference.

---

## Scope: What Gets Built

### User-Facing Surfaces

1. **Career Guide Page** (`/career-guide`)
   - Accessible only to authenticated users
   - Displays 5 sections of personalized guidance
   - Meta information: user's target role, location, generation timestamp

2. **Guidance Sections** (5 sections)
   - **Next Steps 🎯** (MEMG-05)
     - 2–4 concrete, prioritized actions for this week
     - Reference profile role, location, market factors
   
   - **Interview Preparation 💬** (MEMG-06)
     - 3–5 likely interview questions for the target role
     - Brief tips tailored to profile + role fit
   
   - **Skills to Strengthen 📈** (MEMG-07)
     - 2–3 specific skills or qualifications to improve
     - Gap analysis: target role vs. current profile
   
   - **Salary Guidance 💰** (MEMG-08)
     - Realistic salary range for role + location + constraints
     - Negotiation tips informed by work permit, seniority, market
   
   - **Profile Readiness 🔍** (MEMG-09)
     - Honest assessment: how ready is this profile for target role?
     - What's strong? What's missing?

### API Layer

**GET `/api/guidance`**
- Returns `GuidanceResponse` with 5 sections
- Auth required (returns 401 if not authenticated)
- Calls Anthropic Claude API with profile-specific prompt
- Response includes generated timestamp and profile context (role, location)
- Supports localization: responds in user's saved locale (EN/DE/FR)

### Backend Integration

- **Profile Memory**: Fetches DurableProfileMemory (Phase 3)
- **Completion Gate**: Should check profile is minimally complete before offering guidance
- **Anthropic Claude API**: Used for generating personalized guidance
- **User-Scoped**: All operations filtered by authenticated userId

### Localization

- Guidance text generated in user's saved locale (profile.locale)
- Section titles translated to user's language
- Supports EN, DE, FR
- "Responding in [Language]" constraint passed to Claude

---

## Requirements Mapping

| Phase 4 Requirement | Description | Implementation |
|-------------------|-------------|-----------------|
| **MEMG-05** | User receives tailored next-step guidance based on profile and target roles | `next_steps` section in GuidanceResponse |
| **MEMG-06** | User can receive interview preparation tailored to role + profile | `interview_prep` section with role-specific questions |
| **MEMG-07** | User can receive skill/qualification improvement suggestions | `skill_gaps` section with gap analysis |
| **MEMG-08** | User can receive salary guidance informed by profile constraints | `salary` section with negotiation tips |
| **MEMG-09** | User can receive profile-grounded readiness feedback | `readiness` section with honest assessment |

---

## Success Criteria

1. ✅ User can navigate to `/career-guide` page
2. ✅ Page displays "Analyzing profile…" while loading guidance
3. ✅ Guidance endpoint returns 5 sections grounded in profile data
4. ✅ Guidance respects user's locale (responds in EN/DE/FR)
5. ✅ All guidance references are specific to user's target role, location, and constraints
6. ✅ Guidance never exposes unconfirmed profile facts
7. ✅ Error states handled gracefully (profile incomplete, API unavailable)
8. ✅ Guidance generation completes within 60 seconds
9. ✅ All 5 sections appear in response (no missing sections)
10. ✅ Build passes, tests pass, no console errors

---

## Technical Constraints

### Grounding
- All guidance MUST reference confirmed profile facts from DurableProfileMemory
- No generic job-search advice (e.g., "practice interviews")
- Every recommendation should have "why" rooted in user's specific profile

### Localization
- Guidance prompt includes `Respond in [Language]` constraint
- Section titles translated in SECTION_TITLES map
- Claude response validated as JSON before parsing

### Performance
- Anthropic API call completes within 60 seconds
- Response timeout prevents hanging requests
- Max tokens: 1800 (enough for 5 substantive sections)

### Safety
- All endpoints require authentication
- User-scoped data access enforced
- No PII leakage in logs or responses

### Multi-Tenancy
- Every query filtered by authenticated userId
- No cross-user data leaks
- Session isolation enforced

---

## Implementation Status

**Code Exists:**
- ✅ `src/app/api/guidance/route.ts` — Main guidance endpoint
- ✅ `src/components/guidance/CareerGuideClient.tsx` — Client component
- ✅ `src/app/(app)/career-guide/page.tsx` — Career guide page route
- ✅ Anthropic API integration with localization support
- ✅ Error handling and timeout management

**Code Missing:**
- ❌ `tests/integration/guidance-endpoint.test.ts` — Endpoint tests
- ❌ `tests/integration/career-guide-page.test.ts` — Page tests
- ❌ `tests/e2e/career-guide.spec.ts` — End-to-end tests
- ❌ Completion gate check before offering guidance
- ❌ Profile validation (ensure minimal fields present)

---

## Remaining Work (Phase 4 Execution)

### Task 1: Profile Validation
**Objective:** Verify profile has minimal fields before offering guidance

```typescript
// GET /api/guidance should check:
const { isMinimallyComplete, missingCriticalFields } = computeCompletion(profile);
if (!isMinimallyComplete) {
  return NextResponse.json({
    error: "profile_incomplete",
    missingFields: missingCriticalFields
  }, { status: 400 });
}
```

**Impact:** Prevents "no target role" or "no location" errors from Claude

---

### Task 2: Anthropic Error Handling
**Objective:** Gracefully handle API failures

Current behavior:
- Returns 502 if Anthropic is unavailable
- Returns 502 if response can't be parsed as JSON

Should add:
- Retry logic with exponential backoff
- Graceful fallback if sections are missing
- Timeout detection before returning 502

---

### Task 3: Integration Tests (8 tests)

**Test Suite:** `tests/integration/guidance-endpoint.test.ts`

Test Cases:
1. ✅ GET /api/guidance requires auth (returns 401 if not authenticated)
2. ✅ Returns 404 if user profile not found
3. ✅ Returns 400 if profile incomplete (missing critical fields)
4. ✅ Returns all 5 sections in response (next_steps, interview_prep, skill_gaps, salary, readiness)
5. ✅ Sections contain profile-specific references (target role, location)
6. ✅ Response includes generatedAt timestamp
7. ✅ Response includes profileRole and profileLocation
8. ✅ Supports localization (responds in German when profile.locale = "de")

---

### Task 4: E2E Tests (2 tests)

**Test Suite:** `tests/e2e/career-guide.spec.ts`

Test Cases:
1. ✅ Career guide page loads for authenticated user
2. ✅ Displays all 5 guidance sections after loading
3. ✅ Shows "Analyzing your profile…" spinner during load
4. ✅ Displays error message if profile incomplete

---

### Task 5: UI Polish & Localization
**Objective:** Complete message localization for all Phase 4 surfaces

Add to `messages/{en|de|fr}.json`:
- "career_guide.title"
- "career_guide.subtitle"
- "career_guide.loading"
- "career_guide.error_incomplete_profile"
- "career_guide.meta_label"
- All 5 section titles (already have these)

---

## Phase 4 → Phase 5 Dependencies

Future phases may depend on:
- **Phase 5a: Interview Mock Sessions** — Use guidance history to customize mock questions
- **Phase 5b: Skill Development** — Convert skill gaps into learning plans
- **Phase 5c: Job Applications** — Reuse career guide feedback in job descriptions matching

---

## Acceptance Criteria

**Code Quality:**
- [ ] All Phase 4 tests passing (8 integration + 2 E2E = 10 tests)
- [ ] Build passes: `npm run build` ✅
- [ ] No TypeScript errors
- [ ] No console errors or warnings
- [ ] All endpoints secured with auth

**Functionality:**
- [ ] `/career-guide` page accessible and renders
- [ ] `/api/guidance` returns all 5 sections
- [ ] All guidance grounded in confirmed profile facts
- [ ] Localization works (EN/DE/FR responses)
- [ ] Error cases handled gracefully

**Performance:**
- [ ] Guidance generation completes in <60 seconds
- [ ] No memory leaks on repeated requests
- [ ] Response size < 10KB

**Documentation:**
- [ ] Phase 4 handoff document created
- [ ] API documentation updated
- [ ] Test coverage documented

---

## Files Affected

**Code to Modify:**
```
src/app/api/guidance/route.ts
  → Add profile completion validation
  → Add error recovery logic

src/components/guidance/CareerGuideClient.tsx
  → Already complete

src/app/(app)/career-guide/page.tsx
  → Already complete

messages/en.json, messages/de.json, messages/fr.json
  → Add Phase 4 localization keys
```

**Code to Create:**
```
tests/integration/guidance-endpoint.test.ts (NEW)
  → 8 integration tests for API

tests/e2e/career-guide.spec.ts (NEW)
  → 2 E2E tests for full user flow

.planning/phases/04-personalized-job-guidance-and-coaching/PLAN.md (NEW)
  → Execution plan with task breakdown
```

---

## Next Steps

1. **Execute Phase 4 Plan** (gsd-execute-phase)
   - Create detailed execution plan (PLAN.md)
   - Break down into executable tasks with dependencies
   - Estimate effort per task

2. **Build Phase 4 Tests**
   - Integration tests for guidance endpoint
   - E2E tests for user flow
   - Coverage validation

3. **Polish & Localization**
   - Add missing localization keys
   - Test multi-language support

4. **Handoff & Commit**
   - Create comprehensive Phase 4 handoff document
   - Atomic commit with all tests passing
   - Ready for Phase 5

---

## Notes

- Phase 4 code is ~80% complete (endpoint + UI exist)
- Remaining ~20% is tests, validation, localization, polish
- No architectural changes needed
- Estimated effort: 2-3 hours for complete Phase 4

