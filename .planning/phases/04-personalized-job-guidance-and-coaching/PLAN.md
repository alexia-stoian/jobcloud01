# Phase 4 Plan: Personalized Job Guidance And Coaching

**Phase:** 04  
**Status:** Execution Planning  
**Created:** 2026-07-14  
**Target:** Complete Phase 4 (guidance endpoint + UI + tests + polish)

---

## Execution Overview

Phase 4 has ~80% of code already implemented (guidance endpoint, UI component, career guide page). Remaining work:
1. Add profile completion validation
2. Create integration tests (8 tests)
3. Create E2E tests (2 tests)
4. Add localization messages
5. Error handling & polish

**Estimated Duration:** 2–3 hours  
**Test Target:** 10 new tests passing, all Phase 4 functionality validated

---

## Wave 1: Validation & Error Handling (60 min)

### T1.1: Add Profile Completion Check to Guidance Endpoint

**Objective:** Validate profile is minimally complete before generating guidance

**File:** `src/app/api/guidance/route.ts`

**Changes:**
```typescript
// After fetching profile, add:
const completion = computeCompletion(profile);
if (!completion.isMinimallyComplete) {
  return NextResponse.json({
    error: "profile_incomplete",
    missingFields: completion.missingCriticalFields,
    message: "Please complete your profile with target role and location before requesting guidance."
  }, { status: 400 });
}
```

**Rationale:** Prevents Claude calls when profile has no role/location data

**Validation:** Should return 400 when profile incomplete, with clear error message

---

### T1.2: Improve Anthropic Error Handling

**Objective:** Add retry logic and graceful fallback for API failures

**File:** `src/app/api/guidance/route.ts`

**Changes:**
```typescript
// Modify callAnthropic function:
// 1. Add exponential backoff for retries (max 2 attempts)
// 2. Detect timeout vs other errors
// 3. Return structured error object with retry count

// If response has missing sections, fill with fallback text:
const missingIds: GuidanceSection["id"][] = [];
for (const id of ["next_steps", "interview_prep", "skill_gaps", "salary", "readiness"]) {
  if (!parsed[id]) {
    missingIds.push(id as GuidanceSection["id"]);
    parsed[id] = `Unable to generate detailed guidance for this section. Please try again later.`;
  }
}
```

**Rationale:** Ensures graceful degradation if Anthropic API is slow or returns partial data

**Validation:** Even if API returns incomplete JSON, all 5 sections present in response

---

### T1.3: Add TypeScript Types for Guidance Request/Response

**Objective:** Strengthen type safety for guidance flows

**File:** `src/app/api/guidance/route.ts`

**Changes:**
```typescript
// Already defined but ensure consistency:
export type GuidanceResponse = {
  sections: GuidanceSection[];
  generatedAt: string;
  profileRole: string | null;
  profileLocation: string | null;
};

// Add error response types:
export type GuidanceErrorResponse = {
  error: string;
  missingFields?: string[];
  message?: string;
  retryAfter?: number;
};
```

**Rationale:** Enables better error handling in client component

**Validation:** No TypeScript errors in endpoint or consuming components

---

## Wave 2: Integration Tests (90 min)

### T2.1: Create Guidance Endpoint Tests

**Objective:** Write 8 comprehensive integration tests for `/api/guidance`

**File:** `tests/integration/guidance-endpoint.test.ts` (NEW)

**Test Cases:**

1. **Test: Requires Authentication**
   ```typescript
   it("returns 401 if not authenticated", async () => {
     const res = await fetch("/api/guidance");
     expect(res.status).toBe(401);
   });
   ```

2. **Test: Profile Not Found**
   ```typescript
   it("returns 404 if user profile not found", async () => {
     // Mock auth to return user with no profile
     const res = await fetch("/api/guidance");
     expect(res.status).toBe(404);
     expect(res.json()).toHaveProperty("error", "profile_not_found");
   });
   ```

3. **Test: Profile Incomplete**
   ```typescript
   it("returns 400 if profile missing critical fields", async () => {
     // Create profile with only name, no role/location
     const res = await fetch("/api/guidance");
     expect(res.status).toBe(400);
     expect(res.json()).toHaveProperty("error", "profile_incomplete");
     expect(res.json()).toHaveProperty("missingFields");
   });
   ```

4. **Test: All 5 Sections Present**
   ```typescript
   it("returns all 5 guidance sections", async () => {
     const res = await fetch("/api/guidance");
     expect(res.status).toBe(200);
     const data = await res.json();
     expect(data.sections).toHaveLength(5);
     expect(data.sections.map(s => s.id)).toEqual([
       "next_steps", "interview_prep", "skill_gaps", "salary", "readiness"
     ]);
   });
   ```

5. **Test: Profile-Specific References**
   ```typescript
   it("guidance references profile data", async () => {
     const res = await fetch("/api/guidance");
     const data = await res.json();
     // Should mention target role somewhere
     const allContent = data.sections.map(s => s.content).join(" ");
     expect(allContent.toLowerCase()).toContain(profileRole.toLowerCase());
   });
   ```

