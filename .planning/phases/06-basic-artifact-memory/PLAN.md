# Phase 6 Plan: Basic Artifact Memory

**Phase Goal**: Users can retrieve exact copies of past cover letters, job postings, and interview answers; display them verbatim; and make targeted edits while preserving the original content.

**Dependencies**: Phase 4 (existing cover letter service, interview prep, coaching)

**Scope Mode**: Tight/Focused - single table, auto-save, exact retrieval, basic edits only. NO LangGraph, NO vector store, NO semantic search.

**Estimated Effort**: 2-3 days (tight scope)

---

## Architecture (Minimal & Focused)

### 1. Single Artifacts Table (Postgres + Prisma)

**Schema Addition**:
```prisma
model StoredArtifact {
  id                String    @id @default(cuid())
  userId            String    @db.Uuid
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  // Type enum: cover_letter | job_posting | interview_qa
  type              ArtifactType
  
  // Full content (verbatim storage)
  content           String    @db.Text
  
  // Metadata JSON for easy reference resolution
  // Examples:
  // Cover letter: { company, jobTitle }
  // Job posting: { company, jobTitle, url }
  // Interview Q&A: { questionText, sessionId, difficulty }
  metadata          Json      @default("{}")
  
  // Versioning: track edits to same artifact
  version           Int       @default(1)
  parentArtifactId  String?   // Reference to original if this is an edit
  
  // Timestamps
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  
  @@index([userId, type])
  @@index([userId, createdAt])
}

enum ArtifactType {
  COVER_LETTER
  JOB_POSTING
  INTERVIEW_QA
}
```

**Migration**: Create above table, add indexes for fast lookup by user + type + creation date.

---

## Task Breakdown

### Task Group 1: Database Layer (Day 1 morning)

**1.1 - Prisma Schema & Migration**
- Add `StoredArtifact` model to `schema.prisma`
- Add `ArtifactType` enum
- Create migration with `npx prisma migrate dev --name add_stored_artifacts`
- Verify schema compiles, no TypeScript errors
- Expected: Schema file + migration file + build success

**1.2 - Data Access Layer (DAL)**
- Create `src/lib/artifacts/dal.ts` with functions:
  - `storeArtifact(userId, type, content, metadata)` → returns artifact ID
  - `retrieveArtifactById(id)` → returns verbatim content + metadata
  - `retrieveArtifactsByType(userId, type, limit=10)` → returns list with metadata
  - `retrieveArtifactByReference(userId, type, metadata_query)` → fuzzy metadata match (e.g., find cover letter for "TechCorp")
  - `createNewVersion(parentArtifactId, newContent)` → stores new version with reference to original
  - `getArtifactHistory(artifactId)` → returns all versions with timestamps and change summaries
- All functions validate `userId` (no cross-user access)
- All functions validate artifact type is job-search related
- Expected: 6 functions, 100% type-safe, unit tested

**1.3 - Unit Tests for DAL**
- Test storage and exact retrieval (content must be byte-identical)
- Test metadata queries (retrieve by company name, etc.)
- Test versioning (original + edited version coexist)
- Test access control (user can only see own artifacts)
- Test scope validation (reject off-topic content types)
- Expected: 12+ test cases, all passing

---

### Task Group 2: Auto-Save Hooks (Day 1 afternoon)

**2.1 - Cover Letter Auto-Save**
- Locate existing cover letter generation endpoint: `src/lib/ai/assistant/services/cover-letter.ts`
- After successful cover letter generation, call:
  ```typescript
  await storeArtifact(userId, 'COVER_LETTER', generatedText, {
    company: extractedCompany,
    jobTitle: extractedJobTitle,
    generatedAt: new Date().toISOString()
  })
  ```
- Return artifact ID in response metadata (for later reference)
- Log artifact ID to console/system for debugging
- Expected: Cover letters auto-saved after generation

**2.2 - Job Posting Auto-Save**
- Locate where users input job postings (likely in onboarding or guidance flow)
- When user pastes/inputs a job posting, call:
  ```typescript
  await storeArtifact(userId, 'JOB_POSTING', fullPosting, {
    company: extractedCompany,
    jobTitle: extractedJobTitle,
    userInputAt: new Date().toISOString()
  })
  ```
