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

    // First, update the candidate profile with extracted data
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

    // Build update data from extracted facts - fill in ALL available data
    const profileUpdateData: Record<string, string | null> = {};
    
    if (extracted.facts.fullName) profileUpdateData.fullName = extracted.facts.fullName;
    if (extracted.facts.primaryRole) profileUpdateData.primaryRole = extracted.facts.primaryRole;
    if (extracted.facts.currentJobSituation) profileUpdateData.currentJobSituation = extracted.facts.currentJobSituation;
    if (extracted.facts.employmentObjective) profileUpdateData.employmentObjective = extracted.facts.employmentObjective;
    if (extracted.facts.preferredLocation) profileUpdateData.preferredLocation = extracted.facts.preferredLocation;
    if (extracted.facts.contractPreference) profileUpdateData.contractPreference = extracted.facts.contractPreference;
    if (extracted.facts.workRate) profileUpdateData.workRate = extracted.facts.workRate;
    if (extracted.facts.workPermitStatus) profileUpdateData.workPermitStatus = extracted.facts.workPermitStatus;
    if (extracted.facts.salaryExpectation) profileUpdateData.salaryExpectation = extracted.facts.salaryExpectation;

    console.log("[CV Extraction] Profile update data:", profileUpdateData);

    // Update profile with extracted data
    const updatedProfile = await db.candidateProfile.update({
      where: { userId: input.userId },
      data: profileUpdateData,
      include: { qualifications: true }
    });

    console.log("[CV Extraction] Profile updated successfully");

    // Delete old qualifications and add new ones from CV extraction
    if (extracted.facts.qualifications.length > 0) {
      console.log("[CV Extraction] Extracted qualifications count:", extracted.facts.qualifications.length);
      
      // Delete existing qualifications
      await db.profileQualification.deleteMany({
        where: { profileId: updatedProfile.id }
      });

      // Add new qualifications from CV
      const qualificationsData = extracted.facts.qualifications.map((qual) => ({
        profileId: updatedProfile.id,
        category: qual.category,
        value: qual.value
      }));

      await db.profileQualification.createMany({
        data: qualificationsData
      });

      console.log("[CV Extraction] Qualifications saved to profile");
    }

    // Now update/create onboarding session with CV metadata
    const session = await db.onboardingSession.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        profileId: updatedProfile.id,
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
        profileId: updatedProfile.id,
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

    const profileSeeds = {
      fullName: updatedProfile.fullName,
      primaryRole: updatedProfile.primaryRole,
      preferredLocation: updatedProfile.preferredLocation,
      currentJobSituation: updatedProfile.currentJobSituation,
      employmentObjective: updatedProfile.employmentObjective,
      contractPreference: updatedProfile.contractPreference,
      workRate: updatedProfile.workRate,
      workPermitStatus: updatedProfile.workPermitStatus,
      salaryExpectation: updatedProfile.salaryExpectation,
      qualificationsCount: extracted.facts.qualifications.length
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
