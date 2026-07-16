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
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-5"),
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
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  SIGNALS_ADMIN_ENABLED: process.env.SIGNALS_ADMIN_ENABLED,
  SIGNALS_ADMIN_USER_IDS: process.env.SIGNALS_ADMIN_USER_IDS,
  NEXT_PUBLIC_SIGNALS_ADMIN: process.env.NEXT_PUBLIC_SIGNALS_ADMIN
});