6. **Test: Includes Metadata**
   ```typescript
   it("response includes generatedAt and profile context", async () => {
     const res = await fetch("/api/guidance");
     const data = await res.json();
     expect(data).toHaveProperty("generatedAt");
     expect(data).toHaveProperty("profileRole");
     expect(data).toHaveProperty("profileLocation");
     expect(new Date(data.generatedAt)).toBeInstanceOf(Date);
   });
   ```

7. **Test: Localization (German)**
   ```typescript
   it("responds in user locale (German)", async () => {
     // Set profile.locale = "de"
     const res = await fetch("/api/guidance");
     const data = await res.json();
     // At minimum, German response should be different from English
     // (Content check is fuzzy due to AI generation)
     expect(data.sections).toHaveLength(5);
   });
   ```

8. **Test: Section Titles Translated**
   ```typescript
   it("section titles are translated to user locale", async () => {
     const res = await fetch("/api/guidance");
     const data = await res.json();
     const titles = data.sections.map(s => s.title);
     // Should have title for each section (not raw ID)
     expect(titles).toContain("Your next steps 🎯");
     expect(titles).toContain("Interview preparation 💬");
     // ... etc for all 5
   });
   ```

**Validation:** All 8 tests pass

---

## Wave 3: E2E Tests (60 min)

### T3.1: Create Career Guide E2E Tests

**Objective:** Write 2 comprehensive end-to-end tests for user flow

**File:** `tests/e2e/career-guide.spec.ts` (NEW)

**Test Cases:**

1. **Test: Full User Flow - Career Guide Page Load & Display**
   ```typescript
   test("user can view career guide with all 5 sections", async ({ page }) => {
     // 1. Login
     await page.goto("/login");
     await page.fill("input[name=email]", "test@example.com");
     await page.fill("input[name=password]", "password");
     await page.click("button:has-text('Log In')");
     await page.waitForURL("/dashboard");

     // 2. Navigate to career guide
     await page.goto("/career-guide");
     
     // 3. See loading state
     const spinner = await page.locator(".guidance-loading__spinner");
     expect(spinner).toBeVisible();
     
     // 4. Wait for guidance to load
     await page.waitForSelector(".guidance-root", { timeout: 70000 });
     
     // 5. Verify all 5 sections present
     const sections = await page.locator(".guidance-section");
     expect(await sections.count()).toBe(5);
     
     // 6. Verify section titles
     expect(await page.locator("text=Your next steps 🎯")).toBeVisible();
     expect(await page.locator("text=Interview preparation 💬")).toBeVisible();
     expect(await page.locator("text=Skills to strengthen 📈")).toBeVisible();
     expect(await page.locator("text=Salary guidance 💰")).toBeVisible();
     expect(await page.locator("text=Profile readiness 🔍")).toBeVisible();
     
     // 7. Verify metadata visible
     expect(await page.locator(".guidance-meta")).toBeVisible();
   });
   ```

2. **Test: Error Handling - Incomplete Profile**
   ```typescript
   test("shows error if profile is incomplete", async ({ page }) => {
     // 1. Create user with incomplete profile (no role, no location)
     // 2. Login
     // 3. Navigate to /career-guide
     // 4. Should see error message instead of loading state
     await page.goto("/career-guide");
     const error = await page.locator(".guidance-error");
     expect(error).toBeVisible();
     expect(error).toContainText("Make sure your profile has at least a target role");
     
     // 5. Verify retry button is available
     const retryBtn = await page.locator("button:has-text('Try again')");
     expect(retryBtn).toBeVisible();
   });
   ```

**Validation:** Both E2E tests pass with <70 second timeout

---

## Wave 4: Localization & Polish (60 min)

### T4.1: Add Phase 4 Localization Keys

**Objective:** Complete message keys for all 3 languages

**Files:** 
- `messages/en.json`
- `messages/de.json`
- `messages/fr.json`

**Keys to Add:**

```json
{
  "guidance": {
    "page_title": "Career Guide",
    "page_subtitle": "Personalised coaching based on your saved profile 🎯",
    "loading": "Analysing your profile and generating personalised guidance…",
    "error_incomplete": "Could not load guidance right now. Make sure your profile has at least a target role and location filled in, then try again.",
    "retry_button": "Try again",
    "meta_time_label": "Generated",
    "section_titles": {
      "next_steps": "Your next steps 🎯",
      "interview_prep": "Interview preparation 💬",
      "skill_gaps": "Skills to strengthen 📈",
      "salary": "Salary guidance 💰",
      "readiness": "Profile readiness 🔍"
    }
  }
}
```

**Localization for German (de):**
```json
{
  "guidance": {
    "page_title": "Karriereführer",
    "page_subtitle": "Personalisiertes Coaching basierend auf Ihrem gespeicherten Profil 🎯",
    "loading": "Analysieren Sie Ihr Profil und generieren Sie personalisierte Anleitung…",
    // ... etc
  }
}
```

