/**
 * Integration Tests - AI Assistant Services
 * 
 * Tests all waves (2-5) of AI Assistant Training:
 * - Wave 2: Cover Letter Service
 * - Wave 3: CV Enhancement Service
 * - Wave 4: Interview Prep Service
 * - Wave 5: Scope Detection Service
 * 
 * Note: These tests focus on service logic and state management.
 * Database integration tests are in separate files.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createInitialAssistantState,
  updateServiceState,
  transitionPhase,
  type AssistantState
} from "@/types/assistant-state";
import { detectJobInfo, generateCoverLetter } from "@/lib/ai/assistant/services/cover-letter";
import { isCoverLetterRequest } from "@/lib/ai/assistant/services/cover-letter-handler";
import { analyzeCv } from "@/lib/ai/assistant/services/cv-enhancement";
import { buildInterviewQuestionBank, generatePracticeFeedback } from "@/lib/ai/assistant/services/interview-prep";
import { detectOffTopic } from "@/lib/ai/assistant/services/scope-detection";

describe("AI Assistant Services Integration", () => {
  let testUserId: string;
  let state: AssistantState;

  beforeEach(() => {
    testUserId = `test-user-${Date.now()}`;
    state = createInitialAssistantState(testUserId);
  });

  // ============================================================
  // WAVE 2: COVER LETTER SERVICE TESTS
  // ============================================================

  describe("Wave 2: Cover Letter Service", () => {
    it("should detect cover letter requests", () => {
      const messages = [
        "I need a cover letter for a Product Manager role at Google",
        "Can you write me a covering letter?",
        "Draft a letter for my job application",
        "Help me with a cover letter"
      ];

      messages.forEach((msg) => {
        expect(isCoverLetterRequest(msg)).toBe(true);
      });
    });

    it("should NOT flag non-cover-letter messages", () => {
      const messages = [
        "How do I prepare for an interview?",
        "My CV needs updating",
        "What should my salary expectations be?"
      ];

      messages.forEach((msg) => {
        expect(isCoverLetterRequest(msg)).toBe(false);
      });
    });

    it("should extract job information from messages", () => {
      const msg = "I want a letter for Senior Developer at Google";
      const result = detectJobInfo(msg);
      expect(result).toBeDefined();
      expect(result?.company || result?.title).toBeTruthy();
    });

    it("should track cover letter state correctly", () => {
      const initialState = state;
      expect(initialState.services.coverLetter).toBeDefined();
      expect(initialState.services.coverLetter?.draftCount).toBe(0);

      // Simulate generating a letter
      const updatedState = updateServiceState(state, "cover-letter", {
        lastGeneratedRole: "Senior Product Manager",
        lastDraftWordCount: 350,
        draftCount: 1,
        lastGeneratedAt: new Date().toISOString()
      });

      expect(updatedState.services.coverLetter?.draftCount).toBe(1);
      expect(updatedState.services.coverLetter?.lastGeneratedRole).toBe("Senior Product Manager");
      expect(updatedState.services.coverLetter?.lastDraftWordCount).toBe(350);
    });

    it("should track refinement mode in state", () => {
      const stateWithLetter = updateServiceState(state, "cover-letter", {
        lastGeneratedRole: "Developer",
        lastDraftWordCount: 320,
        draftCount: 1,
        lastGeneratedAt: new Date().toISOString()
      });

      const stateWithRefinement = updateServiceState(stateWithLetter, "cover-letter", {
        lastGeneratedRole: "Developer",
        lastDraftWordCount: 280,
        draftCount: 2,
        lastGeneratedAt: new Date().toISOString()
      });

      expect(stateWithRefinement.services.coverLetter?.draftCount).toBe(2);
    });
  });

  // ============================================================
  // WAVE 3: CV ENHANCEMENT SERVICE TESTS
  // ============================================================

  describe("Wave 3: CV Enhancement Service", () => {
    it("should analyze CV completeness", () => {
      const cvAnalysis = analyzeCv(
        {
          fullName: "Test User",
          primaryRole: "Software Engineer",
          employmentObjective: "Seeking leadership role",
          qualifications: [
            { category: "skill", value: "React" },
            { category: "skill", value: "TypeScript" }
          ],
          preferredLocation: "SF",
          currentJobSituation: "Looking",
          contractPreference: null,
          workRate: null,
          workPermitStatus: null,
          salaryExpectation: null
        },
        "Technology",
        "Senior Engineer"
      );

      expect(cvAnalysis).toBeDefined();
      expect(cvAnalysis.overall_score).toBeGreaterThan(0);
      expect(cvAnalysis.overall_score).toBeLessThanOrEqual(100);
    });

    it("should identify missing information", () => {
      const cvAnalysis = analyzeCv(
        {
          fullName: null,
          primaryRole: "Engineer",
          employmentObjective: null,
          qualifications: [],
          preferredLocation: "SF",
          currentJobSituation: "Looking",
          contractPreference: null,
          workRate: null,
          workPermitStatus: null,
          salaryExpectation: null
        },
        "Tech"
      );

      const hasMissingName = cvAnalysis.findings.some(
        (f) => f.section === "Contact Information"
      );
      const hasMissingObjective = cvAnalysis.findings.some(
        (f) => f.section === "Career Objectives"
      );

      expect(hasMissingName).toBe(true);
      expect(hasMissingObjective).toBe(true);
    });

    it("should provide industry-specific tips", () => {
      const cvAnalysis = analyzeCv(
        {
          fullName: "Test",
          primaryRole: "Software Engineer",
          employmentObjective: "Lead engineer role",
          qualifications: [],
          preferredLocation: "SF",
          contractPreference: null,
          workRate: null,
          workPermitStatus: null,
          salaryExpectation: null,
          currentJobSituation: null
        },
        "Technology",
        "Software Engineer"
      );

      expect(cvAnalysis.industrySpecificTips).toBeDefined();
      expect(Array.isArray(cvAnalysis.industrySpecificTips)).toBe(true);
    });

    it("should track CV enhancement state", () => {
      const stateWithCV = updateServiceState(state, "cv-enhancement", {
        suggestionsApplied: ["Added GitHub link", "Improved action verbs"]
      });

      expect(stateWithCV.services.cvEnhancement?.suggestionsApplied).toContain("Added GitHub link");
      expect(stateWithCV.services.cvEnhancement?.suggestionsApplied).toHaveLength(2);
    });
  });

  // ============================================================
  // WAVE 4: INTERVIEW PREP SERVICE TESTS
  // ============================================================

  describe("Wave 4: Interview Prep Service", () => {
    it("should build interview question bank", () => {
      const questions = buildInterviewQuestionBank(
        "Senior Product Manager",
        "Google",
        "5+ years PM, metrics-driven, user research"
      );

      expect(questions).toBeDefined();
      expect(questions.length).toBeGreaterThan(0);
      expect(questions.some((q) => q.type === "behavioral")).toBe(true);
      expect(questions.some((q) => q.type === "technical")).toBe(true);
    });

    it("should generate practice feedback for behavioral questions", () => {
      const question = {
        id: "test-1",
        type: "behavioral" as const,
        question: "Tell me about a time you led a team"
      };

      const userAnswer =
        "I was working on a team of 5 engineers. We needed to improve performance. I took initiative and led the effort. The result was 40% improvement.";

      const feedback = generatePracticeFeedback(userAnswer, question);

      expect(feedback).toBeDefined();
      expect(feedback.overallScore).toBeGreaterThanOrEqual(0);
      expect(feedback.overallScore).toBeLessThanOrEqual(10);
      expect(Array.isArray(feedback.strengths)).toBe(true);
      expect(Array.isArray(feedback.improvements)).toBe(true);
    });

    it("should analyze STAR structure", () => {
      const question = {
        id: "test-2",
        type: "behavioral" as const,
        question: "Tell me about overcoming a challenge"
      };

      const userAnswer =
        "The situation was that we had performance issues. My task was to fix it. I analyzed the code and refactored. We achieved 50% improvement.";

      const feedback = generatePracticeFeedback(userAnswer, question);

      expect(feedback.starAnalysis).toBeDefined();
      expect(feedback.starAnalysis?.situation).toBeDefined();
      expect(feedback.starAnalysis?.task).toBeDefined();
      expect(feedback.starAnalysis?.action).toBeDefined();
      expect(feedback.starAnalysis?.result).toBeDefined();
    });

    it("should track interview state", () => {
      const stateWithInterview = updateServiceState(state, "interview-prep", {
        lastActivityAt: new Date().toISOString()
      });

      expect(stateWithInterview.services.interviewPrep).toBeDefined();
    });
  });

  // ============================================================
  // WAVE 5: SCOPE DETECTION SERVICE TESTS
  // ============================================================

  describe("Wave 5: Scope Detection Service", () => {
    it("should detect off-topic weather questions", () => {
      const messages = [
        "What's the weather today?",
        "Will it rain tomorrow?",
        "How hot is it?",
        "What's the forecast?"
      ];

      messages.forEach((msg) => {
        const result = detectOffTopic(msg);
        expect(result.isOffTopic).toBe(true);
        expect(result.confidence).toBeGreaterThan(0);
      });
    });

    it("should detect off-topic sports questions", () => {
      const messages = [
        "Who won the football game?",
        "What's the score?",
        "Tell me about basketball",
        "How did the team play?"
      ];

      messages.forEach((msg) => {
        const result = detectOffTopic(msg);
        expect(result.isOffTopic).toBe(true);
        expect(result.confidence).toBeGreaterThan(0);
      });
    });

    it("should detect off-topic personal relationship questions", () => {
      const messages = [
        "Should I propose to my girlfriend?",
        "My boyfriend is upset",
        "How do I improve my marriage?",
        "Dating advice needed"
      ];

      messages.forEach((msg) => {
        const result = detectOffTopic(msg);
        expect(result.isOffTopic).toBe(true);
        expect(result.confidence).toBeGreaterThan(0);
      });
    });

    it("should NOT flag career-adjacent messages", () => {
      const messages = [
        "I need health insurance for the job",
        "What's the salary for this healthcare role?",
        "This tech job requires legal knowledge",
        "The company's legal team is amazing"
      ];

      messages.forEach((msg) => {
        const result = detectOffTopic(msg);
        expect(result.isOffTopic).toBe(false);
      });
    });

    it("should NOT flag on-topic career questions", () => {
      const messages = [
        "Help me with a cover letter",
        "I need interview prep",
        "Update my CV",
        "What skills should I develop?",
        "Tell me about the job market"
      ];

      messages.forEach((msg) => {
        const result = detectOffTopic(msg);
        expect(result.isOffTopic).toBe(false);
      });
    });
  });

  // ============================================================
  // SESSION STATE MANAGEMENT TESTS
  // ============================================================

  describe("Session State Management", () => {
    it("should create initial state correctly", () => {
      const initialState = createInitialAssistantState(testUserId);

      expect(initialState).toBeDefined();
      expect(initialState.version).toBeDefined();
      expect(initialState.currentPhase).toBe("greeting");
      expect(initialState.isFirstTime).toBe(true);
      expect(initialState.services).toBeDefined();
      expect(initialState.services.coverLetter?.draftCount).toBe(0);
    });

    it("should transition phases", () => {
      let currentState = createInitialAssistantState(testUserId);

      currentState = transitionPhase(currentState, "profile-collection");
      expect(currentState.currentPhase).toBe("profile-collection");

      currentState = transitionPhase(currentState, "services");
      expect(currentState.currentPhase).toBe("services");
    });

    it("should update service state atomically", () => {
      let currentState = state;

      // Update cover letter state
      currentState = updateServiceState(currentState, "cover-letter", {
        lastGeneratedRole: "Manager",
        lastDraftWordCount: 400,
        draftCount: 1,
        lastGeneratedAt: new Date().toISOString()
      });

      // Verify only cover letter was updated
      expect(currentState.services.coverLetter?.draftCount).toBe(1);
      expect(currentState.services.cvEnhancement?.suggestionsApplied).toEqual([]);

      // Update CV state
      currentState = updateServiceState(currentState, "cv-enhancement", {
        suggestionsApplied: ["Added metrics"]
      });

      // Verify both are tracked
      expect(currentState.services.coverLetter?.draftCount).toBe(1);
      expect(currentState.services.cvEnhancement?.suggestionsApplied).toContain("Added metrics");
    });
  });

  // ============================================================
  // CROSS-SERVICE INTEGRATION TESTS
  // ============================================================

  describe("Cross-Service Integration", () => {
    it("should maintain state across multiple service calls", () => {
      let currentState = createInitialAssistantState(testUserId);

      // User generates a cover letter
      currentState = updateServiceState(currentState, "cover-letter", {
        lastGeneratedRole: "Senior Engineer",
        lastDraftWordCount: 350,
        draftCount: 1,
        lastGeneratedAt: new Date().toISOString()
      });

      // Then improves CV
      currentState = updateServiceState(currentState, "cv-enhancement", {
        suggestionsApplied: ["Added GitHub", "Improved verbs"]
      });

      // Then practices interview
      currentState = transitionPhase(currentState, "services");

      // All state should be preserved
      expect(currentState.services.coverLetter?.draftCount).toBe(1);
      expect(currentState.services.cvEnhancement?.suggestionsApplied).toHaveLength(2);
      expect(currentState.currentPhase).toBe("services");
    });

    it("should handle rapid phase transitions with state preservation", () => {
      let state = createInitialAssistantState(testUserId);

      // Simulate conversation flow: greeting → profile → cv-extraction → services
      state = transitionPhase(state, "profile-collection");
      state = updateServiceState(state, "cover-letter", {
        lastGeneratedRole: "PM",
        lastDraftWordCount: 300,
        draftCount: 1,
        lastGeneratedAt: new Date().toISOString()
      });

      state = transitionPhase(state, "cv-extraction");
      state = updateServiceState(state, "cv-enhancement", {
        suggestionsApplied: ["Improved formatting"]
      });

      state = transitionPhase(state, "services");

      // State should contain history of all activities
      expect(state.currentPhase).toBe("services");
      expect(state.services.coverLetter?.draftCount).toBe(1);
      expect(state.services.cvEnhancement?.suggestionsApplied).toContain("Improved formatting");
    });
  });
});
