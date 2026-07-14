import type { SupportedLocale } from "@/i18n/config";

// Message structure
type OnboardingMessages = {
  questions: Record<string, { prompt: string; reason: string }>;
  errors: Record<string, string>;
};

// Inline translations to avoid JSON import issues at build time
const messages: Record<SupportedLocale, OnboardingMessages> = {
  en: {
    questions: {
      fullName: {
        prompt: "What name should we use on your profile?",
        reason: "Needed to identify the candidate profile."
      },
      primaryRole: {
        prompt: "Should we set your target role to {targetRole}?",
        reason: "Confirms the role the rest of onboarding should optimize for."
      },
      preferredLocation: {
        prompt: "Which location are you targeting for your next role?",
        reason: "Location is a core matching signal."
      },
      workPermitStatus: {
        prompt: "What is your work permit status in Switzerland?",
        reason: "Permit status affects job eligibility."
      },
      contractPreference: {
        prompt: "Do you prefer permanent or fixed-term work?",
        reason: "This helps refine matching."
      }
    },
    errors: {
      unauthorized: "Not authenticated. Please log in.",
      invalidPayload: "Invalid request. Please check your input.",
      notStarted: "Onboarding not started. Please upload a CV first.",
      notFound: "Session not found."
    }
  },
  de: {
    questions: {
      fullName: {
        prompt: "Welchen Namen sollen wir in Ihrem Profil speichern?",
        reason: "Notwendig zur Identifizierung des Kandidatenprofils."
      },
      primaryRole: {
        prompt: "Sollen wir Ihre Zielrolle auf {targetRole} setzen?",
        reason: "Bestaetigt die Rolle, auf die sich das restliche Onboarding konzentrieren soll."
      },
      preferredLocation: {
        prompt: "Welchen Ort zielt Ihre naechste Stelle an?",
        reason: "Standort ist ein zentrales Matching-Signal."
      },
      workPermitStatus: {
        prompt: "Wie ist Ihr Arbeitsbewilligungsstatus in der Schweiz?",
        reason: "Der Bewilligungsstatus beeinflusst die Stelleneignung."
      },
      contractPreference: {
        prompt: "Bevorzugen Sie dauerhafte oder befristete Vertraege?",
        reason: "Dies hilft, das Matching zu verfeinern."
      }
    },
    errors: {
      unauthorized: "Nicht authentifiziert. Bitte melden Sie sich an.",
      invalidPayload: "Ungueltige Anfrage. Bitte ueberpruefen Sie Ihre Eingabe.",
      notStarted: "Onboarding nicht gestartet. Bitte laden Sie zuerst einen CV hoch.",
      notFound: "Sitzung nicht gefunden."
    }
  },
  fr: {
    questions: {
      fullName: {
        prompt: "Quel nom devons-nous enregistrer dans votre profil ?",
        reason: "Necessaire pour identifier le profil du candidat."
      },
      primaryRole: {
        prompt: "Devons-nous definir votre role cible a {targetRole} ?",
        reason: "Confirme le role sur lequel le reste de l'onboarding doit se concentrer."
      },
      preferredLocation: {
        prompt: "Quel lieu visez-vous pour votre prochain poste ?",
        reason: "Le lieu est un signal de correspondance essentiel."
      },
      workPermitStatus: {
        prompt: "Quel est votre statut d'autorisation de travail en Suisse ?",
        reason: "Le statut d'autorisation affecte l'admissibilite au poste."
      },
      contractPreference: {
        prompt: "Preferez-vous un travail permanent ou a duree determinee ?",
        reason: "Cela aide a affiner la correspondance."
      }
    },
    errors: {
      unauthorized: "Non authentifie. Veuillez vous connecter.",
      invalidPayload: "Demande invalide. Veuillez verifier votre saisie.",
      notStarted: "Onboarding non commence. Veuillez d'abord telecharger un CV.",
      notFound: "Session non trouvee."
    }
  }
};

export function getQuestionPrompt(
  locale: SupportedLocale,
  fieldName: string,
  context?: Record<string, string>
): string {
  try {
    const prompt = messages[locale]?.questions[fieldName]?.prompt || fieldName;
    
    if (context) {
      let result = prompt;
      for (const [k, v] of Object.entries(context)) {
        result = result.replace(`{${k}}`, v);
      }
      return result;
    }
    
    return prompt;
  } catch {
    return fieldName;
  }
}

export function getQuestionReason(
  locale: SupportedLocale,
  fieldName: string
): string {
  try {
    return messages[locale]?.questions[fieldName]?.reason || "";
  } catch {
    return "";
  }
}

export function getErrorMessage(
  locale: SupportedLocale,
  errorKey: string
): string {
  try {
    return messages[locale]?.errors[errorKey] || errorKey;
  } catch {
    return errorKey;
  }
}
