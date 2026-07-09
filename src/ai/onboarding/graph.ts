import type { OnboardingGraphState } from "@/ai/onboarding/state";
import { isOnboardingInScope, isHighImpactField } from "@/lib/onboarding/guards";
import type { OnboardingQuestion, OnboardingQuestionPlan } from "@/lib/onboarding/types";

function pickMissingQuestions(state: OnboardingGraphState): OnboardingQuestion[] {
  const questions: OnboardingQuestion[] = [];
  const facts = state.extractedFacts;
  const uncertain = state.uncertainFacts;

  if (!facts.fullName) {
    questions.push({ id: "fullName", field: "fullName", text: "What name should we use on your profile?", required: true, reason: "Needed to identify the candidate profile." });
  }

  if (!facts.primaryRole && state.targetRole) {
    questions.push({ id: "primaryRole", field: "primaryRole", text: `Should we set your target role to ${state.targetRole}?`, required: true, reason: "Confirms the role the rest of onboarding should optimize for." });
  }

  if (!facts.preferredLocation) {
    questions.push({ id: "preferredLocation", field: "preferredLocation", text: "Which location are you targeting for your next role?", required: true, reason: "Location is a core matching signal." });
  }

  if (!facts.workPermitStatus && uncertain.workPermitStatus) {
    questions.push({ id: "workPermitStatus", field: "workPermitStatus", text: "What is your work permit status in Switzerland?", required: true, reason: "Permit status affects job eligibility." });
  }

  if (!facts.contractPreference) {
    questions.push({ id: "contractPreference", field: "contractPreference", text: "Do you prefer permanent or fixed-term work?", required: false, reason: "This helps refine matching." });
  }

  return questions.slice(0, 4);
}

export function planNextOnboardingStep(state: OnboardingGraphState): OnboardingQuestionPlan | { redirect: string; reason: string } {
  if (!isOnboardingInScope(state.userMessage)) {
    return {
      redirect: "onboarding_scope_guard",
      reason: "The message is outside job-search onboarding scope."
    };
  }

  const questions = pickMissingQuestions(state).filter((question) => !state.skippedQuestionIds.includes(question.id));
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
