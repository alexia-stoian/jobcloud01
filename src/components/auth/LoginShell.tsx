"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

const LOGIN_FALLBACK_ROUTE = "/profile/summary" as const;

export function LoginShell(): React.ReactElement {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  function goBack(): void {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    // Read the actual field values from the form rather than React state.
    // Browser autofill sets the input DOM value WITHOUT firing React's onChange,
    // so the controlled state can be empty even when the fields show credentials.
    const formData = new FormData(event.currentTarget);
    const emailValue = ((formData.get("email") as string | null) ?? email).trim();
    const passwordValue = (formData.get("password") as string | null) ?? password;

    const result = await signIn("credentials", {
      email: emailValue,
      password: passwordValue,
      redirect: false,
      callbackUrl: LOGIN_FALLBACK_ROUTE
    });

    if (!result || result.error) {
      setError("Unable to login. Verify your account and credentials.");
      return;
    }

    const destination = (result.url as typeof LOGIN_FALLBACK_ROUTE | undefined) ?? LOGIN_FALLBACK_ROUTE;
    router.replace(destination);
    router.refresh();
  }

  return (
    <main className="page-shell">
      <section className="page-card">
        <button type="button" className="page-back" onClick={goBack}>
          {t("back")}
        </button>
        <h2>{t("login")}</h2>

        <form className="stack-form" onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              name="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <div className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
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
          <button type="submit">{t("login")}</button>
        </form>

        {error ? <p className="page-feedback">{error}</p> : null}

        <Link href="/forgot-password" className="page-inline-link">
          {t("forgotPassword")}
        </Link>
        <p className="page-feedback">
          <Link href="/signup">{t("signup")}</Link>
        </p>
      </section>
    </main>
  );
}