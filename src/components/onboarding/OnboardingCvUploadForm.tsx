"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import RecruiterSignalsPanel from "./RecruiterSignalsPanel";

type Props = {
  locale: "en" | "de" | "fr";
};

type ChatMessage = {
  role: "assistant" | "user";
  text: string;
  options?: Array<{ value: string; label: string; description?: string }>;
  field?: string;
};

type InteractiveQuestion = {
  id: string;
  field: string;
  backstory: string;
  prompt: string;
  placeholder?: string;
  options?: Array<{ value: string; label: string; description?: string }>;
  allowCustom: boolean;
};

type InteractiveResponse = {
  question: InteractiveQuestion | null;
  done: boolean;
  hasCvUpload?: boolean;
  history?: ChatMessage[];
  completedFields: string[];
  missingFields: string[];
  blocked?: boolean;
  message?: string;
  completion?: {
    isMinimallyComplete: boolean;
    missingCriticalFields: string[];
  };
};

type SourcingQuestionPayload = {
  id: string;
  prompt: string;
  options: Array<{ value: string; label: string; description?: string }>;
  allowCustom: boolean;
};

type SourcingResponse = {
  question?: SourcingQuestionPayload | null;
  notice?: string;
  done?: boolean;
  message?: string;
  answered?: Array<{ prompt: string; answerText: string }>;
  answeredCount?: number;
};

// Sector-mode delivery response (Phase 12). Shares the sourcing question payload
// shape but is served by a DISTINCT endpoint under the `sector:` prefix so the two
// modes never collide.
type SectorResponse = {
  question?: SourcingQuestionPayload | null;
  done?: boolean;
  answered?: Array<{ prompt: string; answerText: string }>;
  answeredCount?: number;
};

const UI_STRINGS = {
  en: {
    intro: "Great to meet you 🙂 I will guide you step-by-step and save each confirmed answer to your profile right away.",
    assistantUnavailable: "Assistant is temporarily unavailable. Please try again.",
    saveFailed: "I could not save that answer. Please try again.",
    blockedFallback: "I cannot share that. Let us continue with your profile.",
    answerFailed: "I could not answer that right now. Please try again.",
    readingCv: "Reading your CV...",
    fileReadFailed: "I could not read this file. Please try a PDF or plain .txt file.",
    cvSaveFailed: "CV parsed but I could not save the extracted information. Please try again.",
    cvAnalyzed: "Your CV has been analyzed and your profile has been filled with the information I could confidently detect. I will now ask the remaining preference questions needed to complete your profile.",
    cvUploadedNoFacts: "CV uploaded. I could not extract structured fields automatically - let us continue filling in your profile together.",
    uploadFailed: "Something went wrong uploading your CV. Please try again.",
    completeNoCv: "Excellent! 🎉 Your core profile is taking shape! Next, let's upload your CV so I can automatically extract your experience and fill in the remaining details. This saves you tons of time! ⚡",
    placeholderDefault: "Write your answer here",
    placeholderComplete: "Profile complete. You can still type changes anytime.",
    offTrackNudge: "That does not look like an answer to this question. Let us stay on track:",
    completionHelp: [
      "🎉 Your profile is now built and ready! I've filled it as completely as I can from your CV and your answers.",
      "",
      "Here's what I can actually help you with right now: 🚀",
      "",
      "- ✉️ Draft or tailor a cover letter for a specific role",
      "- 🎤 Run a focused mock interview (2 technical + 1 behavioral question) with feedback on each answer",
      "- 📄 Give you concrete suggestions to improve your CV",
      "",
      "What would you like to tackle first? 💪"
    ].join("\n")
  },
  de: {
    intro: "Schoen, Sie kennenzulernen 🙂 Ich begleite Sie Schritt fuer Schritt und speichere jede bestaetigte Antwort direkt in Ihrem Profil.",
    assistantUnavailable: "Der Assistent ist voruebergehend nicht verfuegbar. Bitte versuchen Sie es erneut.",
    saveFailed: "Ich konnte diese Antwort nicht speichern. Bitte versuchen Sie es erneut.",
    blockedFallback: "Dabei kann ich nicht helfen. Wir machen mit Ihrem Profil weiter.",
    answerFailed: "Ich konnte darauf gerade nicht antworten. Bitte versuchen Sie es erneut.",
    readingCv: "Ihr CV wird gelesen...",
    fileReadFailed: "Ich konnte diese Datei nicht lesen. Bitte versuchen Sie eine PDF- oder .txt-Datei.",
    cvSaveFailed: "CV gelesen, aber ich konnte die extrahierten Informationen nicht speichern. Bitte erneut versuchen.",
    cvAnalyzed: "Ihr CV wurde analysiert und Ihr Profil mit den sicher erkannten Informationen befuellt. Jetzt stelle ich die restlichen Praeferenzfragen, um Ihr Profil zu vervollstaendigen.",
    cvUploadedNoFacts: "CV hochgeladen. Ich konnte keine strukturierten Felder automatisch extrahieren - wir fuellen Ihr Profil gemeinsam weiter aus.",
    uploadFailed: "Beim Hochladen Ihres CV ist etwas schiefgelaufen. Bitte versuchen Sie es erneut.",
    completeNoCv: "Ausgezeichnet! 🎉 Ihr Kernprofil nimmt Form an! Als Naechstes laden wir Ihren CV hoch, damit ich Ihre Erfahrung automatisch extrahieren und die restlichen Details ausfuellen kann. Das spart Ihnen viel Zeit! ⚡",
    placeholderDefault: "Schreiben Sie Ihre Antwort hier",
    placeholderComplete: "Profil ist abgeschlossen. Sie koennen weiterhin Aenderungen eingeben.",
    offTrackNudge: "Das sieht nicht nach einer passenden Antwort auf diese Frage aus. Lassen Sie uns beim Thema bleiben:",
    completionHelp: [
      "🎉 Ihr Profil ist jetzt fertig und bereit! Ich habe es anhand Ihres CV und Ihrer Antworten so vollstaendig wie moeglich gestaltet.",
      "",
      "Hier ist, womit ich Ihnen aktuell wirklich helfen kann: 🚀",
      "",
      "- ✉️ Ein Motivationsschreiben fuer eine bestimmte Stelle entwerfen oder anpassen",
      "- 🎤 Ein fokussiertes Mock-Interview (2 technische + 1 Verhaltensfrage) mit Feedback zu jeder Antwort durchfuehren",
      "- 📄 Ihnen konkrete Vorschlaege zur Verbesserung Ihres CV geben",
      "",
      "Womit moechten Sie zuerst beginnen? 💪"
    ].join("\n")
  },
  fr: {
    intro: "Ravi de vous rencontrer 🙂 Je vous guide etape par etape et j'enregistre chaque reponse confirmee directement dans votre profil.",
    assistantUnavailable: "L'assistant est temporairement indisponible. Veuillez reessayer.",
    saveFailed: "Je n'ai pas pu enregistrer cette reponse. Veuillez reessayer.",
    blockedFallback: "Je ne peux pas aider sur ce point. Continuons avec votre profil.",
    answerFailed: "Je ne peux pas repondre a cela pour le moment. Veuillez reessayer.",
    readingCv: "Lecture de votre CV...",
    fileReadFailed: "Je n'ai pas pu lire ce fichier. Essayez un PDF ou un fichier .txt.",
    cvSaveFailed: "CV analyse, mais je n'ai pas pu enregistrer les informations extraites. Veuillez reessayer.",
    cvAnalyzed: "Votre CV a ete analyse et votre profil a ete complete avec les informations detectees avec confiance. Je vais maintenant poser les questions de preference restantes pour finaliser votre profil.",
    cvUploadedNoFacts: "CV televerse. Je n'ai pas pu extraire automatiquement des champs structures - continuons a completer votre profil ensemble.",
    uploadFailed: "Une erreur est survenue lors du televersement du CV. Veuillez reessayer.",
    completeNoCv: "Excellent! 🎉 Votre profil de base prend forme! Ensuite, televersons votre CV pour que j'extraie automatiquement votre experience et remplisse les details restants. Cela vous fait gagner du temps! ⚡",
    placeholderDefault: "Ecrivez votre reponse ici",
    placeholderComplete: "Profil termine. Vous pouvez encore saisir des modifications.",
    offTrackNudge: "Cela ne semble pas repondre a la question. Restons sur le sujet:",
    completionHelp: [
      "🎉 Votre profil est maintenant complet et pret! Je l'ai rempli aussi completement que possible a partir de votre CV et de vos reponses.",
      "",
      "Voici ce avec quoi je peux reellement vous aider maintenant: 🚀",
      "",
      "- ✉️ Rediger ou adapter une lettre de motivation pour un poste precis",
      "- 🎤 Mener un entretien blanc cible (2 questions techniques + 1 comportementale) avec un retour sur chaque reponse",
      "- 📄 Vous donner des suggestions concretes pour ameliorer votre CV",
      "",
      "Par quoi aimeriez-vous commencer? 💪"
    ].join("\n")
  }
} as const;

