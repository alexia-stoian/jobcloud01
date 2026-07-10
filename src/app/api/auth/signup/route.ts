import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword, generateTokenPair } from "@/auth/password";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { canReachDatabase } from "@/lib/db-health";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { sanitizeText } from "@/lib/security/input-sanitization";
import { buildVerifyEmailTemplate } from "@/lib/email/templates/auth";
import { recordAuthEvent } from "@/lib/audit/auth-events";
import { incrementMetric } from "@/lib/observability/metrics";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const ipKey = request.headers.get("x-forwarded-for") ?? "signup-local";
    if (!checkRateLimit(`signup:${ipKey}`, 20, 60_000)) {
      incrementMetric("auth.signup.rate_limited");
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      incrementMetric("auth.signup.invalid_payload");
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      incrementMetric("auth.signup.invalid_payload");
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }

    const databaseReachable = await canReachDatabase(env.DATABASE_URL);
    if (!databaseReachable) {
      incrementMetric("auth.signup.database_unavailable");
      return NextResponse.json(
        {
          error: "database_unavailable",
          message: "Signup is unavailable because the PostgreSQL database is not running on localhost:5432."
        },
        { status: 503 }
      );
    }

    const email = sanitizeText(parsed.data.email.toLowerCase());
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      incrementMetric("auth.signup.duplicate");
      return NextResponse.json({ error: "email_exists" }, { status: 409 });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const verify = generateTokenPair(60);

    const user = await db.user.create({
      data: {
        email,
        passwordHash,
        emailVerified: new Date(),
        profile: {
          create: {
            locale: "en",
            missingCriticalFields: [
              "currentJobSituation",
              "employmentObjective",
              "preferredLocation",
              "targetRoles",
              "targetSeniority",
              "targetIndustries",
              "preferredWorkModel",
              "contractPreference",
              "workRate",
              "workPermitStatus",
              "salaryExpectation",
              "visaSponsorship",
              "relocationWillingness",
              "commuteRadius"
            ]
          }
        },
        onboardingSession: {
          create: {
            locale: "en",
            currentStep: "cv_upload",
            cvExtractedFacts: {},
            cvUncertainFacts: {},
            conversationHistory: [],
            pendingQuestions: [],
            skippedQuestionIds: [],
            confirmedQuestionIds: []
          }
        },
        verifyTokens: {
          create: {
            identifier: email,
            tokenHash: verify.tokenHash,
            expires: verify.expiresAt
          }
        }
      }
    });

    await recordAuthEvent("signup_created", user.id, { email });
    incrementMetric("auth.signup.success");

    const emailMessage = buildVerifyEmailTemplate(verify.token);
    console.log({ type: "email", to: email, ...emailMessage });

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "";
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (
      errorName === "PrismaClientInitializationError" ||
      errorMessage.includes("Can't reach database server") ||
      errorMessage.includes("localhost:5432")
    ) {
      incrementMetric("auth.signup.database_unavailable");
      return NextResponse.json(
        {
          error: "database_unavailable",
          message: "Signup is unavailable because the PostgreSQL database is not running on localhost:5432."
        },
        { status: 503 }
      );
    }

    console.error(error);
    incrementMetric("auth.signup.failed");
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
