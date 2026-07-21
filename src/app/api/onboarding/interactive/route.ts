import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import { computeCompletion } from "@/lib/profile/completion-gate";
import { getInteractiveQuestionStateForMode } from "@/lib/onboarding/interactive";
import { canConfirmOnboardingField } from "@/lib/onboarding/confirm-policy";
import { generateTargetRoleQuestion } from "@/lib/onboarding/detect-target-role";
import { classifySectorAndGenerateFields } from "@/lib/onboarding/sector-fields";
import { createInitialAssistantState } from "@/types/assistant-state";
import { runInferenceSafely } from "@/lib/ai/signals/hook";

type AnswerBody = {
  field?: string;
  value?: string;
};

type NormalizedLocale = "en" | "de" | "fr";

/** Fields that represent the candidate's target role (Phase 10 dual-write source). */
const ROLE_FIELDS = new Set(["primaryRole", "targetRoles"]);

function normalizeLocale(locale: string | null | undefined): NormalizedLocale {
  return locale === "de" || locale === "fr" ? locale : "en";
}

function hasFieldValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Sentinel answer value the CV-gate question sends when the user taps
 * "I don't have a CV". It is NOT a real role — the POST handler intercepts it,
 * records the decline, and advances to the open-ended role question.
 */
const NO_CV_SENTINEL = "__no_cv__";

/** Read whether the user has declined the CV upload (persisted in assistantState). */
function readCvDeclined(assistantState: unknown): boolean {
  return Boolean(
    assistantState &&
      typeof assistantState === "object" &&
      (assistantState as Record<string, unknown>).cvDeclined === true
  );
}

/**
 * STEP 1 of onboarding — cheerful, localized copy that asks ONLY for the CV.
 * The user either uploads (➕ button) or taps the single "I don't have a CV"
 * option; there is no role question here yet (D-09, EN/DE/FR per D-08).
 */
const CV_GATE_BACKSTORY: Record<NormalizedLocale, string> = {
  en: "Welcome aboard — I'm thrilled to help you land your next role! 🎉🚀",
  de: "Willkommen — ich freue mich riesig, dir bei deinem nächsten Job zu helfen! 🎉🚀",
  fr: "Bienvenue — ravi de t'aider à décrocher ton prochain poste ! 🎉🚀"
};

const CV_GATE_PROMPT: Record<NormalizedLocale, string> = {
  en: "Let's kick things off with your CV! 📄✨ Tap the ➕ button below to upload it and I'll tailor everything to you. Don't have one handy? No problem — just tap the button below! 🙌",
  de: "Starten wir mit deinem Lebenslauf! 📄✨ Tippe unten auf ➕, um ihn hochzuladen, und ich passe alles an dich an. Keinen zur Hand? Kein Problem — tippe einfach unten auf die Schaltfläche! 🙌",
  fr: "Commençons par ton CV ! 📄✨ Appuie sur le bouton ➕ ci-dessous pour le téléverser et je personnaliserai tout pour toi. Tu n'en as pas sous la main ? Pas de souci — appuie simplement sur le bouton ci-dessous ! 🙌"
};

const CV_GATE_OPTION_LABEL: Record<NormalizedLocale, string> = {
  en: "I don't have a CV 🙅",
  de: "Ich habe keinen Lebenslauf 🙅",
  fr: "Je n'ai pas de CV 🙅"
};

/** Cheerful, localized backstory once a CV has been shared, before the role ask. */
const CV_DONE_ROLE_BACKSTORY: Record<NormalizedLocale, string> = {
  en: "Awesome, thanks for sharing your CV! 🎯",
  de: "Super, danke für deinen Lebenslauf! 🎯",
  fr: "Génial, merci pour ton CV ! 🎯"
};

type SectorPreferencesShape = {
  sector?: unknown;
  usesDefaultFields?: unknown;
  generatedLocale?: unknown;
  generatedForRole?: unknown;
  fields?: unknown;
};

/**
 * Decide which post-CV preference flow the engine should serve from the persisted
 * sector decision:
 *  - a resolved non-engineer sector (sector slug + generated fields) → universal-6
 *    subset (returns `false`).
 *  - engineer/default OR no decision yet (empty `{}`) → the full existing flow
 *    (returns `undefined`, so `getInteractiveQuestionStateForMode` keeps the
 *    unchanged POST_CV_PREFERENCE_FLOW — Pitfall 5).
 */
