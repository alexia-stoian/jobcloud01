# Phase 5 Plan: Cheerful Preference Questions

**Phase**: 5 - Cheerful Preference Questions  
**Mode**: MVP  
**Created**: 2026-07-15  
**Depends on**: Phase 4 - Personalized Job Guidance And Coaching  

## Goal

Users experience warm, emoji-rich preference questions that match the assistant's cheerful personality and provide encouragement after each selection.

## User Story

**As a** job seeker going through the onboarding and preference-gathering process for the first time  
**I want to** see preference questions written in a warm, cheerful, encouraging way with emojis, and receive a short celebratory acknowledgment after each answer before moving to the next question  
**So that** the onboarding experience feels consistent with the cheerful assistant personality, I feel motivated and supported throughout the preference-gathering process, and the transition from preferences to services feels seamless and encouraging

## Success Criteria

1. ✅ All preference questions (contract type, work rate, salary, work authorization, employment situation, work rate) use cheerful personality with emojis
2. ✅ Questions include multiple-choice buttons (existing buttons kept) with warm introductory text above them
3. ✅ After user selects an answer, the assistant acknowledges it with a celebratory message
4. ✅ The exact same Profile fields and data saving logic remain unchanged - only message text and tone are improved
5. ✅ The preference tone matches the energy of interview mode, cover letter mode, and CV enhancement services

## Scope

### In Scope
- Identify all preference question text strings in codebase (messages/*.json files)
- Rewrite each preference question with cheerful personality, emojis, and warmth
- Add celebratory acknowledgment messages after each preference selection
- Ensure tone consistency across all 3 languages (English, German, French)
- Verify all existing buttons and data logic remain unchanged
- Align preference messaging with the assistant personality defined in `/prompts/prompt.txt`

### Out of Scope
- Changing preference field names or data structure
- Adding new preference fields
- Modifying database schema or API endpoints
- Changing the order of preference questions
- Adding new UI components (buttons already exist)

## Task Breakdown

### 1. Discovery & Analysis
**Goal**: Identify all preference questions and their current text

**Tasks**:
- [ ] Search codebase for preference question text in messages/*.json
- [ ] List all preference fields: contract type, work rate, salary, work authorization, employment situation
- [ ] Review system-prompt.ts for preference-related instructions
- [ ] Document current tone of each question
- [ ] Check `/prompts/prompt.txt` for personality guidelines

**Deliverable**: RESEARCH.md with preference questions catalog

### 2. Rewrite Preference Questions
**Goal**: Update all preference question text with cheerful personality and emojis

**Tasks**:
- [ ] Rewrite contract type question with warm intro + emojis
- [ ] Rewrite work rate question with warm intro + emojis
- [ ] Rewrite salary expectation question with warm intro + emojis
- [ ] Rewrite work authorization/permit question with warm intro + emojis
- [ ] Rewrite employment situation question with warm intro + emojis
- [ ] Ensure each question explains value (why this matters to job matching)
- [ ] Keep multiple-choice buttons as-is
- [ ] Apply changes to messages/en.json, messages/de.json, messages/fr.json

**Deliverable**: Updated messages/*.json with cheerful preference questions

### 3. Add Acknowledgment Messages
**Goal**: Add celebratory acknowledgments after each preference selection

**Tasks**:
- [ ] Add acknowledgment message for contract type selection (e.g., "Perfect! 💼✨ I've locked in...")
- [ ] Add acknowledgment for work rate selection (e.g., "Got it! ⏰ Full-time...")
- [ ] Add acknowledgment for salary selection (e.g., "Brilliant! 💰 I've saved...")
- [ ] Add acknowledgment for work authorization selection (e.g., "Awesome! 🇨🇭 Great news...")
- [ ] Add acknowledgment for employment situation selection (e.g., "Noted! 🎉...")
- [ ] Ensure acknowledgments explain how the field helps job matching
- [ ] Apply to all 3 languages (en, de, fr)
- [ ] Verify acknowledgments trigger after user submits each preference

**Deliverable**: Updated messages/*.json with celebration acknowledgments

### 4. System Prompt Alignment
**Goal**: Ensure system prompt instructs assistant to celebrate preference confirmations

**Tasks**:
- [ ] Review PREFERENCES CONFIRMATION TONE section in system-prompt.ts
- [ ] Verify it instructs assistant to celebrate with emojis
- [ ] Ensure it matches `/prompts/prompt.txt` personality guidelines
- [ ] Add any missing celebration instructions (if needed)

**Deliverable**: Verified system-prompt.ts with preference celebration rules

### 5. Build & Verification
**Goal**: Verify all changes compile and work end-to-end

**Tasks**:
- [ ] Run `npm build` and verify 0 TypeScript errors
- [ ] Start dev server and test fresh account creation
- [ ] Walk through entire preference-gathering flow
- [ ] Verify each question displays with cheerful text + emojis
- [ ] Verify each selection triggers celebratory acknowledgment
- [ ] Test in all 3 languages (en, de, fr)
- [ ] Verify existing buttons still work
- [ ] Verify data is saved correctly to database

**Deliverable**: Passing build + verified end-to-end flow

### 6. Git Commit & Documentation
**Goal**: Commit changes with clear messaging

**Tasks**:
- [ ] Stage all changes (messages/*.json, system-prompt.ts)
- [ ] Create commit with message: "feat: Add cheerful personality to preference questions"
- [ ] Document what was changed
- [ ] Prepare for code review

**Deliverable**: Committed changes on feature/cheerful-preferences-gsd

## Dependencies

- Phase 4 must be complete (preference questions must exist in codebase)
- `/prompts/prompt.txt` personality guidelines must be available for tone reference
- Current preference question strings must be accessible in messages/*.json

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Breaking existing preference logic | High | Verify all field names, data types, and save logic remain unchanged; test end-to-end |
| Inconsistent tone across 3 languages | Medium | Apply changes to all 3 files simultaneously; spot-check translations |
| Missing acknowledgment messages | Medium | Create comprehensive list of all preference fields; verify each has celebration |
| TypeScript compilation errors | Medium | Run build after each file edit; review changes before commit |

## Acceptance Criteria

- ✅ All 5+ preference questions rewritten with cheerful personality + emojis
- ✅ Acknowledgment messages added for each preference selection
- ✅ All changes in messages/en.json, messages/de.json, messages/fr.json, system-prompt.ts
- ✅ Build passes with 0 TypeScript errors
- ✅ End-to-end test confirms all emojis + celebrations display correctly
- ✅ All 3 languages work with consistent tone
- ✅ Existing buttons and data saving logic untouched
- ✅ Changes committed to feature/cheerful-preferences-gsd

## Next Steps

1. Execute Task 1 (Discovery & Analysis)
2. Execute Tasks 2-3 (Rewrite questions & add acknowledgments)
3. Execute Task 4 (Verify system prompt)
4. Execute Task 5 (Build & verification)
5. Execute Task 6 (Git commit)