- Return artifact ID in response
- Expected: Job postings auto-saved on input

**2.3 - Interview Q&A Auto-Save**
- Locate interview prep flow: `src/lib/ai/assistant/services/interview-prep.ts`
- After each question-answer pair in mock interview:
  ```typescript
  await storeArtifact(userId, 'INTERVIEW_QA', userAnswer, {
    questionText: question,
    sessionId: sessionId,
    difficulty: difficultyLevel,
    feedbackGiven: assistantFeedback
  })
  ```
- Do NOT store the entire interview history as one artifact - store each Q&A pair separately
- Expected: Each interview answer stored as separate artifact

---

### Task Group 3: Exact Retrieval & Display (Day 2 morning)

**3.1 - Reference Resolution Logic**
- Create `src/lib/artifacts/resolve-reference.ts`:
  - Function: `resolveArtifactReference(userId, userMessage, artifactType?)` 
  - Detects references in user message like:
    - "show me my cover letter for [Company]"
    - "that job posting I sent"
    - "my answer about [topic]"
  - Queries DAL to find matching artifact(s)
  - Returns artifact ID + metadata or null if not found
  - Prioritizes recent artifacts over older ones
- Expected: Reference resolution function that handles common reference patterns

**3.2 - Retrieval Response Handler**
- Create `src/lib/artifacts/display.ts`:
  - Function: `formatArtifactForDisplay(artifact)` → formatted text with ID and metadata visible
  - Function: `formatArtifactWithContext(artifact, userMessage)` → retrieval confirmation + artifact display
  - Displays: "[Artifact ID: xxx] Here's that cover letter for TechCorp from [Date]! 📝✨\n\n[VERBATIM CONTENT]\n\n"
  - Uses cheerful emoji personality
- Expected: Display formatting functions

**3.3 - Integration into Assistant Response**
- Modify `src/lib/ai/assistant/index.ts` main response handler:
  - Before generating response, check if user message contains reference to past artifact
  - If reference detected, resolve it and retrieve artifact
  - Include artifact ID and verbatim content in context sent to Claude
  - Instruct Claude: "If user references this artifact, use the stored version exactly as shown - do not regenerate or paraphrase"
  - If no reference, proceed with normal response flow
- Expected: Assistant can retrieve and display past artifacts

---

### Task Group 4: Basic Edit/Modify Pattern (Day 2 afternoon)

**4.1 - Edit Intent Detection**
- Create `src/lib/artifacts/detect-edit-intent.ts`:
  - Function: `detectEditIntent(userMessage)` → returns { isEdit: boolean, editType: string, editTarget: string }
  - Detects patterns like:
    - "add [X]" → editType: "add"
    - "remove [X]" → editType: "remove"
    - "change [X] to [Y]" → editType: "change"
    - "make it [adjective]" (shorter, longer, more formal) → editType: "refine"
    - "expand on [X]" → editType: "expand"
  - Returns structured edit intent
- Expected: Edit detection function

**4.2 - Precision Edit Application**
- Create `src/lib/artifacts/apply-edit.ts`:
  - Function: `applyPrecisionEdit(originalContent, editIntent, editDetails)` → returns newContent
  - Does NOT regenerate entire artifact - applies surgical changes only
  - For "add": inserts new section while preserving all other text byte-for-byte
  - For "remove": deletes specified section, preserves rest
  - For "change": replaces ONLY specified phrase, preserves context
  - For "expand": adds detail to specified section, preserves existing text
  - For "refine": applies light style changes (shorter → trim verbosity, more formal → adjust tone, etc.)
  - CRITICAL: Never alter text the user isn't asking to change
  - Returns: { newContent, changes: [{ type, location, before, after }] }
- Expected: Edit application function that makes surgical changes

**4.3 - Versioning & Storage**
- Modify DAL to add: `updateArtifactWithNewVersion(artifactId, newContent, changesSummary)`
  - Creates new version with parentArtifactId pointing to original
  - Increments version number
  - Stores change summary for user reference
  - Returns new artifact ID