function deriveUsesDefaultFields(sectorPreferences: unknown): boolean | undefined {
  if (!sectorPreferences || typeof sectorPreferences !== "object") {
    return undefined;
  }
  const sp = sectorPreferences as SectorPreferencesShape;
  if (
    typeof sp.sector === "string" &&
    sp.sector.trim().length > 0 &&
    Array.isArray(sp.fields) &&
    sp.fields.length > 0
  ) {
    return false;
  }
  return undefined;
}

type InteractiveProfile = {
  fullName: string | null;
  currentJobSituation: string | null;
  employmentObjective: string | null;
  primaryRole: string | null;
  preferredLocation: string | null;
  targetRoles: string | null;
  targetSeniority: string | null;
  targetIndustries: string | null;
  preferredWorkModel: string | null;
  contractPreference: string | null;
  workRate: string | null;
  workPermitStatus: string | null;
  salaryExpectation: string | null;
  visaSponsorship: string | null;
  relocationWillingness: string | null;
  commuteRadius: string | null;
  locale: string | null;
  sectorPreferences: unknown;
};

type InteractiveOnboarding = {
  cvFileName: string | null;
  cvExtractedFacts: unknown;
} | null;

/**
 * Resolve the next onboarding ask, enforcing CV-first ordering:
 *  - Before a target role exists, the FIRST ask is the target-role question —
 *    a CV-tailored MCQ when CV facts are present, otherwise open-ended (D-01/D-08).
 *    It is rendered on the `primaryRole` field so the existing POST persistence +
 *    primaryRole→targetRoles mirror handle the answer (no field-union change).
 *  - Once the role is set, the engine serves the universal-6 subset for a resolved
 *    non-engineer sector, or the unchanged full flow for engineer/default.
 */
async function resolveInteractiveAsk(
  profile: InteractiveProfile | null,
  onboarding: InteractiveOnboarding,
  cvDeclined: boolean
): Promise<{
  question: unknown;
  done: boolean;
  hasCvUpload: boolean;
  completedFields: string[];
  missingFields: string[];
}> {
  const hasCvUpload = Boolean(
    onboarding?.cvFileName ||
      (onboarding?.cvExtractedFacts &&
        Object.keys(onboarding.cvExtractedFacts as Record<string, unknown>).length > 0)
  );
  const locale = normalizeLocale(profile?.locale);

  const profileLike = {
    fullName: profile?.fullName,
    currentJobSituation: profile?.currentJobSituation,
    employmentObjective: profile?.employmentObjective,
    primaryRole: profile?.primaryRole,
    preferredLocation: profile?.preferredLocation,
    targetRoles: profile?.targetRoles,
    targetSeniority: profile?.targetSeniority,
    targetIndustries: profile?.targetIndustries,
    preferredWorkModel: profile?.preferredWorkModel,
    contractPreference: profile?.contractPreference,
    workRate: profile?.workRate,
    workPermitStatus: profile?.workPermitStatus,
    salaryExpectation: profile?.salaryExpectation,
    visaSponsorship: profile?.visaSponsorship,
    relocationWillingness: profile?.relocationWillingness,
    commuteRadius: profile?.commuteRadius
  };

  const roleIsSet = hasFieldValue(profile?.primaryRole) || hasFieldValue(profile?.targetRoles);

  if (!roleIsSet) {
    const baseState = getInteractiveQuestionStateForMode(profileLike, { hasCvUpload });

    // STEP 1 — no CV yet and the user hasn't declined one: ask ONLY for the CV.
    if (!hasCvUpload && !cvDeclined) {
      return {
        question: {
          id: "primaryRole",
          field: "primaryRole",
          backstory: CV_GATE_BACKSTORY[locale],
          prompt: CV_GATE_PROMPT[locale],
          options: [{ value: NO_CV_SENTINEL, label: CV_GATE_OPTION_LABEL[locale] }],
          allowCustom: true
        },
        done: false,
        hasCvUpload,
        completedFields: baseState.completedFields,
        missingFields: baseState.missingFields
      };
    }

    // STEP 2 — role question. CV present → CV-tailored MCQ; declined (no CV) →
    // open-ended (D-01/D-08). Backstory is CV-aware; the declined branch lets the
    // self-contained open-ended prompt speak for itself.
    const cvFacts = hasCvUpload
      ? ((onboarding?.cvExtractedFacts as Record<string, unknown> | null) ?? null)
      : null;
    const generated = await generateTargetRoleQuestion({ locale, cvFacts });
    return {
      question: {
        id: "primaryRole",
        field: "primaryRole",
        backstory: hasCvUpload ? CV_DONE_ROLE_BACKSTORY[locale] : "",
        prompt: generated.prompt,
        options: generated.options,
        allowCustom: true
      },
      done: false,
      hasCvUpload,
      completedFields: baseState.completedFields,
      missingFields: baseState.missingFields
    };
  }

  const usesDefaultFields = deriveUsesDefaultFields(profile?.sectorPreferences);
  const state = getInteractiveQuestionStateForMode(profileLike, { hasCvUpload, usesDefaultFields });
  return {
    question: state.question,
    done: state.done,
    hasCvUpload,
    completedFields: state.completedFields,
    missingFields: state.missingFields
  };
}