**Localization for French (fr):**
```json
{
  "guidance": {
    "page_title": "Guide de carrière",
    "page_subtitle": "Coaching personnalisé basé sur votre profil enregistré 🎯",
    "loading": "Analyse de votre profil et génération de conseils personnalisés…",
    // ... etc
  }
}
```

**Validation:** All 3 languages have complete guidance keys

---

### T4.2: Update CareerGuideClient to Use Localization

**Objective:** Use message keys instead of hardcoded strings

**File:** `src/components/guidance/CareerGuideClient.tsx`

**Changes:**
- Import `useMessages` or equivalent localization hook
- Replace hardcoded strings with message keys
- Example: `"Analysing your profile…"` → `getLocalizedMessage("guidance.loading")`

**Validation:** Component renders correctly with all 3 languages

---

## Wave 5: Testing & Validation (60 min)

### T5.1: Run Full Phase 4 Test Suite

**Objective:** Verify all Phase 4 tests pass

**Command:**
```bash
npm test -- tests/integration/guidance-endpoint.test.ts tests/e2e/career-guide.spec.ts --run
```

**Expected Result:** 10/10 tests passing (8 integration + 2 E2E)

**Validation Checklist:**
- [ ] All 8 integration tests pass
- [ ] Both E2E tests pass
- [ ] No flaky tests
- [ ] No console errors/warnings

---

### T5.2: Build & Type Check

**Objective:** Ensure project builds cleanly with no TypeScript errors

**Command:**
```bash
npm run build
```

**Expected Result:** Build succeeds, no errors

**Validation Checklist:**
- [ ] Build completes without errors
- [ ] No TypeScript strict mode violations
- [ ] No runtime errors during build

---

### T5.3: Manual Testing (Developer Verification)

**Objective:** Manually verify career guide works end-to-end

**Steps:**
1. Login to application
2. Complete onboarding with CV (or use existing profile)
3. Navigate to `/career-guide`
4. Verify:
   - [ ] Loading spinner appears
   - [ ] 5 sections load within 60 seconds
   - [ ] All sections have content
   - [ ] Meta information shows role + location
   - [ ] No console errors
5. Change language (EN → DE) and reload
   - [ ] Guidance text changes (language respects locale)
6. Test with incomplete profile (delete role/location):
   - [ ] Error message appears
   - [ ] Retry button works

**Validation:** All manual checks pass

---

## Wave 6: Documentation & Handoff (30 min)

### T6.1: Create Phase 4 Handoff Document

**Objective:** Comprehensive handoff for Phase 4 completion

**File:** `PHASE4-HANDOFF.md` (to create after execution)

**Contents:**
- Architecture overview
- API specification
- UI component documentation
- Test coverage summary
- Known limitations
- Next phase dependencies
- Deployment notes

**Validation:** Handoff document complete and reviewed

---

### T6.2: Update ROADMAP and Requirements

**Objective:** Mark Phase 4 complete in project files

**Files to Update:**
- `.planning/ROADMAP.md` — Mark Phase 4 complete
- `.planning/REQUIREMENTS.md` — Mark MEMG-05 through MEMG-09 complete

**Validation:** All Phase 4 requirements marked complete

---

## Checkpoint: Pre-Commit Verification

Before committing Phase 4 completion:

**Code Quality:**
- [ ] No TypeScript errors
- [ ] All tests passing (10/10 new tests + existing tests)
- [ ] Build passing
- [ ] No console errors/warnings
- [ ] Linting passed

**Functionality:**
- [ ] Career guide page accessible
- [ ] All 5 guidance sections display
- [ ] Guidance grounded in profile data
- [ ] Localization working (EN/DE/FR)
- [ ] Error states handled

**Documentation:**
- [ ] SPEC.md complete
- [ ] PLAN.md complete
- [ ] PHASE4-HANDOFF.md complete
- [ ] API documentation updated

**Commit:**
- [ ] Atomic commit with all tests passing
- [ ] Branch: `feature/assistant-training-gsd`
- [ ] Commit message references all MEMG requirements

---

## Success Criteria

**Build:** ✅ `npm run build` passes  
**Tests:** ✅ 10 Phase 4 tests passing (8 integration + 2 E2E)  
**Functionality:** ✅ Career guide page works end-to-end  
**Localization:** ✅ EN/DE/FR all working  
**Error Handling:** ✅ Graceful failures on incomplete profile or API errors  

---

## Timeline

| Wave | Task | Duration | Total |
|------|------|----------|-------|
| 1 | Validation & Error Handling | 60 min | 60 min |
| 2 | Integration Tests (8 tests) | 90 min | 150 min |
| 3 | E2E Tests (2 tests) | 60 min | 210 min |
| 4 | Localization & Polish | 60 min | 270 min |
| 5 | Testing & Build | 60 min | 330 min |
| 6 | Documentation & Handoff | 30 min | 360 min |

**Total Estimated Time:** 6 hours (360 min)  
**Per Wave:** 45–90 minutes each

---

## Notes

- Phase 4 endpoint and UI already exist (~80% complete)
- This plan focuses on remaining 20%: tests, validation, localization
- No architectural changes needed
- Can execute in 1–2 work sessions
- Ready to move to Phase 5 after completion

