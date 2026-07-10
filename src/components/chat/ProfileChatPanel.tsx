"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type InterpretResponse = {
  intents: Array<{ field: string; operation: "set"; value: string }>;
  preview: string[];
  confirmationId: string;
};

type Props = {
  locale: "en" | "de" | "fr";
};

export function ProfileChatPanel({ locale }: Props): React.ReactElement {
  const t = useTranslations("profile");
  const [message, setMessage] = useState("primary role: Senior QA Engineer");
  const [preview, setPreview] = useState<string[]>([]);
  const [payload, setPayload] = useState<InterpretResponse | null>(null);
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function interpret(): Promise<void> {
    setLoading(true);
    try {
      const response = await fetch("/api/profile/chat/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, locale })
      });

      const data = (await response.json()) as InterpretResponse;
      if (!response.ok) {
        setResult(t("chatInterpretFailed"));
        return;
      }

      setPreview(data.preview);
      setPayload(data);
      setResult("");
    } finally {
      setLoading(false);
    }
  }

  async function confirm(accepted: boolean): Promise<void> {
    if (!payload) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/profile/chat/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intents: payload.intents,
          locale,
          confirmationAccepted: accepted,
          confirmationId: payload.confirmationId
        })
      });

      const data = (await response.json()) as { success: boolean; warnings?: string[] };
      if (response.ok && data.success) {
        setResult(data.warnings?.join(" ") || t("chatApplied"));
        setPayload(null);
        setPreview([]);
        return;
      }

      setResult(t("chatConfirmationRequired"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="img3-panel">
      <div className="img3-chat">
        <div className="img3-chat__left">
          <p>{t("chatAssistantLabel")}</p>
          <p>{t("chatPromptExample")}</p>
        </div>
        <div className="img3-chat__right">
          <div className="img3-bubble">{message}</div>
        </div>
      </div>

      <label className="onboarding-label" htmlFor="assistant-message">
        {t("chatPromptLabel")}
      </label>
      <textarea
        id="assistant-message"
        className="onboarding-textarea"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={4}
      />
      <div className="onboarding-actions">
        <button onClick={interpret} type="button" disabled={loading} className="img3-bottom-input__send">
          {loading ? "..." : "↑"}
        </button>
      </div>

      {preview.length > 0 ? (
        <div className="onboarding-result">
          <h3>{t("chatPreviewTitle")}</h3>
          <ul className="assistant-preview__list">
            {preview.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="assistant-preview__actions">
            <button onClick={() => confirm(true)} type="button" disabled={loading} className="hero-button hero-button--primary">
              {t("chatConfirm")}
            </button>
            <button onClick={() => confirm(false)} type="button" disabled={loading} className="hero-button">
              {t("chatReject")}
            </button>
          </div>
        </div>
      ) : null}

      {result ? <p className="assistant-result">{result}</p> : null}
    </section>
  );
}
