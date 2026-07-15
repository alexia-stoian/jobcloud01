# Phase 6 Plan: Basic Artifact Memory (MINIMAL - 4h max)

**Phase Goal**: Users can store + retrieve cover letters, job postings, and interview answers verbatim, and make simple edits.

**Scope**: LEAN - cover letters + job postings + interview Q&A. Single table, 3 DAL functions, basic edits. NO complex reference resolution, NO LangGraph/vector store.

**Estimated Effort**: 4 hours max

---

## Minimal Architecture

### Single Artifacts Table
```prisma
model StoredArtifact {
  id                String    @id @default(cuid())
  userId            String    @db.Uuid
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  type              String    // "cover_letter" | "interview_qa"
  content           String    @db.Text
  metadata          Json      @default("{}")  // { company, jobTitle } for cover letters; { question } for Q&A
  version           Int       @default(1)
  parentArtifactId  String?
  createdAt         DateTime  @default(now())
  @@index([userId, type])
}
```

Migration: `npx prisma migrate dev --name add_stored_artifacts`

---

## Task Breakdown (4 hours total)

### 1. Database + DAL (45 min)
- Add schema to `prisma/schema.prisma`
- Create migration
- `src/lib/artifacts/dal.ts`:
  - `store(userId, type, content, metadata)` → returns ID
  - `retrieve(id)` → returns content + metadata
  - `findByUserAndType(userId, type)` → returns list
  - `createVersion(parentId, newContent)` → new version
- No tests yet, just working code
- **Expected: Schema + 4 functions, no TypeScript errors**

### 2. Auto-Save Cover Letters (30 min)
- Find `src/lib/ai/assistant/services/cover-letter.ts`
- After generation, add:
  ```typescript
  await dal.store(userId, 'cover_letter', generatedText, {
    company: extracted.company,
    jobTitle: extracted.jobTitle
  })
  ```
- One hook, one place
- **Expected: Cover letters auto-saved on generation**

### 3. Auto-Save Job Postings (30 min)
- Locate where users input/paste job postings (likely in guidance or profile chat flow)
- After job posting is pasted/submitted, add:
  ```typescript
  await dal.store(userId, 'job_posting', fullPostingText, {
    company: extracted.company,
    jobTitle: extracted.jobTitle,
    source: 'user_input'
  })
  ```
- One hook, one place
- **Expected: Job postings auto-saved on user input**

### 4. Auto-Save Interview Q&A (30 min)
- Find interview answer storage in `src/lib/ai/assistant/services/interview-prep.ts`
- After each user answer, add:
  ```typescript
  await dal.store(userId, 'interview_qa', userAnswer, {
    question: questionText,
    sessionId: sessionId
  })
  ```
- One hook, one place
- **Expected: Interview answers auto-saved**

### 5. Retrieval + Display (45 min)
- Create `src/lib/artifacts/retrieve.ts`:
  - `findRecentByCompany(userId, company)` → returns cover letter or job posting for company
  - `findRecentByQuestion(userId, questionPattern)` → returns Q&A pair
  - Format output with "Here's that cover letter/job posting for [Company]! 📝✨\n\n[CONTENT]"
- Integrate into assistant: if user says "show me my cover letter for X" or "remind me about that job posting for Y" → retrieve + display
- **Expected: Can retrieve by company or question topic**

### 6. Basic Edit (30 min)
- Create `src/lib/artifacts/edit.ts`:
  - `applyEdit(content, editIntent)` → returns modified content
  - Handle: "add [paragraph]", "make it shorter", "add more about [X]"
  - Detect if user message contains edit keywords (add, remove, make, expand)
  - Use Claude to apply the edit surgically (don't regenerate whole thing)
  - Save as new version
- **Expected: Can edit + version**

### 7. System Prompt + Build (30 min)
- Add to `src/lib/ai/assistant/system-prompt.ts`:
  - "If user references a past artifact (cover letter, job posting, interview answer), use the stored version exactly"
  - "When confirming retrieval, use cheerful emoji personality"
- Build: `npm run build` → verify 0 TypeScript errors
- Quick manual test: generate cover letter → retrieve it, input job posting → retrieve it
- **Expected: Build passes, 0 errors, retrieval works**

---

## Minimal Success Criteria

✅ Generate cover letter → auto-stored → retrieve by "show me cover letter for [Company]" → get exact verbatim text back

✅ Input job posting → auto-stored → retrieve by "remind me about that job posting for [Company]" → get exact verbatim text back

✅ Answer interview Q → auto-stored → retrieve by "what did I say about [topic]" → get exact verbatim answer back

✅ Request edit to cover letter or job posting ("add X") → apply surgical change only → save as v2 → both versions exist

✅ All existing services work unchanged

✅ Build passes, 0 TypeScript errors

---

## What's NOT Included (Defer to Phase 7+)

❌ Complex reference resolution (AI-powered fuzzy matching)
❌ Retention policies / archival
❌ Artifact history UI
❌ LangGraph state management
❌ Vector store / semantic search

---

## Deliverables

1. **schema.prisma** - Add StoredArtifact model (supports cover_letter, job_posting, interview_qa types)
2. **src/lib/artifacts/dal.ts** - 4 core functions (store, retrieve, list, createVersion)
3. **src/lib/artifacts/retrieve.ts** - Find + display by company/question
4. **src/lib/artifacts/edit.ts** - Detect edit intent + apply surgically
5. **src/lib/ai/assistant/services/cover-letter.ts** - Add store() call
6. **src/lib/ai/assistant/services/interview-prep.ts** - Add store() call
7. **Job posting input handler** - Add store() call (location TBD after codebase exploration)
8. **src/lib/ai/assistant/system-prompt.ts** - Add artifact retrieval instruction
9. **Migration file** - CreateStoredArtifact table

---

## Next: Execution or Adjust?

Ready to implement now, or want to adjust the scope further?