/**
 * One-shot sector generation (D-03). Fires when a target role has just been set in
 * BOTH stores (the Phase 10 dual-write event). Idempotent: skips when a sector set
 * already exists for this exact role+locale (T-12-07). On the engineer/default
 * short-circuit or an LLM null (D-02), leaves `sectorPreferences` empty (`{}`) and
 * returns null. Every read/write is scoped to the authenticated `userId` (V4).
 *
 * @returns the persisted sectorPreferences object when generation wrote fields,
 *          otherwise null (no change).
 */
async function maybeGenerateSectorFields(args: {
  userId: string;
  targetRole: string;
  locale: NormalizedLocale;
  cvContext?: string;
  currentSectorPreferences: unknown;
}): Promise<Record<string, unknown> | null> {
  const { userId, targetRole, locale, cvContext, currentSectorPreferences } = args;

  const current = (currentSectorPreferences && typeof currentSectorPreferences === "object"
    ? currentSectorPreferences
    : {}) as SectorPreferencesShape;
  if (
    typeof current.sector === "string" &&
    current.sector.trim().length > 0 &&
    current.generatedForRole === targetRole &&
    current.generatedLocale === locale
  ) {
    return null;
  }

  const set = await classifySectorAndGenerateFields({ targetRole, locale, cvContext });

  // LLM null (D-02) or engineer/default short-circuit → keep sectorPreferences {}.
  if (!set || set.usesDefaultFields || set.fields.length === 0) {
    return null;
  }

  const sectorPreferences = {
    sector: set.sector,
    generatedLocale: set.generatedLocale,
    generatedForRole: targetRole,
    fields: set.fields
  };

  await db.candidateProfile.update({
    where: { userId },
    data: { sectorPreferences: JSON.parse(JSON.stringify(sectorPreferences)) }
  });

  return sectorPreferences;
}

function asksForInternalDetails(input: string): boolean {
  const text = input.toLowerCase();
  const patterns = [
    /training data/,
    /trained on/,
    /system prompt/,
    /hidden prompt/,
    /internal instruction/,
    /chain[- ]of[- ]thought/,
    /api key/,
    /model (name|config|configuration)/,
    /private context/,
    /reveal (your|the) (prompt|instructions|rules)/
  ];

  return patterns.some((pattern) => pattern.test(text));
}

