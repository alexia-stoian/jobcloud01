export type OnboardingEventType =
  | "upload_cv"
  | "extract_cv"
  | "extract_failed"
  | "plan_question"
  | "confirm_field"
  | "skip_question"
  | "resume_session"
  | "complete_onboarding"
  | "scope_violation"
  | "session_error";

export type OnboardingEventPayload = {
  userId: string;
  eventType: OnboardingEventType;
  timestamp: Date;
  context?: Record<string, string | number | boolean>;
  error?: string;
};

// In-memory event buffer for this request
const eventBuffer: OnboardingEventPayload[] = [];

export function recordOnboardingEvent(payload: OnboardingEventPayload): void {
  // Log to console in development
  if (process.env.NODE_ENV === "development") {
    console.log(`[ONBOARDING_EVENT] ${payload.eventType}:`, {
      userId: payload.userId,
      context: payload.context,
      error: payload.error
    });
  }

  // Add to buffer for batch persistence
  eventBuffer.push(payload);
}

export async function flushOnboardingEvents(): Promise<void> {
  if (eventBuffer.length === 0) return;

  try {
    // In a real implementation, you would persist these to a database or analytics service
    // For now, we'll just log them
    if (process.env.NODE_ENV === "development") {
      console.log(`[ONBOARDING_EVENTS_FLUSHED] ${eventBuffer.length} events`);
    }

    // Future: Persist to analytics table
    // await db.onboardingEvents.createMany({
    //   data: eventBuffer.map(e => ({
    //     userId: e.userId,
    //     eventType: e.eventType,
    //     context: e.context,
    //     error: e.error,
    //     createdAt: e.timestamp
    //   }))
    // });

    eventBuffer.length = 0;
  } catch (error) {
    console.error("[ONBOARDING_FLUSH_ERROR]", error);
  }
}

export function getEventBuffer(): OnboardingEventPayload[] {
  return [...eventBuffer];
}

export function clearEventBuffer(): void {
  eventBuffer.length = 0;
}

// Convenience functions for common events

export function logCvUpload(userId: string, fileName: string, mimeType: string): void {
  recordOnboardingEvent({
    userId,
    eventType: "upload_cv",
    timestamp: new Date(),
    context: { fileName, mimeType }
  });
}

export function logCvExtraction(userId: string, extractedFields: string[], uncertainFields: string[]): void {
  recordOnboardingEvent({
    userId,
    eventType: "extract_cv",
    timestamp: new Date(),
    context: { 
      extractedFieldCount: extractedFields.length,
      uncertainFieldCount: uncertainFields.length,
      totalExtracted: extractedFields.length
    }
  });
}

export function logCvExtractionError(userId: string, error: string): void {
  recordOnboardingEvent({
    userId,
    eventType: "extract_failed",
    timestamp: new Date(),
    error
  });
}

export function logQuestionPlanning(userId: string, plannedQuestions: string[], reason: string): void {
  recordOnboardingEvent({
    userId,
    eventType: "plan_question",
    timestamp: new Date(),
    context: { 
      questionCount: plannedQuestions.length,
      reason,
      count: plannedQuestions.length
    }
  });
}

export function logFieldConfirmation(userId: string, fieldName: string, value: string): void {
  recordOnboardingEvent({
    userId,
    eventType: "confirm_field",
    timestamp: new Date(),
    context: { fieldName, valueLength: value?.length }
  });
}

export function logQuestionSkipped(userId: string, questionId: string, fieldName: string): void {
  recordOnboardingEvent({
    userId,
    eventType: "skip_question",
    timestamp: new Date(),
    context: { questionId, fieldName }
  });
}

export function logSessionResume(userId: string, lastStep: string, resumedFrom: string): void {
  recordOnboardingEvent({
    userId,
    eventType: "resume_session",
    timestamp: new Date(),
    context: { lastStep, resumedFrom }
  });
}

export function logOnboardingComplete(userId: string, totalQuestionsAnswered: number, totalSkipped: number): void {
  recordOnboardingEvent({
    userId,
    eventType: "complete_onboarding",
    timestamp: new Date(),
    context: { totalQuestionsAnswered, totalSkipped, total: totalQuestionsAnswered + totalSkipped }
  });
}

export function logScopeViolation(userId: string, message: string, violationType: string): void {
  recordOnboardingEvent({
    userId,
    eventType: "scope_violation",
    timestamp: new Date(),
    context: { messageLength: message?.length, violationType }
  });
}

export function logSessionError(userId: string, error: string, context?: Record<string, string | number | boolean>): void {
  recordOnboardingEvent({
    userId,
    eventType: "session_error",
    timestamp: new Date(),
    error,
    context
  });
}