function localizeQuestion(locale: "en" | "de" | "fr", question: InteractiveQuestion): InteractiveQuestion {
  if (locale === "en") {
    return question;
  }

  const byField: Record<string, { backstory: string; prompt: string; placeholder?: string }> = {
    employmentObjective: locale === "de"
      ? { backstory: "Damit ich die naechsten Schritte auf Ihr Ziel ausrichten kann, klaeren wir zuerst Ihre Richtung.", prompt: "Was ist aktuell Ihr Hauptziel?" }
      : { backstory: "Pour adapter la suite a votre objectif, alignons d'abord votre direction principale.", prompt: "Quel est votre objectif principal en ce moment ?" },
    primaryRole: locale === "de"
      ? { backstory: "So kann ich Beratung, CV-Wording und Interviewvorbereitung auf Ihre Zielrolle zuschneiden.", prompt: "Fuer welche Rolle sollen wir Ihr Profil zuerst optimieren?", placeholder: "Beispiel: Senior Frontend Developer" }
      : { backstory: "Cela m'aide a adapter les conseils, le CV et la preparation d'entretien a votre role cible.", prompt: "Pour quel role devons-nous optimiser votre profil en premier ?", placeholder: "Exemple: Senior Frontend Developer" },
    preferredLocation: locale === "de"
      ? { backstory: "Ich habe aus dem CV uebernommen, was moeglich war. Jetzt finalisieren wir Ihre Matching-Praeferenzen.", prompt: "Wo moechten Sie idealerweise arbeiten?", placeholder: "Beispiel: Zuerich + hybrid oder remote in der Schweiz" }
      : { backstory: "J'ai rempli ce que je pouvais depuis le CV. Finalisons maintenant vos preferences de matching.", prompt: "Ou souhaitez-vous idealement travailler ?", placeholder: "Exemple: Zurich + hybride, ou remote en Suisse" },
    currentJobSituation: locale === "de"
      ? { backstory: "Ihre aktuelle Situation bestimmt, ob wir Tempo, Verhandlung oder Vorbereitung priorisieren.", prompt: "Was beschreibt Ihre aktuelle Situation am besten?" }
      : { backstory: "Votre situation actuelle determine si je dois prioriser vitesse, negociation ou preparation.", prompt: "Quelle option decrit le mieux votre situation actuelle ?" },
    targetRoles: locale === "de"
      ? { backstory: "Fuer ein vollstaendiges Profil brauche ich Ihre Zielrollen, nicht nur den aktuellen Titel.", prompt: "Welche Rollen soll Ihr Profil ansprechen?", placeholder: "Beispiel: Product Manager, Senior Product Manager" }
      : { backstory: "Pour un profil complet, j'ai besoin de vos roles cibles, pas seulement votre titre actuel.", prompt: "Quels roles votre profil doit-il cibler ?", placeholder: "Exemple: Product Manager, Senior Product Manager" },
    targetSeniority: locale === "de"
      ? { backstory: "Senioritaet verhindert Fehlmatches zwischen Erfahrung und Rolle.", prompt: "Welche Senioritaetsstufe peilen Sie an?" }
      : { backstory: "Le niveau de seniorite evite les decalages entre experience et role.", prompt: "Quel niveau de seniorite visez-vous ?" },
    targetIndustries: locale === "de"
      ? { backstory: "Branchenpraeferenzen helfen mir, passende Unternehmen und Beispiele zu priorisieren.", prompt: "Welche Branchen interessieren Sie am meisten?", placeholder: "Beispiel: SaaS, Fintech, Healthtech" }
      : { backstory: "Les preferences de secteur m'aident a prioriser les bonnes entreprises et exemples.", prompt: "Quels secteurs vous interessent le plus ?", placeholder: "Exemple: SaaS, fintech, healthtech" },
    preferredWorkModel: locale === "de"
      ? { backstory: "Das Arbeitsmodell beeinflusst die Trefferqualitaet stark.", prompt: "Welches Arbeitsmodell bevorzugen Sie?" }
      : { backstory: "Le mode de travail influence fortement la qualite du matching.", prompt: "Quel mode de travail preferez-vous ?" },
    contractPreference: locale === "de"
      ? { backstory: "Die Vertragsform filtert unpassende Rollen fruehzeitig aus.", prompt: "Welche Vertragsart bevorzugen Sie?" }
      : { backstory: "Le type de contrat permet d'ecarter tot les roles non adaptes.", prompt: "Quel type de contrat preferez-vous ?" },
    workRate: locale === "de"
      ? { backstory: "Das gewuenschte Pensum ist in der Schweiz oft ein zentrales Filterkriterium.", prompt: "Welches Arbeitspensum streben Sie an?" }
      : { backstory: "Le taux d'activite est souvent un filtre cle en Suisse.", prompt: "Quel taux d'activite ciblez-vous ?" },
    salaryExpectation: locale === "de"
      ? { backstory: "Die Gehaltsvorstellung hilft mir, realistische Rollen vorzuschlagen.", prompt: "Welche Gehaltsspanne streben Sie an (CHF brutto/Jahr)?" }
      : { backstory: "L'attente salariale m'aide a proposer des roles realistes.", prompt: "Quelle fourchette salariale visez-vous (CHF brut/an) ?" },
    workPermitStatus: locale === "de"
      ? { backstory: "Der Bewilligungsstatus ist fuer die realistische Jobsuche in der Schweiz zentral.", prompt: "Wie ist Ihr Arbeitsbewilligungsstatus in der Schweiz?" }
      : { backstory: "Le statut d'autorisation est essentiel pour une recherche realiste en Suisse.", prompt: "Quel est votre statut d'autorisation de travail en Suisse ?" },
    visaSponsorship: locale === "de"
      ? { backstory: "Sponsoring beeinflusst, welche Rollen sofort realistisch sind.", prompt: "Benoetigen Sie Visa-Sponsoring?" }
      : { backstory: "Le sponsorship influence quels postes sont realistes immediatement.", prompt: "Avez-vous besoin d'un sponsorship visa ?" },
    relocationWillingness: locale === "de"
      ? { backstory: "Umzugsbereitschaft erweitert oder verengt die passenden Chancen.", prompt: "Wie offen sind Sie fuer einen Umzug?" }
      : { backstory: "La mobilite geographique elargit ou reduit les opportunites pertinentes.", prompt: "Quel est votre niveau d'ouverture a la relocation ?" },
    commuteRadius: locale === "de"
      ? { backstory: "Pendelbereitschaft verbessert das Matching fuer On-site- und Hybrid-Rollen.", prompt: "Welcher Pendelradius ist fuer Sie akzeptabel?", placeholder: "Beispiel: Bis zu 45 Minuten" }
      : { backstory: "La tolerance trajet ameliore le matching des roles sur site/hybrides.", prompt: "Quel rayon de trajet vous convient ?", placeholder: "Exemple: Jusqu'a 45 minutes" },
    fullName: locale === "de"
      ? { backstory: "Zum Abschluss gleiche ich Ihren Namen ab, damit Profil und Dokumente konsistent bleiben.", prompt: "Welchen vollstaendigen Namen sollen wir im Profil speichern?", placeholder: "Beispiel: Alexia Stoian" }
      : { backstory: "Derniere verification d'identite pour garder profil et documents coherents.", prompt: "Quel nom complet devons-nous enregistrer dans votre profil ?", placeholder: "Exemple: Alexia Stoian" }
  };

  const localized = byField[question.field];
  if (!localized) return question;

  const translatedOptions = question.options?.map((option) => {
    if (locale === "de") {
      const labels: Record<string, string> = {
        "Find a new job": "Neuen Job finden",
        "Change career direction": "Berufsrichtung wechseln",
        "Grow in current field": "Im aktuellen Bereich wachsen",
        "Return to work": "Wiedereinstieg",
        "Remote": "Remote",
        "Hybrid": "Hybrid",
        "On-site": "Vor Ort",
        "Open": "Offen",
        "No": "Nein",
        "Yes": "Ja"
      };
      return { ...option, label: labels[option.value] ?? option.label };
    }

    const labels: Record<string, string> = {
      "Find a new job": "Trouver un nouvel emploi",
      "Change career direction": "Changer de voie",
      "Grow in current field": "Progresser dans mon domaine",
      "Return to work": "Retour a l'emploi",
      "Remote": "Remote",
      "Hybrid": "Hybride",
      "On-site": "Sur site",
      "Open": "Ouvert",
      "No": "Non",
      "Yes": "Oui"
    };
    return { ...option, label: labels[option.value] ?? option.label };
  });

  return {
    ...question,
    backstory: localized.backstory,
    prompt: localized.prompt,
    placeholder: localized.placeholder ?? question.placeholder,
    options: translatedOptions
  };
}