async function ensureOnboardingSession(userId: string, locale: "en" | "de" | "fr"): Promise<void> {
  try {
    const existing = await db.onboardingSession.findUnique({ where: { userId } });
    if (existing) {
      return;
    }

    await db.onboardingSession.create({
      data: {
        userId,
        locale,
        currentStep: "questioning",
        conversationHistory: [],
        pendingQuestions: [],
        skippedQuestionIds: [],
        confirmedQuestionIds: []
      }
    });
  } catch {
    // Keep interactive onboarding available even if optional local onboarding tables are missing.
  }
}

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      fullName: true,
      currentJobSituation: true,
      employmentObjective: true,
      primaryRole: true,
      preferredLocation: true,
      targetRoles: true,
      targetSeniority: true,
      targetIndustries: true,
      preferredWorkModel: true,
      contractPreference: true,
      workRate: true,
      workPermitStatus: true,
      salaryExpectation: true,
      visaSponsorship: true,
      relocationWillingness: true,
      commuteRadius: true,
      locale: true,
      sectorPreferences: true,
      assistantState: true,
      isMinimallyComplete: true,
      missingCriticalFields: true
    }
  });

  const locale = (profile?.locale === "de" || profile?.locale === "fr" ? profile.locale : "en") as "en" | "de" | "fr";
  await ensureOnboardingSession(session.user.id, locale);

  const onboarding = await db.onboardingSession.findUnique({
    where: { userId: session.user.id },
    select: {
      cvFileName: true,
      cvExtractedFacts: true
    }
  });

  const ask = await resolveInteractiveAsk(
    profile
      ? {
          fullName: profile.fullName,
          currentJobSituation: profile.currentJobSituation,
          employmentObjective: profile.employmentObjective,
          primaryRole: profile.primaryRole,
          preferredLocation: profile.preferredLocation,
          targetRoles: profile.targetRoles,
          targetSeniority: profile.targetSeniority,
          targetIndustries: profile.targetIndustries,
          preferredWorkModel: profile.preferredWorkModel,
          contractPreference: profile.contractPreference,
          workRate: profile.workRate,
          workPermitStatus: profile.workPermitStatus,
          salaryExpectation: profile.salaryExpectation,
          visaSponsorship: profile.visaSponsorship,
          relocationWillingness: profile.relocationWillingness,
          commuteRadius: profile.commuteRadius,
          locale: profile.locale,
          sectorPreferences: profile.sectorPreferences
        }
      : null,
    onboarding,
    readCvDeclined(profile?.assistantState)
  );

  return NextResponse.json({
    question: ask.question,
    done: ask.done,
    hasCvUpload: ask.hasCvUpload,
    completedFields: ask.completedFields,
    missingFields: ask.missingFields,
    completion: {
      isMinimallyComplete: profile?.isMinimallyComplete ?? false,
      missingCriticalFields: (profile?.missingCriticalFields as string[] | undefined) ?? []
    }
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as AnswerBody;
  const field = body.field?.trim() ?? "";
  const value = body.value?.trim() ?? "";

  if (asksForInternalDetails(value)) {
    return NextResponse.json({
      blocked: true,
      message: "I cannot share internal instructions or training details. I can continue helping with your job-search profile right away."
    });
  }

  if (!field || !value || !canConfirmOnboardingField(field)) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  // Guard against stale sessions: a valid JWT can outlive its User row (e.g. after
  // a DB reset). Creating a profile for a non-existent user violates the FK and
  // 500s. Verify the user exists and return 401 so the client re-authenticates.
  const userExists = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true }
  });
  if (!userExists) {
    return NextResponse.json({ error: "session_invalid" }, { status: 401 });
  }

  // CV-gate decline (Phase 12, Step 1→2): the user tapped "I don't have a CV".
  // Record the decline in assistantState (NO role is written from the sentinel)
  // and advance to the open-ended role question. Owner-scoped throughout.
  if (field === "primaryRole" && value === NO_CV_SENTINEL) {
    const existing = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      select: { assistantState: true }
    });
    const prevState =
      existing?.assistantState && typeof existing.assistantState === "object"
        ? (existing.assistantState as Record<string, unknown>)
        : (createInitialAssistantState() as unknown as Record<string, unknown>);

    await db.candidateProfile.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        locale: "en",
        assistantState: JSON.parse(
          JSON.stringify({ ...createInitialAssistantState(), cvDeclined: true })
        )
      },
      update: {
        assistantState: JSON.parse(JSON.stringify({ ...prevState, cvDeclined: true }))
      }
    });

    const declined = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      select: {
        fullName: true,
        currentJobSituation: true,
        employmentObjective: true,
        primaryRole: true,
        preferredLocation: true,
        targetRoles: true,
        targetSeniority: true,
        targetIndustries: true,
        preferredWorkModel: true,
        contractPreference: true,
        workRate: true,
        workPermitStatus: true,
        salaryExpectation: true,
        visaSponsorship: true,
        relocationWillingness: true,
        commuteRadius: true,
        locale: true,
        sectorPreferences: true,
        isMinimallyComplete: true,
        missingCriticalFields: true
      }
    });
    await ensureOnboardingSession(session.user.id, normalizeLocale(declined?.locale));
    const declinedOnboarding = await db.onboardingSession.findUnique({
      where: { userId: session.user.id },
      select: { cvFileName: true, cvExtractedFacts: true }
    });

    const ask = await resolveInteractiveAsk(
      declined
        ? {
            fullName: declined.fullName,
            currentJobSituation: declined.currentJobSituation,
            employmentObjective: declined.employmentObjective,
            primaryRole: declined.primaryRole,
            preferredLocation: declined.preferredLocation,
            targetRoles: declined.targetRoles,
            targetSeniority: declined.targetSeniority,
            targetIndustries: declined.targetIndustries,
            preferredWorkModel: declined.preferredWorkModel,
            contractPreference: declined.contractPreference,
            workRate: declined.workRate,
            workPermitStatus: declined.workPermitStatus,
            salaryExpectation: declined.salaryExpectation,
            visaSponsorship: declined.visaSponsorship,
            relocationWillingness: declined.relocationWillingness,
            commuteRadius: declined.commuteRadius,
            locale: declined.locale,
            sectorPreferences: declined.sectorPreferences
          }
        : null,
      declinedOnboarding,
      true
    );

    return NextResponse.json({
      success: true,
      saved: { field, value },
      question: ask.question,
      done: ask.done,
      hasCvUpload: ask.hasCvUpload,
      completedFields: ask.completedFields,
      missingFields: ask.missingFields,
      completion: {
        isMinimallyComplete: declined?.isMinimallyComplete ?? false,
        missingCriticalFields: (declined?.missingCriticalFields as string[] | undefined) ?? []
      }
    });
  }

  // The structured "Which role should we optimize your profile for first?"
  // question writes `primaryRole`, but it is semantically the candidate's TARGET
  // role. Mirror it into `targetRoles` (the Profile > Preferences field) when that
  // field is still empty, so choosing a role here populates Target Roles too.
  // Only-when-empty avoids clobbering an explicitly-answered `targetRoles`
  // (the post-CV flow asks it separately) or a later manual edit. This endpoint
  // only handles structured Q&A answers — CV extraction uses a different route —
  // so it never mirrors a CV-derived current role.
  const writeData: Record<string, string> = { [field]: value };
  // Track whether this answer is the one that FIRST sets the target role, so the
  // sector generation fires exactly once (idempotent, no per-request regeneration).
  let roleWasUnset = false;
  if (ROLE_FIELDS.has(field)) {
    const existing = await db.candidateProfile.findUnique({
      where: { userId: session.user.id },
      select: { targetRoles: true }
    });
    const hasTargetRoles = typeof existing?.targetRoles === "string" && existing.targetRoles.trim().length > 0;
    roleWasUnset = !hasTargetRoles;
    if (field === "primaryRole" && !hasTargetRoles) {
      writeData.targetRoles = value;
    }
  }

  const profile = await db.candidateProfile.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      locale: "en",
      assistantState: JSON.parse(JSON.stringify(createInitialAssistantState())),
      ...writeData
    },
    update: {
      ...writeData
    }
  });

  const completion = computeCompletion(profile);

  const updatedProfile = await db.candidateProfile.update({
    where: { id: profile.id },
    data: {
      isMinimallyComplete: completion.isMinimallyComplete,
      missingCriticalFields: completion.missingCriticalFields,
      lastCompletionCheckAt: new Date()
    },
    select: {
      fullName: true,
      currentJobSituation: true,
      employmentObjective: true,
      primaryRole: true,
      preferredLocation: true,
      targetRoles: true,
      targetSeniority: true,
      targetIndustries: true,
      preferredWorkModel: true,
      contractPreference: true,
      workRate: true,
      workPermitStatus: true,
      salaryExpectation: true,
      visaSponsorship: true,
      relocationWillingness: true,
      commuteRadius: true,
      locale: true,
      sectorPreferences: true,
      assistantState: true,
      isMinimallyComplete: true,
      missingCriticalFields: true
    }
  });

  await ensureOnboardingSession(session.user.id, (updatedProfile.locale === "de" || updatedProfile.locale === "fr" ? updatedProfile.locale : "en") as "en" | "de" | "fr");

  const onboarding = await db.onboardingSession.findUnique({
    where: { userId: session.user.id },
    select: {
      cvFileName: true,
      cvExtractedFacts: true
    }
  });

  try {
    const onboardingSession = await db.onboardingSession.findUnique({ where: { userId: session.user.id } });
    if (onboardingSession) {
      const confirmedQuestionIds = Array.isArray(onboardingSession.confirmedQuestionIds)
        ? onboardingSession.confirmedQuestionIds.filter((id): id is string => typeof id === "string")
        : [];

      if (!confirmedQuestionIds.includes(field)) {
        confirmedQuestionIds.push(field);
      }

      await db.onboardingSession.update({
        where: { userId: session.user.id },
        data: {
          currentStep: "questioning",
          confirmedQuestionIds,
          lastInteractedAt: new Date()
        }
      });
    }
  } catch {
    // Interactive profile filling should still work without onboarding session persistence.
  }

  // Phase 10 dual-write completion + one-shot sector trigger (D-03). When THIS
  // answer is the one that first set the target role, mirror it into
  // OnboardingSession.targetRole (only-when-empty, matching the CandidateProfile
  // mirror) so BOTH stores carry it, then fire sector generation exactly once.
  // `roleWasUnset` gates re-runs; a second identical answer never regenerates.
  let sectorPreferences: unknown = updatedProfile.sectorPreferences;
  if (ROLE_FIELDS.has(field) && roleWasUnset) {
    const effectiveTargetRole = hasFieldValue(updatedProfile.targetRoles)
      ? (updatedProfile.targetRoles as string)
      : value;

    let onboardingTargetRole: string | null = null;
    try {
      const roleSession = await db.onboardingSession.findUnique({
        where: { userId: session.user.id },
        select: { targetRole: true }
      });
      onboardingTargetRole = roleSession?.targetRole ?? null;
      if (!hasFieldValue(onboardingTargetRole)) {
        await db.onboardingSession.update({
          where: { userId: session.user.id },
          data: { targetRole: effectiveTargetRole, lastInteractedAt: new Date() }
        });
        onboardingTargetRole = effectiveTargetRole;
      }
    } catch {
      // OnboardingSession is optional; the CandidateProfile.targetRoles write already succeeded.
    }

    // Trigger only when BOTH stores carry the role (the Phase 10 dual-write event).
    if (hasFieldValue(updatedProfile.targetRoles) && hasFieldValue(onboardingTargetRole)) {
      const cvFactsObj =
        onboarding?.cvExtractedFacts && typeof onboarding.cvExtractedFacts === "object"
          ? (onboarding.cvExtractedFacts as Record<string, unknown>)
          : null;
      const cvContext =
        cvFactsObj && Object.keys(cvFactsObj).length > 0
          ? JSON.stringify(cvFactsObj).slice(0, 1200)
          : undefined;

      try {
        const written = await maybeGenerateSectorFields({
          userId: session.user.id,
          targetRole: effectiveTargetRole,
          locale: normalizeLocale(updatedProfile.locale),
          cvContext,
          currentSectorPreferences: updatedProfile.sectorPreferences
        });
        if (written) {
          sectorPreferences = written;
        }
      } catch {
        // Sector generation is best-effort (D-02): never block the onboarding answer flow.
      }
    }
  }

  const ask = await resolveInteractiveAsk(
    {
      fullName: updatedProfile.fullName,
      currentJobSituation: updatedProfile.currentJobSituation,
      employmentObjective: updatedProfile.employmentObjective,
      primaryRole: updatedProfile.primaryRole,
      preferredLocation: updatedProfile.preferredLocation,
      targetRoles: updatedProfile.targetRoles,
      targetSeniority: updatedProfile.targetSeniority,
      targetIndustries: updatedProfile.targetIndustries,
      preferredWorkModel: updatedProfile.preferredWorkModel,
      contractPreference: updatedProfile.contractPreference,
      workRate: updatedProfile.workRate,
      workPermitStatus: updatedProfile.workPermitStatus,
      salaryExpectation: updatedProfile.salaryExpectation,
      visaSponsorship: updatedProfile.visaSponsorship,
      relocationWillingness: updatedProfile.relocationWillingness,
      commuteRadius: updatedProfile.commuteRadius,
      locale: updatedProfile.locale,
      sectorPreferences
    },
    onboarding,
    readCvDeclined(updatedProfile.assistantState)
  );

  // Assess EVERY structured answer the user gives (not just interview answers).
  // Awaited so the signal state reliably persists before we respond; the hook
  // never throws, so it cannot break onboarding.
  await runInferenceSafely({
    userId: session.user.id,
    newInput: `${field}: ${value}`,
    source: "interactive_answer",
    cvFacts: onboarding?.cvExtractedFacts
  });

  return NextResponse.json({
    success: true,
    saved: {
      field,
      value
    },
    question: ask.question,
    done: ask.done,
    hasCvUpload: ask.hasCvUpload,
    completedFields: ask.completedFields,
    missingFields: ask.missingFields,
    completion: {
      isMinimallyComplete: updatedProfile.isMinimallyComplete,
      missingCriticalFields: (updatedProfile.missingCriticalFields as string[] | undefined) ?? []
    }
  });
}