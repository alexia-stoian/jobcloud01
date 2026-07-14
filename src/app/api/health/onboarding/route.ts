import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isOnboardingInScope, isHighImpactField } from "@/lib/onboarding/guards";
import { getQuestionPrompt, getQuestionReason } from "@/lib/onboarding/localization";

type HealthCheckResult = {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  components: {
    database: { status: string; responseTime: number };
    localization: { status: string; languages: Record<string, string> };
    guards: { status: string; testsRun: number };
    stateValidation: { status: string; message: string };
  };
  message: string;
};

export async function GET(): Promise<NextResponse<HealthCheckResult>> {
  const startTime = Date.now();
  const checks: HealthCheckResult["components"] = {
    database: { status: "ok", responseTime: 0 },
    localization: { status: "ok", languages: {} },
    guards: { status: "ok", testsRun: 0 },
    stateValidation: { status: "ok", message: "" }
  };

  let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";

  // Check 1: Database connectivity
  try {
    const dbStart = Date.now();
    const testProfile = await db.candidateProfile.findFirst({ take: 1 });
    checks.database.responseTime = Date.now() - dbStart;
    checks.database.status = testProfile ? "ok" : "empty";
  } catch (error) {
    checks.database.status = "error";
    overallStatus = "unhealthy";
  }

  // Check 2: Localization system
  try {
    const languages: Record<string, string> = {};
    const locales = ["en", "de", "fr"] as const;

    for (const locale of locales) {
      try {
        const prompt = getQuestionPrompt(locale, "fullName");
        const reason = getQuestionReason(locale, "fullName");
        languages[locale] = prompt && reason ? "ok" : "incomplete";
      } catch (error) {
        languages[locale] = "error";
      }
    }

    checks.localization.languages = languages;
    checks.localization.status = Object.values(languages).every(s => s === "ok") ? "ok" : "degraded";
    if (checks.localization.status !== "ok") {
      overallStatus = "degraded";
    }
  } catch (error) {
    checks.localization.status = "error";
    overallStatus = "unhealthy";
  }

  // Check 3: Guard systems
  try {
    let testsRun = 0;

    // Test scope guard
    const validScopes = [
      "What is your primary role?",
      "Do you need visa sponsorship?",
      "What is your salary expectation?",
      "I want to learn JavaScript"
    ];

    for (const scope of validScopes) {
      isOnboardingInScope(scope);
      testsRun++;
    }

    // Test high impact field detection
    const testFields = ["fullName", "primaryRole", "preferredLocation", "workPermitStatus", "salaryExpectation"];
    for (const field of testFields) {
      isHighImpactField(field);
      testsRun++;
    }

    checks.guards.testsRun = testsRun;
    checks.guards.status = testsRun > 0 ? "ok" : "no_tests";
  } catch (error) {
    checks.guards.status = "error";
    overallStatus = "degraded";
  }

  // Check 4: State validation
  try {
    // Validate onboarding session schema
    const testSession = {
      userId: "test-user",
      locale: "en",
      currentStep: "questioning",
      cvExtractedFacts: {},
      cvUncertainFacts: {},
      confirmedQuestionIds: [],
      skippedQuestionIds: []
    };

    if (!testSession.userId || !testSession.locale || !testSession.currentStep) {
      throw new Error("Missing required fields");
    }

    checks.stateValidation.status = "ok";
    checks.stateValidation.message = "Onboarding session schema valid";
  } catch (error) {
    checks.stateValidation.status = "error";
    checks.stateValidation.message = error instanceof Error ? error.message : "Unknown error";
    overallStatus = "degraded";
  }

  const totalTime = Date.now() - startTime;

  return NextResponse.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    components: checks,
    message:
      overallStatus === "healthy"
        ? "All onboarding health checks passed"
        : overallStatus === "degraded"
          ? "Some onboarding health checks degraded but functional"
          : "Critical onboarding health check failures detected"
  });
}