- Expected: New versions stored with parent references

**4.4 - Integration into Edit Flow**
- Modify assistant response handler:
  - Detect edit intent from user message
  - If user references an artifact + edit intent detected:
    1. Retrieve original artifact verbatim
    2. Apply precision edits (surgical changes only)
    3. Store new version
    4. Display: "Got it! I've updated your cover letter with a new leadership paragraph! 💪 [Version info]\n\n[NEW CONTENT]\n\n" + cheerful personality
  - If no artifact reference + edit intent → normal generation flow
- Expected: Edit flow integrated into assistant

---

### Task Group 5: Testing & Validation (Day 3)

**5.1 - Integration Tests**
- Test end-to-end flows:
  1. Generate cover letter → auto-saved → retrieve → display verbatim
  2. Input job posting → auto-saved → retrieve by reference
  3. Complete interview Q&A → auto-saved → retrieve later → give feedback based on stored answer
  4. Retrieve artifact → user requests edit → apply edit → new version saved → old version still accessible
  5. User references artifact from months ago → system retrieves it accurately
  6. User tries to retrieve another user's artifact → access denied
  7. User tries to store off-topic content → rejected at scope validation layer

**5.2 - Manual Testing**
- Create test account
- Generate 3-4 cover letters → verify all auto-saved with correct metadata
- Input 2-3 job postings → verify retrieved correctly
- Complete partial mock interview (3 Q&A pairs) → verify all stored
- Request modifications to cover letter → verify only requested change applied, rest preserved
- Close/reopen session → verify artifacts still retrievable

**5.3 - Build & Type Checking**
- Run `npm run build` → verify 0 TypeScript errors on all new files
- Run `npm run test` (if suite exists) → new DAL + utility tests pass
- No warnings on new code

---

## Acceptance Criteria (How We Verify Success)

✅ **Automated Verification**
1. Artifact storage functions test: 100% passing (DAL unit tests)
2. Build verification: 0 TypeScript errors on new files
3. Reference resolution test: Detects 5+ reference patterns accurately
4. Edit application test: Applies changes surgically without altering unrelated text

✅ **Manual User Verification**
1. User generates cover letter → can retrieve it weeks later by name (e.g., "my TechCorp cover letter")
2. User inputs job posting → can reference it naturally (e.g., "does my background match that job I showed you?")
3. User answers interview questions → can ask later (e.g., "what did I say about the deadline challenge?") and gets exact stored answer
4. User edits cover letter ("add a leadership paragraph") → new version created, old preserved, only requested section added
5. User sees cheerful confirmations (e.g., "Here's that cover letter for TechCorp! 📝✨")
6. All existing services (CV extraction, preferences, cover letter generation, interview prep, coaching) work unchanged

---

## Integration Points (Where This Connects)

### Existing Services to Hook Into

1. **Cover Letter Service** (`src/lib/ai/assistant/services/cover-letter.ts`)
   - After generation: call `storeArtifact(userId, 'COVER_LETTER', ...)`
   - Return artifact ID in metadata

2. **Interview Prep** (`src/lib/ai/assistant/services/interview-prep.ts`)
   - After each user answer: call `storeArtifact(userId, 'INTERVIEW_QA', ...)`
   - Store question + answer separately

3. **Job Guidance Service** (wherever job postings are input)
   - On user input: call `storeArtifact(userId, 'JOB_POSTING', ...)`

4. **Main Assistant Response Handler** (`src/lib/ai/assistant/index.ts`)
   - Before generating response: check for artifact references
   - If found: retrieve and include in context
   - If edit intent detected: apply edits instead of regenerating
   - Include context: "Use stored artifacts verbatim - never regenerate"

5. **System Prompt** (`src/lib/ai/assistant/system-prompt.ts`)
   - Add instruction: "If user references a past artifact, retrieve it from memory and use the stored version exactly"
   - Add personality: "When retrieving artifacts, confirm cheerfully (e.g., 'Here's that cover letter for [Company]! 📝✨')"

