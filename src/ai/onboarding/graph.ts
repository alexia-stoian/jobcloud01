import type { OnboardingGraphState } from "@/ai/onboarding/state";
import { isOnboardingInScope, isHighImpactField } from "@/lib/onboarding/guards";
import type { OnboardingQuestion, OnboardingQuestionPlan } from "@/lib/onboarding/types";
import type { SupportedLocale } from "@/i18n/config";
import { getQuestionPrompt, getQuestionReason } from "@/lib/onboarding/localization";

function pickMissingQuestions(state: OnboardingGraphState, locale: SupportedLocale): OnboardingQuestion[] {
  const questions: OnboardingQuestion[] = [];
  const facts = state.extractedFacts;
  const uncertain = state.uncertainFacts;

  if (!facts.fullName) {
    questions.push({ 
      id: "fullName", 
      field: "fullName", 
      text: getQuestionPrompt(locale, "fullName"), 
      required: true, 
      reason: getQuestionReason(locale, "fullName") 
    });
  }

  if (!facts.primaryRole && state.targetRole) {
    questions.push({ 
      id: "primaryRole", 
      field: "primaryRole", 
      text: getQuestionPrompt(locale, "primaryRole", { targetRole: state.targetRole }), 
      required: true, 
      reason: getQuestionReason(locale, "primaryRole") 
    });
  }

  if (!facts.preferredLocation) {
    questions.push({ 
      id: "preferredLocation", 
      field: "preferredLocation", 
      text: getQuestionPrompt(locale, "preferredLocation"), 
      required: true, 
      reason: getQuestionReason(locale, "preferredLocation") 
    });
  }

  if (!facts.workPermitStatus && uncertain.workPermitStatus) {
    questions.push({ 
      id: "workPermitStatus", 
      field: "workPermitStatus", 
      text: getQuestionPrompt(locale, "workPermitStatus"), 
      required: true, 
      reason: getQuestionReason(locale, "workPermitStatus") 
    });
  }

  if (!facts.contractPreference) {
    questions.push({ 
      id: "contractPreference", 
      field: "contractPreference", 
      text: getQuestionPrompt(locale, "contractPreference"), 
      required: false, 
      reason: getQuestionReason(locale, "contractPreference") 
    });
  }

  return questions.slice(0, 4);
}

export function planNextOnboardingStep(state: OnboardingGraphState): OnboardingQuestionPlan | { redirect: string; reason: string } {
  const locale = state.locale as SupportedLocale;
  
  if (!isOnboardingInScope(state.userMessage)) {
    return {
      redirect: "onboarding_scope_guard",
      reason: "The message is outside job-search onboarding scope."
    };
  }

  const questions = pickMissingQuestions(state, locale).filter((question) => !state.skippedQuestionIds.includes(question.id));
  const primaryFocus = questions[0]?.reason ?? "Keep onboarding moving with the next unresolved profile item.";

  if (questions.length === 0) {
    return {
      redirect: "onboarding_complete",
      reason: "No unresolved questions remain."
    };
  }

  return {
    questions: questions.map((question) => ({
      ...question,
      reason: question.reason || (isHighImpactField(question.field) ? "High-impact profile field." : undefined)
    })),
    primaryFocus
  };
}
