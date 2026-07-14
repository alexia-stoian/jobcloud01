/**
 * Assistant Session State Types
 * 
 * Defines the structure for storing user session state in CandidateProfile.assistantState
 * Enables resuming conversations and tracking progress through phases/services
 */

/**
 * Main session state - stored as JSON in CandidateProfile.assistantState
 */
export interface AssistantState {
  version: string;
  currentPhase: "greeting" | "profile-collection" | "cv-extraction" | "services";
  currentService?: "cover-letter" | "cv-enhancement" | "interview-prep";
  isFirstTime: boolean;
  profileCollected: boolean;
  cvExtracted: boolean;
  
  metadata: {
    sessionStartedAt: string; // ISO date
    lastActivityAt: string;   // ISO date
    phaseHistory: Array<{
      phase: string;
      enteredAt: string;
      exitedAt?: string;
    }>;
  };

  // Collected user profile information
  userProfile?: {
    name?: string;
    jobStatus?: "employed" | "unemployed" | "freelance" | "student" | "transitioning";
    industryPreferences?: string[];
    locationPreferences?: string[];
    salaryExpectations?: {
      currency: string;
      min?: number;
      max?: number;
    };
    workAuthStatus?: string;
    employmentTypePreferences?: ("full-time" | "part-time" | "contract" | "freelance")[];
    workRatePreference?: number; // hours per week
    careerGoals?: string;
  };

  // Service-specific state
  services: {
    coverLetter?: CoverLetterServiceState;
    cvEnhancement?: CvEnhancementServiceState;
    interviewPrep?: InterviewPrepServiceState;
  };
}

export interface CoverLetterServiceState {
  lastGeneratedRole?: string;
  lastDraftWordCount?: number;
  refinementMode?: "expand" | "summarize" | "rewrite";
  lastGeneratedAt?: string; // ISO date
  draftCount: number;
  refinementHistory?: Array<{
    mode: string;
    requestedAt: string;
  }>;
}

export interface CvEnhancementServiceState {
  lastAnalyzedAt?: string; // ISO date
  suggestionsApplied?: string[];
  priorityFocusArea?: string;
}

export interface InterviewPrepServiceState {
  currentMode?: "practice" | "mock";
  lastPracticeAt?: string;
  lastMockAt?: string;
  mockInterviewState?: {
    currentQuestion: number;
    totalQuestions: number;
    answers: string[];
    interviewerMode: boolean;
    interviewRole: string;
    interviewCompany: string;
    startedAt: string;
  };
  practiceHistory?: Array<{
    question: string;
    userAnswer: string;
    feedbackProvided: boolean;
    timestamp: string;
  }>;
}

/**
 * Create initial/default assistant state for first-time users
 */
export function createInitialAssistantState(): AssistantState {
  const now = new Date().toISOString();
  return {
    version: "1.0.0",
    currentPhase: "greeting",
    isFirstTime: true,
    profileCollected: false,
    cvExtracted: false,
    metadata: {
      sessionStartedAt: now,
      lastActivityAt: now,
      phaseHistory: [
        {
          phase: "greeting",
          enteredAt: now
        }
      ]
    },
    services: {
      coverLetter: {
        draftCount: 0,
        refinementHistory: []
      },
      cvEnhancement: {
        suggestionsApplied: []
      },
      interviewPrep: {
        practiceHistory: []
      }
    }
  };
}

/**
 * Helper to get resumable phase for returning user
 * Determines where to pick up conversation based on state
 */
export function getResumablePhase(state: AssistantState): {
  phase: string;
  context: string;
} {
  if (!state.profileCollected) {
    return {
      phase: "profile-collection",
      context: "We were collecting your profile information."
    };
  }

  if (!state.cvExtracted) {
    return {
      phase: "cv-extraction",
      context: "We were extracting and analyzing your CV."
    };
  }

  if (state.currentService) {
    return {
      phase: "services",
      context: `We were working on ${state.currentService} for you.`
    };
  }

  return {
    phase: "services",
    context: "You can now access our services: cover letters, CV enhancement, or interview prep!"
  };
}

/**
 * Helper to transition to next phase
 */
export function transitionPhase(
  state: AssistantState,
  toPhase: AssistantState["currentPhase"]
): AssistantState {
  const now = new Date().toISOString();
  
  // Mark current phase as exited
  if (state.metadata.phaseHistory.length > 0) {
    const currentPhaseEntry = state.metadata.phaseHistory[state.metadata.phaseHistory.length - 1];
    if (!currentPhaseEntry.exitedAt) {
      currentPhaseEntry.exitedAt = now;
    }
  }

  // Add new phase to history
  state.metadata.phaseHistory.push({
    phase: toPhase,
    enteredAt: now
  });

  return {
    ...state,
    currentPhase: toPhase,
    metadata: {
      ...state.metadata,
      lastActivityAt: now
    }
  };
}

/**
 * Helper to mark profile as collected
 */
export function markProfileCollected(state: AssistantState): AssistantState {
  return {
    ...state,
    profileCollected: true,
    metadata: {
      ...state.metadata,
      lastActivityAt: new Date().toISOString()
    }
  };
}

/**
 * Helper to mark CV as extracted
 */
export function markCvExtracted(state: AssistantState): AssistantState {
  return {
    ...state,
    cvExtracted: true,
    metadata: {
      ...state.metadata,
      lastActivityAt: new Date().toISOString()
    }
  };
}

/**
 * Helper to update service state
 */
export function updateServiceState(
  state: AssistantState,
  service: "cover-letter" | "cv-enhancement" | "interview-prep",
  updates: Partial<CoverLetterServiceState | CvEnhancementServiceState | InterviewPrepServiceState>
): AssistantState {
  return {
    ...state,
    currentService: service,
    services: {
      ...state.services,
      [service === "cover-letter" ? "coverLetter" : service === "cv-enhancement" ? "cvEnhancement" : "interviewPrep"]: {
        ...state.services[service === "cover-letter" ? "coverLetter" : service === "cv-enhancement" ? "cvEnhancement" : "interviewPrep"],
        ...updates
      }
    },
    metadata: {
      ...state.metadata,
      lastActivityAt: new Date().toISOString()
    }
  };
}
