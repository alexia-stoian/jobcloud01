import { db } from "@/lib/db";
import { extractCvFacts } from "@/lib/cv/extract";

export async function upsertOnboardingCvExtraction(input: {
  userId: string;
  cvText: string;
  fileName?: string;
  mimeType?: string;
  locale: "en" | "de" | "fr";
}) {
  const extracted = await extractCvFacts(input.cvText);

  try {
    console.log("[CV Extraction] Starting upsert for userId:", input.userId);
    console.log("[CV Extraction] Extracted facts:", JSON.stringify(extracted.facts, null, 2));
    console.log("[CV Extraction] Uncertain facts:", JSON.stringify(extracted.uncertainFacts, null, 2));

    // Get or create the candidate profile
    // IMPORTANT: We do NOT write extracted facts to the profile yet - only to onboarding session
    let profile = await db.candidateProfile.findUnique({
      where: { userId: input.userId },
      select: { id: true }
    });

    if (!profile) {
      console.log("[CV Extraction] Creating new profile for userId:", input.userId);
      profile = await db.candidateProfile.create({
        data: {
          userId: input.userId,
          locale: input.locale
        }
      });
    }

    console.log("[CV Extraction] Profile ID:", profile.id);

    // Update/create onboarding session with CV metadata
    // Extracted facts stay ONLY in OnboardingSession until confirmed
    const session = await db.onboardingSession.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        profileId: profile.id,
        locale: input.locale,
        currentStep: "questioning",
        cvFileName: input.fileName ?? null,
        cvMimeType: input.mimeType ?? null,
        targetRole: extracted.facts.primaryRole,
        cvExtractedFacts: extracted.facts,
        cvUncertainFacts: extracted.uncertainFacts,
        conversationHistory: [],
        pendingQuestions: [],
        skippedQuestionIds: [],
        confirmedQuestionIds: [],
        lastInteractedAt: new Date()
      },
      update: {
        locale: input.locale,
        currentStep: "questioning",
        cvFileName: input.fileName ?? null,
        cvMimeType: input.mimeType ?? null,
        targetRole: extracted.facts.primaryRole,
        cvExtractedFacts: extracted.facts,
        cvUncertainFacts: extracted.uncertainFacts,
        lastInteractedAt: new Date()
      }
    });

    console.log("[CV Extraction] Session upsert succeeded");

    // Return seeds from extracted facts (not from profile - facts stay provisional)
    const profileSeeds = {
      fullName: extracted.facts.fullName ?? null,
      primaryRole: extracted.facts.primaryRole ?? null,
      preferredLocation: extracted.facts.preferredLocation ?? null,
      currentJobSituation: extracted.facts.currentJobSituation ?? null,
      employmentObjective: extracted.facts.employmentObjective ?? null,
      contractPreference: extracted.facts.contractPreference ?? null,
      workRate: extracted.facts.workRate ?? null,
      workPermitStatus: extracted.facts.workPermitStatus ?? null,
      salaryExpectation: extracted.facts.salaryExpectation ?? null,
      qualificationsCount: extracted.facts.qualifications?.length ?? 0
    };

    console.log("[CV Extraction] Profile seeds (from extracted facts only):", JSON.stringify(profileSeeds, null, 2));
    console.log("[CV Extraction] Upsert complete - returning results");

    return {
      session,
      extracted,
      profileSeeds
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[CV Extraction] Persist error:", errorMessage);
    console.error("[CV Extraction] Full error:", error);
    throw new Error(`Failed to persist CV extraction: ${errorMessage}`);
  }
}
