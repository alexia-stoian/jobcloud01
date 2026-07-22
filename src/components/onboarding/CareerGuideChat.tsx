"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type Locale = "en" | "de" | "fr";

type Props = {
  locale: Locale;
};

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

const GREETING: Record<Locale, string> = {
  en: "Hi! 👋 I'm your Career Guide. Ask me anything about your job search, CV, interviews, or career goals.",
  de: "Hallo! 👋 Ich bin dein Karriere-Guide. Frag mich alles zu Jobsuche, Lebenslauf, Vorstellungsgesprächen oder Karrierezielen.",
  fr: "Salut ! 👋 Je suis ton Career Guide. Pose-moi toutes tes questions sur ta recherche d'emploi, ton CV, tes entretiens ou tes objectifs de carrière."
};

const ERROR_REPLY: Record<Locale, string> = {
  en: "Sorry, something went wrong reaching the assistant. Please try again.",
  de: "Entschuldigung, der Assistent ist gerade nicht erreichbar. Bitte versuche es erneut.",
  fr: "Désolé, une erreur s'est produite en contactant l'assistant. Réessaie."
};

const PLACEHOLDER: Record<Locale, string> = {
  en: "Type your message…",
  de: "Schreib deine Nachricht…",
  fr: "Écris ton message…"
};

const NOTE: Record<Locale, string> = {
  en: "AI can make mistakes, so please double-check the output.",
  de: "KI kann Fehler machen, bitte überprüfe die Ausgabe.",
  fr: "L'IA peut se tromper, merci de vérifier la réponse."
};

/**
 * Career Guide chat — a plain conversation with the Bedrock AgentCore agent.
 *
 * Every user message is forwarded to `POST /api/onboarding/assistant`, which
 * invokes the agent and returns `{ answer }`. There is no structured onboarding
 * flow here: the agent owns the entire conversation.
 */
export function CareerGuideChat({ locale }: Props): React.ReactElement {
  const [history, setHistory] = useState<ChatMessage[]>([{ role: "assistant", text: GREETING[locale] }]);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history, isSending]);

  const send = useCallback(async (): Promise<void> => {
    const trimmed = message.trim();
    if (!trimmed || isSending) {
      return;
    }

    setHistory((current) => [...current, { role: "user", text: trimmed }]);
    setMessage("");
    setIsSending(true);

    try {
      const response = await fetch("/api/onboarding/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, locale })
      });

      if (!response.ok) {
        setHistory((current) => [...current, { role: "assistant", text: ERROR_REPLY[locale] }]);
        return;
      }

      const data = (await response.json()) as { answer?: string };
      const answer = data.answer?.trim();
      setHistory((current) => [
        ...current,
        { role: "assistant", text: answer && answer.length > 0 ? answer : ERROR_REPLY[locale] }
      ]);
    } catch {
      setHistory((current) => [...current, { role: "assistant", text: ERROR_REPLY[locale] }]);
    } finally {
      setIsSending(false);
    }
  }, [message, isSending, locale]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <section className="img3-panel img3-panel--conversation">
      <div className="img3-chat img3-chat--conversation">
        <div className="img3-chat__right img3-chat__right--conversation">
          {history.map((entry, index) => (
            <div
              key={`${entry.role}-${index}`}
              className={`img3-bubble ${entry.role === "user" ? "img3-bubble--user" : "img3-bubble--assistant"}`}
            >
              <div className="img3-bubble__text img3-bubble__text--multiline">
                {entry.role === "assistant" ? <ReactMarkdown>{entry.text}</ReactMarkdown> : <p>{entry.text}</p>}
              </div>
            </div>
          ))}
          {isSending ? (
            <div className="img3-bubble img3-bubble--assistant">
              <div className="img3-bubble__text img3-bubble__text--multiline">…</div>
            </div>
          ) : null}
          <div ref={endRef} aria-hidden="true" />
        </div>
      </div>

      <div className="img3-conversation-bar">
        <div className="img3-conversation-bar__field">
          <textarea
            className="img3-conversation-bar__input"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={PLACEHOLDER[locale]}
            disabled={isSending}
          />
          <button
            type="button"
            className="img3-bottom-input__send"
            onClick={() => void send()}
            disabled={message.trim().length === 0 || isSending}
          >
            <svg className="img3-bottom-input__send-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 18V6" />
              <path d="M7.5 10.5L12 6l4.5 4.5" />
            </svg>
          </button>
        </div>
        <p className="img3-conversation-bar__note">{NOTE[locale]}</p>
      </div>
    </section>
  );
}
