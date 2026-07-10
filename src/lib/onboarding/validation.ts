import { z } from "zod";

const localeSchema = z.enum(["en", "de", "fr"]);

const factMapSchema = z.record(z.unknown()).default({});

const questionSchema = z.object({
  id: z.string().min(1),
  field: z.string().min(1).optional(),
  text: z.string().min(1),
  required: z.boolean(),
  reason: z.string().min(1).optional()
});

const conversationMessageSchema = z.object({
  role: z.enum(["assistant", "user"]),
  text: z.string().min(1),
  options: z.array(
    z.object({
      value: z.string().min(1),
      label: z.string().min(1),
      description: z.string().min(1).optional()
    })
  ).optional(),
  field: z.string().min(1).optional()
});

export const onboardingSessionSchema = z.object({
  userId: z.string().min(1),
  locale: localeSchema.default("en"),
  currentStep: z.enum(["cv_upload", "cv_extract", "questioning", "confirming", "complete"]),
  targetRole: z.string().min(1).nullable().default(null),
  cvFileName: z.string().min(1).nullable().default(null),
  cvMimeType: z.string().min(1).nullable().default(null),
  cvExtractedFacts: factMapSchema,
  cvUncertainFacts: factMapSchema,
  conversationHistory: z.array(conversationMessageSchema),
  pendingQuestions: z.array(questionSchema),
  skippedQuestionIds: z.array(z.string().min(1)),
  confirmedQuestionIds: z.array(z.string().min(1)),
  lastInteractedAt: z.string().datetime().nullable().default(null)
});

export function createOnboardingDefaultState(userId: string, locale: "en" | "de" | "fr" = "en") {
  return onboardingSessionSchema.parse({
    userId,
    locale,
    currentStep: "cv_upload",
    targetRole: null,
    cvFileName: null,
    cvMimeType: null,
    cvExtractedFacts: {},
    cvUncertainFacts: {},
    conversationHistory: [],
    pendingQuestions: [],
    skippedQuestionIds: [],
    confirmedQuestionIds: [],
    lastInteractedAt: null
  });
}
