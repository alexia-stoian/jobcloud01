// Phase 1 Enhanced Extraction - Multi-section comprehensive CV parsing
// This module uses Anthropic API to perform intelligent extraction of:
// - Work experience (with dates, achievements, technologies)
// - Education (with honors and fields)
// - Skills (categorized with proficiency levels)
// - Certifications (with dates and credentials)
// - Profile fields (location, work preferences, salary)

export { extractCvFacts, cvUploadRequestSchema } from "./extract-with-phase1";
export type { ExtractedCvFacts, ExtractedCvResult } from "./extract-with-phase1";
export { extractCvPhase1 } from "./extract-phase1";
export type { ExtractedCvPhase1, WorkExperience, Education, Skill, Certification } from "./extract-phase1";