export function OnboardingCvUploadForm({ locale: _locale }: Props): React.ReactElement {
  const i18n = UI_STRINGS[_locale];
  const [message, setMessage] = useState("");
  const [customOptionDraft, setCustomOptionDraft] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<InteractiveQuestion | null>(null);
  const [isDone, setIsDone] = useState(false);
  const [hasUploadedCv, setHasUploadedCv] = useState(false);
  const [sourcingMode, setSourcingMode] = useState(false);
  const [sourcingChecked, setSourcingChecked] = useState(false);
  const [sectorMode, setSectorMode] = useState(false);
  const [sectorChecked, setSectorChecked] = useState(false);
  const didInitRef = useRef(false);
  const didRestoreRef = useRef(false);
  const didSourcingCheckRef = useRef(false);
  const didSectorCheckRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToLatestMessage = useCallback((behavior: ScrollBehavior): void => {
    messagesEndRef.current?.scrollIntoView({ behavior, block: "end" });
  }, []);

  const applySourcingResponse = useCallback((data: SourcingResponse, baseHistory?: ChatMessage[]): boolean => {
    // No pending question -> not (or no longer) in Sourcing mode.
    if (!data.question || data.done) {
      return false;
    }
    // Mint ONE synthetic stable `field` so the existing option UI renders the
    // sourcing MCQ (options only show when entry.field === currentQuestion.field).
    const field = `sourcing:${data.question.id}`;
    const options = data.question.options;
    setCurrentQuestion({
      id: data.question.id,
      field,
      backstory: "",
      prompt: data.question.prompt,
      options,
      allowCustom: data.question.allowCustom
    });
    setSourcingMode(true);
    // Append the pending question. On initial load `baseHistory` carries the
    // restored transcript (prior conversation + answered Q&A); on advance no base
    // is passed so we append to the CURRENT history, keeping earlier Q&A visible.
    setHistory((current) => {
      const base = baseHistory ?? current;
      return [...base, { role: "assistant", text: data.question!.prompt, options, field }];
    });
    if (baseHistory && baseHistory.length > 0) {
      didRestoreRef.current = true;
    }
    return true;
  }, []);

  const checkSourcingQuestions = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/onboarding/sourcing-questions?locale=${_locale}`, {
        cache: "no-store"
      });
      if (res.ok) {
        const data = (await res.json()) as SourcingResponse;
        const answered = data.answered ?? [];
        const hasContent = Boolean(data.question) || answered.length > 0;
        if (hasContent) {
          // The persisted onboarding conversation is the CHRONOLOGICAL source of
          // truth: answered recruiter Q&A were saved inline where they occurred.
          // We restore that history verbatim and only re-attach a still-pending
          // question — never re-appending answered Q&A at the end (which is what
          // made them jump to the bottom of the conversation on refresh).
          let resumedHistory: ChatMessage[] = [];
          let resumed: InteractiveResponse | null = null;
          try {
            const resumeRes = await fetch("/api/onboarding/resume", { cache: "no-store" });
            if (resumeRes.ok) {
              resumed = (await resumeRes.json()) as InteractiveResponse;
              if (Array.isArray(resumed.history)) {
                resumedHistory = resumed.history as ChatMessage[];
              }
            }
          } catch {
            // Prior history is best-effort; proceed with just the sourcing questions.
          }

          // Heal any sourcing answers that were persisted as the raw option value
          // (e.g. "o0") before the label was stored: swap in the human-readable
          // label the server resolved in `answered`, matched by the question just
          // above it. Leaves free-text answers and everything else untouched.
          if (answered.length > 0) {
            const labelByPrompt = new Map(answered.map((pair) => [pair.prompt, pair.answerText]));
            resumedHistory = resumedHistory.map((message, index) => {
              if (message.role === "user" && /^o\d+$/.test(message.text.trim())) {
                const prompt = resumedHistory[index - 1]?.text;
                const label = prompt ? labelByPrompt.get(prompt) : undefined;
                if (label) {
                  return { ...message, text: label };
                }
              }
              return message;
            });
          }

          if (data.question) {
            const prompt = data.question.prompt;
            const last = resumedHistory[resumedHistory.length - 1];
            if (last && last.role === "assistant" && last.text === prompt) {
              // Already delivered and persisted inline (chronological). Re-attach
              // interactivity to that trailing question without duplicating it.
              applySourcingResponse(data, resumedHistory.slice(0, -1));
            } else {
              // Not yet persisted inline — reconstruct: prior convo + recruiter
              // notice + this set's answered Q&A + the pending question.
              const base = [...resumedHistory];
              if (data.notice) {
                base.push({ role: "assistant", text: data.notice });
              }
              for (const pair of answered) {
                base.push({ role: "assistant", text: pair.prompt });
                base.push({ role: "user", text: pair.answerText });
              }
              applySourcingResponse(data, base);
            }
            // Persist as this set is answered so the Q&A stay chronologically inline.
            didInitRef.current = true;
          } else {
            // Completed set. The conversation history already has this set's Q&A
            // inline where they occurred — show it as-is so they keep their place.
            // Fall back to appending only if they are somehow NOT present, so a
            // finished set is never lost.
            const lastPrompt = answered.length ? answered[answered.length - 1].prompt : null;
            const alreadyInline =
              lastPrompt !== null &&
              resumedHistory.some((m) => m.role === "assistant" && m.text === lastPrompt);
            if (alreadyInline || answered.length === 0) {
              setHistory(resumedHistory);
            } else {
              const base = [...resumedHistory];
              if (data.notice) {
                base.push({ role: "assistant", text: data.notice });
              }
              for (const pair of answered) {
                base.push({ role: "assistant", text: pair.prompt });
                base.push({ role: "user", text: pair.answerText });
              }
              if (data.message) {
                base.push({ role: "assistant", text: data.message });
              }
              setHistory(base);
            }
            if (resumedHistory.length > 0) {
              didRestoreRef.current = true;
            }
            if (resumed) {
              setCurrentQuestion(resumed.question ? localizeQuestion(_locale, resumed.question) : null);
              setIsDone(resumed.done);
              setHasUploadedCv(Boolean(resumed.hasCvUpload));
            }
            didInitRef.current = true;
          }
        }
      }
    } catch {
      // Fall through to the normal onboarding flow if the sourcing check fails.
    } finally {
      setSourcingChecked(true);
    }
  }, [_locale, applySourcingResponse]);

  const applySectorResponse = useCallback((data: SectorResponse, baseHistory?: ChatMessage[]): boolean => {
    // No pending question -> not (or no longer) in Sector mode.
    if (!data.question || data.done) {
      return false;
    }
    // Mint ONE synthetic stable `field` under the DISTINCT `sector:` prefix so the
    // existing option UI renders the sector MCQ (options only show when
    // entry.field === currentQuestion.field). Never merged with `sourcing:`.
    const field = `sector:${data.question.id}`;
    const options = data.question.options;
    setCurrentQuestion({
      id: data.question.id,
      field,
      backstory: "",
      prompt: data.question.prompt,
      options,
      allowCustom: data.question.allowCustom
    });
    setSectorMode(true);
    // Append the pending question. On initial load `baseHistory` carries the
    // restored transcript (prior conversation + answered Q&A); on advance no base
    // is passed so we append to the CURRENT history, keeping earlier Q&A visible.
    setHistory((current) => {
      const base = baseHistory ?? current;
      return [...base, { role: "assistant", text: data.question!.prompt, options, field }];
    });
    if (baseHistory && baseHistory.length > 0) {
      didRestoreRef.current = true;
    }
    return true;
  }, []);

  const checkSectorQuestions = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch(`/api/onboarding/sector-questions?locale=${_locale}`, {
        cache: "no-store"
      });
      if (res.ok) {
        const data = (await res.json()) as SectorResponse;
        const answered = data.answered ?? [];
        // Only take over when a sector question is still PENDING. If every sector
        // field is answered (or there is no sector store), let the normal flow run
        // — answered sector Q&A already live inline in the restored conversation.
        if (data.question) {
          // The persisted onboarding conversation is the CHRONOLOGICAL source of
          // truth: answered sector Q&A were saved inline where they occurred. We
          // restore that history verbatim and only re-attach the still-pending
          // question — never re-appending answered Q&A at the end.
          let resumedHistory: ChatMessage[] = [];
          try {
            const resumeRes = await fetch("/api/onboarding/resume", { cache: "no-store" });
            if (resumeRes.ok) {
              const resumed = (await resumeRes.json()) as InteractiveResponse;
              if (Array.isArray(resumed.history)) {
                resumedHistory = resumed.history as ChatMessage[];
              }
            }
          } catch {
            // Prior history is best-effort; proceed with just the sector question.
          }

          const prompt = data.question.prompt;
          const last = resumedHistory[resumedHistory.length - 1];
          if (last && last.role === "assistant" && last.text === prompt) {
            // Already delivered and persisted inline (chronological). Re-attach
            // interactivity to that trailing question without duplicating it.
            applySectorResponse(data, resumedHistory.slice(0, -1));
          } else {
            // Not yet persisted inline — reconstruct: prior convo + this set's
            // answered Q&A (only if not already inline) + the pending question.
            const base = [...resumedHistory];
            for (const pair of answered) {
              const alreadyInline = base.some((m) => m.role === "assistant" && m.text === pair.prompt);
              if (!alreadyInline) {
                base.push({ role: "assistant", text: pair.prompt });
                base.push({ role: "user", text: pair.answerText });
              }
            }
            applySectorResponse(data, base);
          }
          didInitRef.current = true;
        }
      }
    } catch {
      // Fall through to the normal onboarding flow if the sector check fails.
    } finally {
      setSectorChecked(true);
    }
  }, [_locale, applySectorResponse]);

  const applyInteractiveResponse = useCallback((data: InteractiveResponse, introText?: string): void => {
    setHasUploadedCv(Boolean(data.hasCvUpload));
    setCurrentQuestion(data.question);
    setIsDone(data.done);

    if (introText) {
      setHistory((current) => [...current, { role: "assistant", text: introText }]);
    }

    const nextQuestion = data.question ? localizeQuestion(_locale, data.question) : null;
    if (nextQuestion) {
      setHistory((current) => [
        ...current,
        {
          role: "assistant",
          text: `${nextQuestion.backstory} ${nextQuestion.prompt}`,
          options: nextQuestion.options,
          field: nextQuestion.field
        }
      ]);
      return;
    }

    if (data.done) {
      setHistory((current) => [
        ...current,
        {
          role: "assistant",
          text: (data.hasCvUpload ?? hasUploadedCv)
            ? i18n.completionHelp
            : i18n.completeNoCv
        }
      ]);
    }
  }, [_locale, hasUploadedCv, i18n.completeNoCv, i18n.completionHelp]);

  const loadInteractiveQuestion = useCallback(async (): Promise<void> => {
    setIsSending(true);

    try {
      const resumeResponse = await fetch("/api/onboarding/resume", {
        method: "GET",
        cache: "no-store"
      });

      if (resumeResponse.ok) {
        const resumed = (await resumeResponse.json()) as InteractiveResponse;
        if (Array.isArray(resumed.history) && resumed.history.length > 0) {
          setHistory(resumed.history);
          setCurrentQuestion(resumed.question ? localizeQuestion(_locale, resumed.question) : null);
          setIsDone(resumed.done);
          setHasUploadedCv(Boolean(resumed.hasCvUpload));
          didRestoreRef.current = true;
          return;
        }
      }

      const response = await fetch("/api/onboarding/interactive", {
        method: "GET",
        cache: "no-store"
      });

      if (!response.ok) {
        setHistory((current) => [...current, { role: "assistant", text: i18n.assistantUnavailable }]);
        return;
      }

      const data = (await response.json()) as InteractiveResponse;
      applyInteractiveResponse(
        data,
        i18n.intro
      );
    } catch {
      setHistory((current) => [...current, { role: "assistant", text: i18n.assistantUnavailable }]);
    } finally {
      setIsSending(false);
    }
  }, [applyInteractiveResponse, i18n.assistantUnavailable, i18n.intro]);

  useEffect(() => {
    if (!didInitRef.current || !didRestoreRef.current) {
      return;
    }

    void fetch("/api/onboarding/history", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ history })
    }).catch(() => {
      // Keep the local experience responsive even if background history sync fails.
    });
  }, [history]);

  const submitAnswerValue = useCallback(async (value: string, sourcingSource?: "option" | "freeText"): Promise<void> => {
    if (isSending || !currentQuestion) {
      return;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    // Sourcing mode: deliver answers to the dedicated endpoint ONLY, tag the
    // source explicitly (option -> chosenValue, custom -> freeText), and bypass
    // the off-track nudge so open answers are never intercepted.
    if (sourcingMode && currentQuestion.field.startsWith("sourcing:")) {
      setIsSending(true);
      // Show the human-readable option label in the chat (not the raw value like
      // "o0"); the raw value is still what gets sent to the backend below.
      const displayText = sourcingSource === "freeText"
        ? trimmed
        : currentQuestion.options?.find((option) => option.value === trimmed)?.label ?? trimmed;
      setHistory((current) => [...current, { role: "user", text: displayText }]);
      setMessage("");
      setCustomOptionDraft("");

      try {
        const questionId = currentQuestion.id;
        const payload = sourcingSource === "freeText"
          ? { questionId, freeText: trimmed, locale: _locale }
          : { questionId, chosenValue: trimmed, locale: _locale };

        const response = await fetch("/api/onboarding/sourcing-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          if (response.status === 401) {
            window.location.href = "/login?callbackUrl=/onboarding";
            return;
          }
          setHistory((current) => [...current, { role: "assistant", text: i18n.saveFailed }]);
          return;
        }

        const data = (await response.json()) as SourcingResponse;
        if (data.done) {
          if (data.message) {
            setHistory((current) => [...current, { role: "assistant", text: data.message! }]);
          }
          setSourcingMode(false);
          setCurrentQuestion(null);
          // Sourcing finished -> resume the normal onboarding assistant flow.
          if (!didInitRef.current) {
            didInitRef.current = true;
            void loadInteractiveQuestion();
          }
          return;
        }

        // Advance: pull the next sourcing question one at a time.
        const nextRes = await fetch(`/api/onboarding/sourcing-questions?locale=${_locale}`, {
          cache: "no-store"
        });
        const advanced = nextRes.ok && applySourcingResponse((await nextRes.json()) as SourcingResponse);
        if (!advanced) {
          setSourcingMode(false);
          setCurrentQuestion(null);
          if (!didInitRef.current) {
            didInitRef.current = true;
            void loadInteractiveQuestion();
          }
        }
      } catch {
        setHistory((current) => [...current, { role: "assistant", text: i18n.saveFailed }]);
      } finally {
        setIsSending(false);
      }
      return;
    }

    // Sector mode: deliver answers to the dedicated sector endpoint ONLY, tag the
    // source explicitly (option -> chosenValue, custom -> freeText), and bypass the
    // off-track nudge. Distinct `sector:` prefix — never routed through sourcing.
    if (sectorMode && currentQuestion.field.startsWith("sector:")) {
      setIsSending(true);
      // Show the human-readable option label in the chat (not the raw slug value);
      // the raw value is still what gets sent to the backend below.
      const displayText = sourcingSource === "freeText"
        ? trimmed
        : currentQuestion.options?.find((option) => option.value === trimmed)?.label ?? trimmed;
      setHistory((current) => [...current, { role: "user", text: displayText }]);
      setMessage("");
      setCustomOptionDraft("");

      try {
        const questionId = currentQuestion.id;
        const payload = sourcingSource === "freeText"
          ? { questionId, freeText: trimmed, locale: _locale }
          : { questionId, chosenValue: trimmed, locale: _locale };

        const response = await fetch("/api/onboarding/sector-questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          if (response.status === 401) {
            window.location.href = "/login?callbackUrl=/onboarding";
            return;
          }
          setHistory((current) => [...current, { role: "assistant", text: i18n.saveFailed }]);
          return;
        }

        const data = (await response.json()) as SectorResponse;
        if (data.done) {
          // Sector follow-ups finished -> continue the normal onboarding flow with
          // the universal fields. Fetch the next interactive question and APPEND it
          // (never resume-replace) so the sector Q&A stay visible in the chat.
          setSectorMode(false);
          setCurrentQuestion(null);
          try {
            const nextInteractive = await fetch("/api/onboarding/interactive", { cache: "no-store" });
            if (nextInteractive.ok) {
              applyInteractiveResponse((await nextInteractive.json()) as InteractiveResponse);
            }
          } catch {
            // Best-effort continuation; the next visit re-loads the pending question.
          }
          return;
        }

        // Advance: pull the next sector question one at a time.
        const nextRes = await fetch(`/api/onboarding/sector-questions?locale=${_locale}`, {
          cache: "no-store"
        });
        const advanced = nextRes.ok && applySectorResponse((await nextRes.json()) as SectorResponse);
        if (!advanced) {
          setSectorMode(false);
          setCurrentQuestion(null);
          try {
            const nextInteractive = await fetch("/api/onboarding/interactive", { cache: "no-store" });
            if (nextInteractive.ok) {
              applyInteractiveResponse((await nextInteractive.json()) as InteractiveResponse);
            }
          } catch {
            // Best-effort continuation.
          }
        }
      } catch {
        setHistory((current) => [...current, { role: "assistant", text: i18n.saveFailed }]);
      } finally {
        setIsSending(false);
      }
      return;
    }

    if (isClearlyOffTrackAnswer(trimmed, currentQuestion)) {
      appendOffTrackNudge(trimmed, currentQuestion);
      return;
    }

    setIsSending(true);
    // Show the option's human-readable label in the chat (not a raw value like the
    // "__no_cv__" CV-gate sentinel); the raw value is still POSTed to the backend.
    const interactiveDisplayText =
      currentQuestion.options?.find((option) => option.value === trimmed)?.label ?? trimmed;
    setHistory((current) => [...current, { role: "user", text: interactiveDisplayText }]);
    setMessage("");
    setCustomOptionDraft("");

    try {
      const response = await fetch("/api/onboarding/interactive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          field: currentQuestion.field,
          value: trimmed,
          locale: _locale
        })
      });

      if (!response.ok) {
        // Stale session (JWT outlived the user row): send the user to log in again
        // instead of showing a confusing "could not save" message.
        if (response.status === 401) {
          window.location.href = "/login?callbackUrl=/onboarding";
          return;
        }
        setHistory((current) => [...current, { role: "assistant", text: i18n.saveFailed }]);
        return;
      }

      const data = (await response.json()) as InteractiveResponse & { saved?: { field: string; value: string } };
      if (data.blocked) {
        setHistory((current) => [
          ...current,
          { role: "assistant", text: data.message ?? i18n.blockedFallback }
        ]);
        return;
      }

      applyInteractiveResponse(data);
    } catch {
      setHistory((current) => [...current, { role: "assistant", text: i18n.saveFailed }]);
    } finally {
      setIsSending(false);
    }
  }, [_locale, applyInteractiveResponse, applySourcingResponse, applySectorResponse, currentQuestion, i18n.blockedFallback, i18n.saveFailed, isSending, loadInteractiveQuestion, sourcingMode, sectorMode]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const sendFreeMessage = useCallback(async (value: string): Promise<void> => {
    const trimmed = value.trim();
    if (!trimmed || isSending) return;

    setIsSending(true);
    setHistory((current) => [...current, { role: "user", text: trimmed }]);
    setMessage("");

    try {
      const response = await fetch("/api/onboarding/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, locale: _locale })
      });

      if (!response.ok) {
        setHistory((current) => [...current, { role: "assistant", text: i18n.answerFailed }]);
        return;
      }

      const data = (await response.json()) as { answer?: string };
      const answer = data.answer?.trim();
      if (answer) {
        setHistory((current) => [...current, { role: "assistant", text: answer }]);
      }
    } catch {
      setHistory((current) => [...current, { role: "assistant", text: i18n.answerFailed }]);
    } finally {
      setIsSending(false);
    }
  }, [_locale, i18n.answerFailed, isSending]);

  const handleCvUpload = useCallback(async (file: File): Promise<void> => {
    setIsUploading(true);
    setHistory((current) => [...current, { role: "user", text: `📄 ${file.name}` }]);
    setHistory((current) => [...current, { role: "assistant", text: i18n.readingCv }]);

    // Always clear the transient "Reading your CV..." bubble so the UI never
    // looks stuck, whatever the outcome.
    const clearReading = () =>
      setHistory((current) => current.filter((m) => m.text !== i18n.readingCv));

    try {
      // Step 1: parse file to plain text server-side
      const formData = new FormData();
      formData.append("file", file);

      const parseRes = await fetch("/api/cv/parse", { method: "POST", body: formData });
      if (!parseRes.ok) {
        if (parseRes.status === 401) {
          window.location.href = "/login?callbackUrl=/onboarding";
          return;
        }
        const err = (await parseRes.json().catch(() => ({}))) as { detail?: string };
        clearReading();
        setHistory((current) => [
          ...current,
          { role: "assistant", text: err.detail ?? i18n.fileReadFailed }
        ]);
        return;
      }

      const { text: cvText } = (await parseRes.json()) as { text: string };

      // Step 2: extract facts and save to profile
      const uploadRes = await fetch("/api/onboarding/cv/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cvText,
          fileName: file.name,
          mimeType: file.type || "text/plain",
          locale: _locale
        })
      });

      if (!uploadRes.ok) {
        if (uploadRes.status === 401) {
          window.location.href = "/login?callbackUrl=/onboarding";
          return;
        }
        clearReading();
        setHistory((current) => [...current, { role: "assistant", text: i18n.cvSaveFailed }]);
        return;
      }

      const data = (await uploadRes.json()) as { profileSeeds?: Record<string, unknown>; facts?: Record<string, unknown> };
      const seeds = data.profileSeeds ?? data.facts ?? {};
      const filled = Object.entries(seeds).filter(([, v]) => v && String(v).trim().length > 0).map(([k]) => k);
      setHasUploadedCv(true);

      clearReading();

      if (filled.length > 0) {
        setHistory((current) => [
          ...current,
          {
            role: "assistant",
            text: i18n.cvAnalyzed
          }
        ]);
      } else {
        setHistory((current) => [
          ...current,
          { role: "assistant", text: i18n.cvUploadedNoFacts }
        ]);
      }

      const nextRes = await fetch("/api/onboarding/interactive", { method: "GET", cache: "no-store" });
      if (nextRes.ok) {
        const nextData = (await nextRes.json()) as InteractiveResponse;
        if (nextData.done) {
          setCurrentQuestion(null);
          setIsDone(true);
          setHistory((current) => [...current, { role: "assistant", text: i18n.completionHelp }]);
        } else {
          applyInteractiveResponse(nextData);
        }
      }
    } catch {
      clearReading();
      setHistory((current) => [...current, { role: "assistant", text: i18n.uploadFailed }]);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [_locale, applyInteractiveResponse, i18n.completionHelp, i18n.cvAnalyzed, i18n.cvSaveFailed, i18n.cvUploadedNoFacts, i18n.fileReadFailed, i18n.readingCv, i18n.uploadFailed]);

  function shouldTreatAsAdvisoryMessage(input: string, question: InteractiveQuestion | null): boolean {
    if (!question) {
      return true;
    }

    const trimmed = input.trim();
    const normalized = trimmed.toLowerCase();
    const normalizedNoPunct = normalized.replace(/[!?.,;:]/g, "");

    const optionMatch = question.options?.some((option) => option.value.toLowerCase() === normalizedNoPunct);
    if (optionMatch) {
      return false;
    }

    const advisoryIntent = /(\?|\bhow\b|\bwhat\b|\bwhy\b|\bcan you\b|\bhelp me\b|\binterview\b|\bcv\b|\bresume\b|\bcover letter\b|\bsalary\b|\bcareer\b|\bjob search\b|\bskills?\b|\bmarket\b|\badvice\b|\btip\b|\bvorstellungsgespraech\b|\bgehalt\b|\blebenslauf\b|\bkarriere\b|\bbewerbung\b|\bentretien\b|\bsalaire\b|\bcarriere\b|\bcv\b|\bmotivation\b)/i;
    if (advisoryIntent.test(normalized)) {
      return true;
    }

    const shortLikelyAnswer = trimmed.split(/\s+/).length <= 10;
    return !shortLikelyAnswer;
  }

  function normalizeForMatch(value: string): string {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function hasAnyKeyword(input: string, keywords: string[]): boolean {
    return keywords.some((keyword) => input.includes(keyword));
  }

  function isRelevantCustomAnswer(input: string, question: InteractiveQuestion): boolean {
    const normalized = normalizeForMatch(input);

    const keywordByField: Record<string, string[]> = {
      employmentObjective: ["job", "work", "career", "role", "position", "change", "return", "emploi", "carriere", "arbeit", "karriere", "jobwechsel"],
      currentJobSituation: ["employed", "unemployed", "student", "freelance", "contract", "notice", "arbeit", "angestellt", "arbeitslos", "etudiant", "chomage"],
      targetSeniority: ["junior", "mid", "senior", "lead", "principal", "manager", "entry", "level"],
      preferredWorkModel: ["remote", "hybrid", "onsite", "on site", "office", "home"],
      contractPreference: ["full time", "part time", "permanent", "contract", "freelance", "internship", "temporary"],
      workPermitStatus: ["permit", "visa", "eu", "europe", "swiss", "citizen", "residence", "bewilligung"],
      visaSponsorship: ["yes", "no", "sponsorship", "visa", "oui", "non", "ja", "nein"],
      relocationWillingness: ["relocate", "move", "open", "yes", "no", "city", "country", "umzug", "demenager"],
      salaryExpectation: ["chf", "salary", "range", "k", "year", "month", "gross", "brutto", "salaire"],
      workRate: ["%", "percent", "full time", "part time", "pensum", "taux"]
    };

    const fieldKeywords = keywordByField[question.field];
    if (!fieldKeywords || fieldKeywords.length === 0) {
      return true;
    }

    return hasAnyKeyword(normalized, fieldKeywords);
  }

  function isClearlyOffTrackAnswer(input: string, question: InteractiveQuestion): boolean {
    const trimmed = input.trim();
    const normalized = trimmed.toLowerCase();
    const normalizedMatch = normalizeForMatch(trimmed);

    if (trimmed.length < 2) {
      return true;
    }

    const onlySymbols = /^[^\p{L}\p{N}]+$/u.test(trimmed);
    if (onlySymbols) {
      return true;
    }

    const irrelevantPattern = /\b(asdf|qwerty|lorem|blah|blabla|idk|whatever|random|n\/a|none|skip|test|bullshit|fuck|shit)\b|^\?+$|^\.+$/i;
    if (irrelevantPattern.test(normalized)) {
      return true;
    }

    const repeatedSingleChar = /^(.)\1{4,}$/i;
    if (repeatedSingleChar.test(trimmed.replace(/\s+/g, ""))) {
      return true;
    }

    const normalizedOptionValues = question.options?.map((option) => normalizeForMatch(option.value)) ?? [];
    const normalizedOptionLabels = question.options?.map((option) => normalizeForMatch(option.label)) ?? [];

    if (normalizedOptionValues.length > 0) {
      if (normalizedOptionValues.includes(normalizedMatch) || normalizedOptionLabels.includes(normalizedMatch)) {
        return false;
      }

      const wordCount = normalizedMatch.split(/\s+/).filter(Boolean).length;
      if (wordCount < 2 || wordCount > 12) {
        return true;
      }

      if (!isRelevantCustomAnswer(normalizedMatch, question)) {
        return true;
      }
    }

    if (question.field === "salaryExpectation") {
      return !(/\d/.test(trimmed) || /chf|open|depends|negotiable|range|k/.test(normalized));
    }

    if (question.field === "workRate") {
      return !(/\d+\s*%/.test(trimmed) || /full[- ]?time|part[- ]?time|flexible|open/.test(normalized));
    }

    if (question.field === "fullName") {
      const tokens = trimmed.split(/\s+/).filter((part) => /[\p{L}]/u.test(part));
      return tokens.length < 2;
    }

    if (question.field === "preferredLocation" || question.field === "commuteRadius") {
      if (normalizedMatch.length < 3) {
        return true;
      }
      return /^(idk|none|n a|test|random)$/.test(normalizedMatch);
    }

    if ((question.field === "targetRoles" || question.field === "primaryRole") && normalizedMatch.split(/\s+/).length < 2) {
      return true;
    }

    return false;
  }

  function buildOffTrackFollowUp(question: InteractiveQuestion): string {
    if (question.options && question.options.length > 0) {
      const suggested = question.options.slice(0, 4).map((option) => option.label).join(", ");
      return `${question.prompt} (${suggested})`;
    }

    return question.prompt;
  }

  function appendOffTrackNudge(rawInput: string, question: InteractiveQuestion): void {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      return;
    }

    setHistory((current) => [
      ...current,
      { role: "user", text: trimmed },
      { role: "assistant", text: `${i18n.offTrackNudge} ${buildOffTrackFollowUp(question)}` }
    ]);
    setMessage("");
    setCustomOptionDraft("");
  }

  async function submitAnswer(): Promise<void> {
    // Route to profile-answer save or advisory assistant based on message intent.
    if (sourcingMode && currentQuestion?.field.startsWith("sourcing:")) {
      await submitAnswerValue(message, "freeText");
    } else if (sectorMode && currentQuestion?.field.startsWith("sector:")) {
      await submitAnswerValue(message, "freeText");
    } else if (currentQuestion && !shouldTreatAsAdvisoryMessage(message, currentQuestion)) {
      await submitAnswerValue(message);
    } else {
      await sendFreeMessage(message);
    }
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitAnswer();
    }
  }

  useEffect(() => {
    if (didSourcingCheckRef.current) {
      return;
    }

    didSourcingCheckRef.current = true;
    void checkSourcingQuestions();
  }, [checkSourcingQuestions]);

  useEffect(() => {
    // Run the sector check AFTER the sourcing check resolves so a pending sourcing
    // set keeps priority. Skip entirely if sourcing took over (both modes stay
    // independent). Sector follow-ups are ordered before Phase 11 sourcing (A3).
    if (!sourcingChecked || didSectorCheckRef.current) {
      return;
    }
    didSectorCheckRef.current = true;
    if (sourcingMode) {
      setSectorChecked(true);
      return;
    }
    void checkSectorQuestions();
  }, [sourcingChecked, sourcingMode, checkSectorQuestions]);

  useEffect(() => {
    // Wait for BOTH the sourcing and sector checks to resolve first so a pending
    // sourcing set or sector question always takes priority over the normal
    // interactive flow on load.
    if (!sourcingChecked || !sectorChecked) {
      return;
    }
    if (didInitRef.current || isSending || history.length > 0) {
      return;
    }

    didInitRef.current = true;
    void loadInteractiveQuestion();
  }, [sourcingChecked, sectorChecked, history.length, isSending, loadInteractiveQuestion]);

  useEffect(() => {
    if (history.length > 0) {
      didRestoreRef.current = true;
    }
  }, [history.length]);

  useEffect(() => {
    if (history.length === 0) {
      return;
    }

    scrollToLatestMessage(history.length <= 1 ? "auto" : "smooth");
  }, [history.length, scrollToLatestMessage]);

  return (
    <section className="img3-panel img3-panel--conversation">
      <div className="img3-chat img3-chat--conversation">
        <div className="img3-chat__right img3-chat__right--conversation">
          {history.map((entry, index) => (
            <div key={`${entry.role}-${index}-${entry.text}`} className={`img3-bubble ${entry.role === "user" ? "img3-bubble--user" : "img3-bubble--assistant"}`}>
              <div className="img3-bubble__text img3-bubble__text--multiline">
                {entry.role === "assistant" ? (
                  <ReactMarkdown>{entry.text}</ReactMarkdown>
                ) : (
                  <p>{entry.text}</p>
                )}
              </div>
              {entry.role === "assistant" && entry.options && entry.options.length > 0 && entry.field === currentQuestion?.field ? (
                <div className="img3-options" role="group" aria-label={`Options for ${entry.field}`}>
                  {entry.options.map((option) => (
                    <button
                      key={`${entry.field}-${option.value}`}
                      type="button"
                      className="img3-option"
                      onClick={() => {
                        void submitAnswerValue(option.value, "option");
                      }}
                      disabled={isSending}
                    >
                      <span className="img3-option__content">
                        <span className="img3-option__label">{option.label}</span>
                        {option.description ? <span className="img3-option__description">{option.description}</span> : null}
                      </span>
                    </button>
                  ))}
                  <div className="img3-option">
                    <input
                      id="inline-custom-option"
                      className="img3-option__custom-input img3-option__custom-input--standalone"
                      value={customOptionDraft}
                      onChange={(event) => setCustomOptionDraft(event.target.value)}
                      placeholder={currentQuestion?.placeholder ?? "Or type your own answer…"}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void submitAnswerValue(customOptionDraft, "freeText");
                        }
                      }}
                      disabled={isSending}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ))}
          <div ref={messagesEndRef} aria-hidden="true" />
          <RecruiterSignalsPanel refreshKey={history.length} />
        </div>
      </div>

      <div className="img3-conversation-bar">
        <div className="img3-conversation-bar__field">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.pdf,.doc,.docx,text/plain,application/pdf"
            style={{ display: "none" }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleCvUpload(file);
            }}
          />
          <button
            type="button"
            className="img3-conversation-bar__plus-btn"
            title="Upload your CV"
            aria-label="Upload CV"
            disabled={isUploading || isSending}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? "…" : "+"}
          </button>
          <textarea
            id="cv-textarea"
            className="img3-conversation-bar__input"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={onInputKeyDown}
            rows={1}
            placeholder={
              currentQuestion?.placeholder
                ? currentQuestion.placeholder
                : isDone
                  ? i18n.placeholderComplete
                  : i18n.placeholderDefault
            }
          />
          <button type="button" className="img3-bottom-input__send" onClick={submitAnswer} disabled={message.trim().length === 0 || isSending || isUploading}>
            <svg className="img3-bottom-input__send-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 18V6" />
              <path d="M7.5 10.5L12 6l4.5 4.5" />
            </svg>
          </button>
        </div>
        <p className="img3-conversation-bar__note">AI can make mistakes, so please double-check the output.</p>
      </div>
    </section>
  );
}
