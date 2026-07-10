import { db } from "@/lib/db";
import { extractCvFacts } from "@/lib/cv/extract";

function truthyText(value: string | null | undefined): value is string {
  return Boolean(value && value.trim().length > 0);
}

export async function upsertOnboardingCvExtraction(input: {
  userId: string;
  cvText: string;
  fileName?: string;
  mimeType?: string;
  locale: "en" | "de" | "fr";
}) {
  const extracted = extractCvFacts(input.cvText);

  try {
    console.log("[CV Extraction] Starting upsert for userId:", input.userId);
    console.log("[CV Extraction] Extracted facts:", JSON.stringify(extracted.facts, null, 2));

    const session = await db.onboardingSession.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        locale: input.locale,
        currentStep: "questioning",
        cvFileName: input.fileName ?? null,
        cvMimeType: input.mimeType ?? null,
        targetRole: extracted.facts.primaryRole,
        cvExtractedFacts: extracted.facts,
        cvUncertainFacts: extracted.uncertainFacts,
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

    const profile = await db.candidateProfile.findUnique({
      where: { userId: input.userId },
      select: { id: true, fullName: true, primaryRole: true, preferredLocation: true }
    });

    const profileSeeds = {
      fullName: truthyText(profile?.fullName) ? profile.fullName : null,
      primaryRole: truthyText(profile?.primaryRole) ? profile.primaryRole : null,
      preferredLocation: truthyText(profile?.preferredLocation) ? profile.preferredLocation : null
    };

    console.log("[CV Extraction] Profile seeds:", profileSeeds);

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
