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
  options?: string[];
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

const CV_READ_FAILED: Record<Locale, string> = {
  en: "Sorry, I couldn't read that file. Please try another CV.",
  de: "Entschuldigung, ich konnte die Datei nicht lesen. Bitte versuche einen anderen Lebenslauf.",
  fr: "Désolé, je n'ai pas pu lire ce fichier. Essaie un autre CV."
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
 * Every user message (typed text, a tapped option, or an uploaded CV's text) is
 * forwarded to `POST /api/onboarding/assistant`, which invokes the agent and
 * returns `{ answer, options }`. The agent owns the entire conversation; the
 * options it returns are rendered as clickable boxes under its latest reply.
 */
export function CareerGuideChat({ locale }: Props): React.ReactElement {
  const [history, setHistory] = useState<ChatMessage[]>([{ role: "assistant", text: GREETING[locale] }]);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history, isSending, isUploading]);

  // Send a prompt to the agent and append its reply. The caller is responsible
  // for appending the user-facing bubble (typed text / tapped option / CV note).
  const sendToAgent = useCallback(
    async (prompt: string): Promise<void> => {
      setIsSending(true);
      try {
        const response = await fetch("/api/onboarding/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: prompt, locale })
        });

        if (!response.ok) {
          setHistory((current) => [...current, { role: "assistant", text: ERROR_REPLY[locale] }]);
          return;
        }

        const data = (await response.json()) as { answer?: string; options?: string[] };
        const answer = data.answer?.trim();
        setHistory((current) => [
          ...current,
          {
            role: "assistant",
            text: answer && answer.length > 0 ? answer : ERROR_REPLY[locale],
            options: Array.isArray(data.options) ? data.options.filter((o) => o.trim().length > 0) : []
          }
        ]);
      } catch {
        setHistory((current) => [...current, { role: "assistant", text: ERROR_REPLY[locale] }]);
      } finally {
        setIsSending(false);
      }
    },
    [locale]
  );

  const sendTyped = useCallback(async (): Promise<void> => {
    const trimmed = message.trim();
    if (!trimmed || isSending || isUploading) {
      return;
    }
    setMessage("");
    setHistory((current) => [...current, { role: "user", text: trimmed }]);
    await sendToAgent(trimmed);
  }, [message, isSending, isUploading, sendToAgent]);

  const chooseOption = useCallback(
    async (option: string): Promise<void> => {
      if (isSending || isUploading) {
        return;
      }
      setHistory((current) => [...current, { role: "user", text: option }]);
      await sendToAgent(option);
    },
    [isSending, isUploading, sendToAgent]
  );

  const handleCvUpload = useCallback(
    async (file: File): Promise<void> => {
      if (isSending || isUploading) {
        return;
      }
      setIsUploading(true);
      setHistory((current) => [...current, { role: "user", text: `📄 ${file.name}` }]);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const parseRes = await fetch("/api/cv/parse", { method: "POST", body: formData });
        if (!parseRes.ok) {
          if (parseRes.status === 401) {
            window.location.href = "/login?callbackUrl=/onboarding";
            return;
          }
          setHistory((current) => [...current, { role: "assistant", text: CV_READ_FAILED[locale] }]);
          return;
        }
        const { text: cvText } = (await parseRes.json()) as { text?: string };
        if (!cvText || cvText.trim().length === 0) {
          setHistory((current) => [...current, { role: "assistant", text: CV_READ_FAILED[locale] }]);
          return;
        }
        await sendToAgent(`Here is my CV:\n\n${cvText}`);
      } catch {
        setHistory((current) => [...current, { role: "assistant", text: CV_READ_FAILED[locale] }]);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [isSending, isUploading, locale, sendToAgent]
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendTyped();
    }
  };

  const busy = isSending || isUploading;

  return (
    <section className="img3-panel img3-panel--conversation cg-conversation">
      <div className="cg-conversation__scroll">
        <div className="img3-chat img3-chat--conversation">
          <div className="img3-chat__right img3-chat__right--conversation">
            {history.map((entry, index) => {
              const showOptions =
                entry.role === "assistant" &&
                Array.isArray(entry.options) &&
                entry.options.length > 0 &&
                index === history.length - 1 &&
                !isSending;
              return (
                <div
                  key={`${entry.role}-${index}`}
                  className={`img3-bubble ${entry.role === "user" ? "img3-bubble--user" : "img3-bubble--assistant"}`}
                >
                  <div className="img3-bubble__text img3-bubble__text--multiline">
                    {entry.role === "assistant" ? <ReactMarkdown>{entry.text}</ReactMarkdown> : <p>{entry.text}</p>}
                  </div>
                  {showOptions ? (
                    <div className="img3-options" role="group" aria-label="Suggested answers">
                      {entry.options!.map((option, optionIndex) => (
                        <button
                          key={`${option}-${optionIndex}`}
                          type="button"
                          className="img3-option"
                          disabled={busy}
                          onClick={() => void chooseOption(option)}
                        >
                          <span className="img3-option__content">
                            <span className="img3-option__label">{option}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {busy ? (
              <div className="img3-bubble img3-bubble--assistant">
                <div className="img3-bubble__text img3-bubble__text--multiline">…</div>
              </div>
            ) : null}
            <div ref={endRef} aria-hidden="true" />
          </div>
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
              if (file) {
                void handleCvUpload(file);
              }
            }}
          />
          <button
            type="button"
            className="img3-conversation-bar__plus-btn"
            title="Upload your CV"
            aria-label="Upload CV"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? "…" : "+"}
          </button>
          <textarea
            className="img3-conversation-bar__input"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={PLACEHOLDER[locale]}
            disabled={busy}
          />
          <button
            type="button"
            className="img3-bottom-input__send"
            onClick={() => void sendTyped()}
            disabled={message.trim().length === 0 || busy}
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
