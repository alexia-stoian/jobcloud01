import { z } from "zod";

const profileFieldSchema = z.enum([
  "fullName",
  "currentJobSituation",
  "employmentObjective",
  "primaryRole",
  "preferredLocation",
  "contractPreference",
  "workRate",
  "workPermitStatus",
  "salaryExpectation"
]);

const qualificationCategorySchema = z.enum(["skill", "diploma", "certification", "qualification"]);

export const profileIntentSchema = z.discriminatedUnion("operation", [
  z.object({
    field: profileFieldSchema,
    operation: z.literal("set"),
    value: z.string().min(1)
  }),
  z.object({
    field: z.literal("salaryExpectation"),
    operation: z.literal("clear")
  }),
  z.object({
    field: z.literal("qualifications"),
    operation: z.literal("addItem"),
    category: qualificationCategorySchema,
    value: z.string().min(1)
  }),
  z.object({
    field: z.literal("qualifications"),
    operation: z.literal("removeItem"),
    category: qualificationCategorySchema,
    value: z.string().min(1)
  })
]);

export const interpretRequestSchema = z.object({
  message: z.string().min(1),
  locale: z.enum(["en", "de", "fr"]).default("en")
});

export const confirmRequestSchema = z.object({
  intents: z.array(profileIntentSchema).min(1),
  locale: z.enum(["en", "de", "fr"]).default("en"),
  confirmationAccepted: z.boolean(),
  confirmationId: z.string().min(6)
});
