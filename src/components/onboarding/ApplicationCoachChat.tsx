"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  en: "Hi! ✍️ I'm your Application Coach. I can draft and refine cover letters, and run mock interviews so you walk in ready. What role are you applying for?",
  de: "Hallo! ✍️ Ich bin dein Bewerbungs-Coach. Ich schreibe und verfeinere Anschreiben und übe Vorstellungsgespräche mit dir. Auf welche Stelle bewirbst du dich?",
  fr: "Salut ! ✍️ Je suis ton coach de candidature. Je rédige et peaufine des lettres de motivation et je simule des entretiens. Pour quel poste postules-tu ?"
};

const ERROR_REPLY: Record<Locale, string> = {
  en: "Sorry, something went wrong reaching the Application Coach. Please try again.",
  de: "Entschuldigung, der Bewerbungs-Coach ist gerade nicht erreichbar. Bitte versuche es erneut.",
  fr: "Désolé, une erreur s'est produite en contactant le coach de candidature. Réessaie."
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

const STORAGE_KEY = "appcoach-history-v1";

type StoredHistory = {
  email: string;
  history: ChatMessage[];
};

/**
 * Application Coach chat — a plain conversation with the ApplicationCoach
 * AgentCore runtime (cover letters + interview practice).
 *
 * Every user message is forwarded to `POST /api/application-coach`, which
 * invokes the agent, persists any emitted cover letters / interview sessions,
 * and returns `{ answer, options, openField }`. The agent owns the whole
 * conversation; the options it returns are rendered as clickable boxes.
 *
 * The transcript is cached in `localStorage`, scoped to the signed-in user's
 * email so a different account on the same browser never sees another user's
 * chat. The agent keeps its own server-side memory via a per-user session id.
 */
export function ApplicationCoachChat({ locale }: Props): React.ReactElement {
  const router = useRouter();
  const [history, setHistory] = useState<ChatMessage[]>([{ role: "assistant", text: GREETING[locale] }]);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const emailRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history, isSending]);

  // Restore the saved conversation on mount (scoped to the current user).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const session = (await fetch("/api/auth/session", { cache: "no-store" }).then((r) => r.json())) as {
          user?: { email?: string };
        };
        const email = session?.user?.email ?? null;
        emailRef.current = email;
        const raw = email ? window.localStorage.getItem(STORAGE_KEY) : null;
        if (raw) {
          const parsed = JSON.parse(raw) as StoredHistory;
          if (
            parsed.email === email &&
            Array.isArray(parsed.history) &&
            parsed.history.length > 0 &&
            !cancelled
          ) {
            setHistory(
              parsed.history.filter(
                (m) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string"
              )
            );
          }
        }
      } catch {
        // Ignore — start from the greeting.
      } finally {
        if (!cancelled) {
          setHydrated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the conversation after each change (once the initial load is done).
  useEffect(() => {
    if (!hydrated || !emailRef.current) {
      return;
    }
    try {
      const payload: StoredHistory = { email: emailRef.current, history };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore quota / serialization errors.
    }
  }, [history, hydrated]);

  const sendToAgent = useCallback(
    async (prompt: string): Promise<void> => {
      setIsSending(true);
      try {
        const response = await fetch("/api/application-coach", {
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
        // The agent may have persisted a cover letter / interview server-side;
        // invalidate the App Router cache so any later view refetches fresh data.
        router.refresh();
      } catch {
        setHistory((current) => [...current, { role: "assistant", text: ERROR_REPLY[locale] }]);
      } finally {
        setIsSending(false);
      }
    },
    [locale, router]
  );

  const sendTyped = useCallback(async (): Promise<void> => {
    const trimmed = message.trim();
    if (!trimmed || isSending) {
      return;
    }
    setMessage("");
    setHistory((current) => [...current, { role: "user", text: trimmed }]);
    await sendToAgent(trimmed);
  }, [message, isSending, sendToAgent]);

  const chooseOption = useCallback(
    async (option: string): Promise<void> => {
      if (isSending) {
        return;
      }
      setHistory((current) => [...current, { role: "user", text: option }]);
      await sendToAgent(option);
    },
    [isSending, sendToAgent]
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendTyped();
    }
  };

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
                          disabled={isSending}
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
            {isSending ? (
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
            onClick={() => void sendTyped()}
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