---

## Constraints & Non-Scope

### ✅ IN SCOPE
- Store cover letters, job postings, interview Q&A
- Auto-save on creation
- Exact retrieval by ID or reference
- Basic edits (add/remove/change/expand/refine sections)
- Versioning (original + edited versions coexist)
- Job-search scope enforcement

### ❌ OUT OF SCOPE (Not Yet)
- LangGraph state management
- Vector store / semantic search
- Complex AI-driven reference resolution (fuzzy AI parsing)
- Full artifact comparison or diff UI
- Artifact deletion/archival
- Sharing artifacts
- Bulk operations
- AI-powered edit suggestions

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| **Artifact storage bloats DB** | Add retention policy: keep last 100 artifacts per user per type, archive older ones |
| **Edit application breaks content** | Extensive unit tests for edit application; manual spot-checks on different artifact types |
| **Reference resolution false positives** | Require explicit metadata match (company name exact match for cover letters); prioritize recent artifacts |
| **Scope validation too strict/loose** | Whitelist only: cover_letter, job_posting, interview_qa types; reject everything else |
| **Cross-user data leak** | Every function validates userId; no queries without userId filter |
| **Existing services break** | Auto-save is additive - only adds calls to new DAL, doesn't modify existing logic |

---

## Deliverables (Committed to repo)

1. **Database** 
   - Updated `prisma/schema.prisma` with `StoredArtifact` model
   - Migration file: `prisma/migrations/[timestamp]_add_stored_artifacts/migration.sql`

2. **Data Access Layer**
   - `src/lib/artifacts/dal.ts` (6 core functions)
   - `src/lib/artifacts/types.ts` (TypeScript types)
   - Tests: `tests/unit/artifacts/dal.test.ts`

3. **Auto-Save Hooks**
   - Modifications to `src/lib/ai/assistant/services/cover-letter.ts`
   - Modifications to `src/lib/ai/assistant/services/interview-prep.ts`
   - Modifications to relevant job posting input handler

4. **Retrieval & Display**
   - `src/lib/artifacts/resolve-reference.ts` (reference detection)
   - `src/lib/artifacts/display.ts` (formatting)
   - Modifications to `src/lib/ai/assistant/index.ts` (main response handler)

5. **Edit & Versioning**
   - `src/lib/artifacts/detect-edit-intent.ts` (edit detection)
   - `src/lib/artifacts/apply-edit.ts` (precision edits)
   - Modified DAL with versioning functions

6. **System Prompt**
   - Modifications to `src/lib/ai/assistant/system-prompt.ts` (artifact retrieval instructions + personality)

7. **Tests**
   - Unit tests for DAL, reference resolution, edit application
   - Integration tests for end-to-end flows
   - All tests passing, build passing

8. **Documentation**
   - This PLAN.md
   - Inline code comments explaining artifact storage patterns
   - No external documentation (keep it minimal)

---

## Success Metrics

After Phase 6 completion, users can:

1. ✅ Generate or input artifacts → automatically stored with metadata
2. ✅ Reference past artifacts naturally → system resolves and retrieves verbatim
3. ✅ Display/expand stored artifacts → cheerful confirmation + exact stored content
4. ✅ Make targeted edits → only requested changes applied, rest preserved verbatim
5. ✅ Access old versions → revert if needed
6. ✅ Stay in job-search scope → off-topic content rejected

And the system:
- ✅ Maintains 100% backward compatibility with all existing services
- ✅ Maintains cheerful emoji personality on confirmations
- ✅ Has 0 TypeScript errors and passing tests
- ✅ Has no database migrations or schema changes that break existing code

---

## Next Phase (Phase 7+)

After Phase 6 is complete and verified, consider:
- **Phase 7**: LangGraph state management + multi-turn conversation flow (optional future enhancement)
- **Phase 8**: Vector store + semantic search (if needed for more advanced retrieval)
- **Phase 9**: UI improvements (artifact history browser, version diff viewer, etc.)

For now, focus on Phase 6 completeness and confidence.
