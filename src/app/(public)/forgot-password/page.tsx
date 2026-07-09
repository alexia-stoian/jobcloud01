"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

export default function ForgotPasswordPage(): React.ReactElement {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");

  function goBack(): void {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/");
  }

  async function requestReset(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    await fetch("/api/auth/request-password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    setMessage("If the account exists, a reset token was issued.");
  }

  async function completeReset(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword })
    });
    setMessage(response.ok ? "Password reset completed." : "Password reset failed.");
  }

  return (
    <main className="page-shell">
      <section className="page-card">
        <button type="button" className="page-back" onClick={goBack}>
          {t("back")}
        </button>
        <h2>{t("forgotPassword")}</h2>
        <form className="stack-form" onSubmit={requestReset}>
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <button type="submit">Request reset</button>
        </form>
        <form className="stack-form" onSubmit={completeReset}>
          <label>
            Reset token
            <input value={token} onChange={(event) => setToken(event.target.value)} required />
          </label>
          <label>
            New password
            <div className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={8}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? t("hidePassword") : t("showPassword")}
              >
                {showPassword ? t("hidePassword") : t("showPassword")}
              </button>
            </div>
          </label>
          <button type="submit">Set new password</button>
        </form>
        {message ? <p className="page-feedback">{message}</p> : null}
      </section>
    </main>
  );
}
