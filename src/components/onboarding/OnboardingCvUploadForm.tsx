"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

const COMPLETION_HELP_TEXT = [
  "Your profile is now filled as completely as I can make it from your CV and your answers.",
  "I can also help with:",
  "- improve or rewrite your CV",
  "- draft or tailor a cover letter",
  "- prepare interview questions and sample answers",
  "- benchmark salary expectations in Switzerland",
  "- identify skill gaps and learning priorities",
  "- refine your role positioning and profile story",
  "- explain permit and relocation implications",
  "- suggest concrete next steps for your job search",
  "What would you like help with next?"
].join("\n");

export function OnboardingCvUploadForm({ locale: _locale }: Props): React.ReactElement {
  const [message, setMessage] = useState("");
  const [customOptionDraft, setCustomOptionDraft] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<InteractiveQuestion | null>(null);
  const [isDone, setIsDone] = useState(false);
  const [hasUploadedCv, setHasUploadedCv] = useState(false);
  const didInitRef = useRef(false);
  const didRestoreRef = useRef(false);

  const applyInteractiveResponse = useCallback((data: InteractiveResponse, introText?: string): void => {
    setHasUploadedCv(Boolean(data.hasCvUpload));
    setCurrentQuestion(data.question);
    setIsDone(data.done);

    if (introText) {
      setHistory((current) => [...current, { role: "assistant", text: introText }]);
    }

    const nextQuestion = data.question;
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
            ? COMPLETION_HELP_TEXT
            : "Great, your core profile fields are now filled. Next step: upload your CV so I can extract experience details and fill remaining profile sections automatically."
        }
      ]);
    }
  }, [hasUploadedCv]);

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
          setCurrentQuestion(resumed.question);
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
        setHistory((current) => [...current, { role: "assistant", text: "Assistant is temporarily unavailable. Please try again." }]);
        return;
      }

      const data = (await response.json()) as InteractiveResponse;
      applyInteractiveResponse(
        data,
        "Great to meet you 🙂 I will guide you step-by-step and save each confirmed answer to your profile right away."
      );
    } catch {
      setHistory((current) => [...current, { role: "assistant", text: "Assistant is temporarily unavailable. Please try again." }]);
    } finally {
      setIsSending(false);
    }
  }, [applyInteractiveResponse]);

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

  const submitAnswerValue = useCallback(async (value: string): Promise<void> => {
    if (isSending || !currentQuestion) {
      return;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    setIsSending(true);
    setHistory((current) => [...current, { role: "user", text: trimmed }]);
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
        setHistory((current) => [...current, { role: "assistant", text: "I could not save that answer. Please try again." }]);
        return;
      }

      const data = (await response.json()) as InteractiveResponse & { saved?: { field: string; value: string } };
      if (data.blocked) {
        setHistory((current) => [
          ...current,
          { role: "assistant", text: data.message ?? "I cannot share that. Let us continue with your profile." }
        ]);
        return;
      }

      applyInteractiveResponse(data);
    } catch {
      setHistory((current) => [...current, { role: "assistant", text: "I could not save that answer. Please try again." }]);
    } finally {
      setIsSending(false);
    }
  }, [_locale, applyInteractiveResponse, currentQuestion, isSending]);

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
        setHistory((current) => [...current, { role: "assistant", text: "I could not answer that right now. Please try again." }]);
        return;
      }

      const data = (await response.json()) as { answer?: string };
      const answer = data.answer?.trim();
      if (answer) {
        setHistory((current) => [...current, { role: "assistant", text: answer }]);
      }
    } catch {
      setHistory((current) => [...current, { role: "assistant", text: "I could not answer that right now. Please try again." }]);
    } finally {
      setIsSending(false);
    }
  }, [_locale, isSending]);

  const handleCvUpload = useCallback(async (file: File): Promise<void> => {
    setIsUploading(true);
    setHistory((current) => [...current, { role: "user", text: `📄 ${file.name}` }]);
    setHistory((current) => [...current, { role: "assistant", text: "Reading your CV… ⏳" }]);

    try {
      // Step 1: parse file to plain text server-side
      const formData = new FormData();
      formData.append("file", file);

      const parseRes = await fetch("/api/cv/parse", { method: "POST", body: formData });
      if (!parseRes.ok) {
        const err = (await parseRes.json()) as { detail?: string };
        setHistory((current) => [
          ...current,
          { role: "assistant", text: err.detail ?? "I could not read this file. Please try a PDF or plain .txt file." }
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
        setHistory((current) => [...current, { role: "assistant", text: "CV parsed but I could not save the extracted information. Please try again." }]);
        return;
      }

      const data = (await uploadRes.json()) as { profileSeeds?: Record<string, unknown>; facts?: Record<string, unknown> };
      const seeds = data.profileSeeds ?? data.facts ?? {};
      const filled = Object.entries(seeds).filter(([, v]) => v && String(v).trim().length > 0).map(([k]) => k);
      setHasUploadedCv(true);

      setHistory((current) => current.filter((m) => m.text !== "Reading your CV… ⏳"));

      if (filled.length > 0) {
        setHistory((current) => [
          ...current,
          {
            role: "assistant",
            text: "Your CV has been analyzed and your profile has been filled with the information I could confidently detect. I will now ask the remaining preference questions needed to complete your profile."
          }
        ]);
      } else {
        setHistory((current) => [
          ...current,
          { role: "assistant", text: "CV uploaded ✅ I could not extract structured fields automatically — let's continue filling in your profile together." }
        ]);
      }

      const nextRes = await fetch("/api/onboarding/interactive", { method: "GET", cache: "no-store" });
      if (nextRes.ok) {
        const nextData = (await nextRes.json()) as InteractiveResponse;
        if (nextData.done) {
          setCurrentQuestion(null);
          setIsDone(true);
          setHistory((current) => [...current, { role: "assistant", text: COMPLETION_HELP_TEXT }]);
        } else {
          applyInteractiveResponse(nextData);
        }
      }
    } catch {
      setHistory((current) => [...current, { role: "assistant", text: "Something went wrong uploading your CV. Please try again." }]);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [_locale, applyInteractiveResponse]);

  async function submitAnswer(): Promise<void> {
    // Route to question answer or free chat depending on context
    if (currentQuestion) {
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
    if (didInitRef.current || isSending || history.length > 0) {
      return;
    }

    didInitRef.current = true;
    void loadInteractiveQuestion();
  }, [history.length, isSending, loadInteractiveQuestion]);

  useEffect(() => {
    if (history.length > 0) {
      didRestoreRef.current = true;
    }
  }, [history.length]);

  return (
    <section className="img3-panel img3-panel--conversation">
      <div className="img3-chat img3-chat--conversation">
        <div className="img3-chat__right img3-chat__right--conversation">
          {history.map((entry, index) => (
            <div key={`${entry.role}-${index}-${entry.text}`} className={`img3-bubble ${entry.role === "user" ? "img3-bubble--user" : "img3-bubble--assistant"}`}>
              <p className="img3-bubble__text img3-bubble__text--multiline">{entry.text}</p>
              {entry.role === "assistant" && entry.options && entry.options.length > 0 && entry.field === currentQuestion?.field ? (
                <div className="img3-options" role="group" aria-label={`Options for ${entry.field}`}>
                  {entry.options.map((option) => (
                    <button
                      key={`${entry.field}-${option.value}`}
                      type="button"
                      className="img3-option"
                      onClick={() => {
                        void submitAnswerValue(option.value);
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
                          void submitAnswerValue(customOptionDraft);
                        }
                      }}
                      disabled={isSending}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ))}
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
                  ? "Profile complete. You can still type changes anytime."
                  : "Write your answer here"
            }
          />
          <button type="button" className="img3-bottom-input__send" onClick={submitAnswer} disabled={message.trim().length === 0 || isSending || isUploading}>
            <svg className="img3-bottom-input__send-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 18V6" />
              <path d="M7.5 10.5L12 6l4.5 4.5" />
            </svg>
          </button>
        </div>
        <p className="img3-conversation-bar__note">Press <strong>+</strong> to upload your CV · Every answer is saved instantly to your Profile.</p>
      </div>
    </section>
  );
}
