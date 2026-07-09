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

  const profile = await db.candidateProfile.findUnique({
    where: { userId: input.userId },
    select: { id: true, fullName: true, primaryRole: true, preferredLocation: true }
  });

  const profileSeeds = {
    fullName: truthyText(profile?.fullName) ? profile.fullName : null,
    primaryRole: truthyText(profile?.primaryRole) ? profile.primaryRole : null,
    preferredLocation: truthyText(profile?.preferredLocation) ? profile.preferredLocation : null
  };

  return {
    session,
    extracted,
    profileSeeds
  };
}
