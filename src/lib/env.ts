import { z } from "zod";

/**
 * Parse an env string into a boolean flag. Any value other than the literal
 * string "true" (including undefined) is treated as `false` so the flag defaults
 * safely to disabled and never throws on unexpected values.
 */
const booleanFlag = z
  .string()
  .optional()
  .transform((value) => value === "true");

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  AUTH_URL: z.string().url().optional(),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  EMAIL_FROM: z.string().email().default("noreply@jobcloud01.local"),
  EMAIL_PROVIDER: z.enum(["console"]).default("console"),
  // Amazon Bedrock powers ALL LLM features (onboarding assistant, sourcing,
  // signals, CV extraction, guidance, interview). API key is a Bearer token;
  // region + model id resolve the InvokeModel endpoint.
  AWS_BEARER_TOKEN_BEDROCK: z.string().min(1).optional(),
  BEDROCK_REGION: z.string().min(1).default("eu-west-1"),
  BEDROCK_MODEL_ID: z.string().min(1).default("eu.anthropic.claude-sonnet-5"),
  // Bedrock AgentCore runtime ARN powering the Career Guide assistant chat.
  // Invoked with SigV4 (inbound auth = AWS_IAM) from the standard credential chain.
  CAREERGUIDE_RUNTIME_ARN: z.string().min(1).optional(),
  // Bedrock AgentCore runtime ARN powering the Application Coach (cover letters
  // + interview practice). Same SigV4/AWS_IAM inbound auth as Career Guide.
  APPLICATIONCOACH_RUNTIME_ARN: z.string().min(1).optional(),
  // Recruiter-signals dev/admin/recruiter gate. Defaults OFF: the admin API is
  // invisible (404) and the panel never renders unless explicitly enabled.
  SIGNALS_ADMIN_ENABLED: booleanFlag,
  // Optional comma-separated allowlist of user ids permitted to use the admin API.
  SIGNALS_ADMIN_USER_IDS: z.string().optional(),
  // Client-visible mirror of the gate (inlined by Next.js at build time).
  NEXT_PUBLIC_SIGNALS_ADMIN: booleanFlag
});

export const env = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  AUTH_URL: process.env.AUTH_URL,
  APP_BASE_URL: process.env.APP_BASE_URL,
  EMAIL_FROM: process.env.EMAIL_FROM,
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
  AWS_BEARER_TOKEN_BEDROCK: process.env.AWS_BEARER_TOKEN_BEDROCK,
  BEDROCK_REGION: process.env.BEDROCK_REGION,
  BEDROCK_MODEL_ID: process.env.BEDROCK_MODEL_ID,
  CAREERGUIDE_RUNTIME_ARN: process.env.CAREERGUIDE_RUNTIME_ARN,
  APPLICATIONCOACH_RUNTIME_ARN: process.env.APPLICATIONCOACH_RUNTIME_ARN,
  SIGNALS_ADMIN_ENABLED: process.env.SIGNALS_ADMIN_ENABLED,
  SIGNALS_ADMIN_USER_IDS: process.env.SIGNALS_ADMIN_USER_IDS,
  NEXT_PUBLIC_SIGNALS_ADMIN: process.env.NEXT_PUBLIC_SIGNALS_ADMIN
});
