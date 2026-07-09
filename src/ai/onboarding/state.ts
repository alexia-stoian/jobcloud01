export type OnboardingGraphState = {
  userMessage: string;
  locale: "en" | "de" | "fr";
  targetRole: string | null;
  extractedFacts: Record<string, unknown>;
  uncertainFacts: Record<string, unknown>;
  pendingQuestions: Array<{ id: string; field?: string; text: string; required: boolean; reason?: string }>;
  skippedQuestionIds: string[];
  confirmedQuestionIds: string[];
};
