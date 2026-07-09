export type OnboardingStep =
  | "cv_upload"
  | "cv_extract"
  | "questioning"
  | "confirming"
  | "complete";

export type OnboardingQuestion = {
  id: string;
  field?: string;
  text: string;
  required: boolean;
  reason?: string;
};

export type OnboardingFactState = {
  [key: string]: unknown;
};

export type OnboardingSessionState = {
  userId: string;
  locale: "en" | "de" | "fr";
  currentStep: OnboardingStep;
  targetRole: string | null;
  cvFileName: string | null;
  cvMimeType: string | null;
  cvExtractedFacts: OnboardingFactState;
  cvUncertainFacts: OnboardingFactState;
  pendingQuestions: OnboardingQuestion[];
  skippedQuestionIds: string[];
  confirmedQuestionIds: string[];
  lastInteractedAt: string | null;
};

export type OnboardingQuestionPlan = {
  questions: OnboardingQuestion[];
  primaryFocus: string;
};
