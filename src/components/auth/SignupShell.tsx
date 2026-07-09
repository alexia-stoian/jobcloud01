"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

export function SignupShell(): React.ReactElement {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");

  function goBack(): void {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/");
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setMessage("");

    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;

    if (!response.ok) {
      if (response.status === 409) {
        setMessage(t("signupEmailExists"));
        return;
      }

      setMessage(payload?.message ?? t("signupFailed"));
      return;
    }

    setMessage(t("signupSuccess"));
  }

  return (
    <main className="page-shell">
      <section className="page-card">
        <button type="button" className="page-back" onClick={goBack}>
          {t("back")}
        </button>
        <h2>{t("signup")}</h2>

        <form className="stack-form" onSubmit={submit}>
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            Password
            <div className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
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
          <button type="submit">{t("signup")}</button>
        </form>

        {message ? <p className="page-feedback">{message}</p> : null}

        <p className="page-feedback">
          <a href="/login">{t("login")}</a>
        </p>
      </section>
    </main>
  );
}