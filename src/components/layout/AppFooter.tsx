"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { CircleHalf, Globe } from "@phosphor-icons/react";
import { JsLogo } from "./JsLogo";

type ThemeChoice = "light" | "dark" | "auto";

const LOCALES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" }
];

const FOOTER_LINKS: { key: string; label: string }[] = [
  { key: "terms", label: "Terms of Use" },
  { key: "privacy", label: "Data privacy notice" },
  { key: "cookies", label: "Cookie settings" },
  { key: "legal", label: "Legal notice" },
  { key: "contact", label: "Contact" }
];

function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  const resolved =
    choice === "auto"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : choice;
  root.dataset.theme = resolved;
}

export function AppFooter(): React.ReactElement {
  const locale = useLocale();
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>("light");

  useEffect(() => {
    const stored = (window.localStorage.getItem("js-theme") as ThemeChoice | null) ?? "light";
    setTheme(stored);
    applyTheme(stored);
  }, []);

  function chooseTheme(choice: ThemeChoice): void {
    setTheme(choice);
    window.localStorage.setItem("js-theme", choice);
    applyTheme(choice);
    setThemeMenuOpen(false);
  }

  async function updateLocale(nextLocale: string): Promise<void> {
    if (nextLocale === locale) {
      setLangMenuOpen(false);
      return;
    }

    document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    await fetch("/api/me/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept-Language": nextLocale },
      body: JSON.stringify({ locale: nextLocale })
    }).catch(() => undefined);
    window.location.reload();
  }

  const activeLocaleLabel = LOCALES.find((entry) => entry.code === locale)?.label ?? "English";

  return (
    <footer className="app-footer" aria-label="Footer">
      <div className="app-footer__inner">
        <div className="app-footer__top">
          <JsLogo className="app-footer__logo" height={28} />
          <div className="app-footer__settings">
            <div className="app-footer__menu">
              <button
                type="button"
                className="app-footer__button"
                onClick={() => {
                  setThemeMenuOpen((value) => !value);
                  setLangMenuOpen(false);
                }}
                aria-haspopup="menu"
                aria-expanded={themeMenuOpen}
              >
                <CircleHalf size={20} weight="fill" aria-hidden="true" />
                <span>Change theme</span>
              </button>
              {themeMenuOpen ? (
                <div className="app-footer__popover" role="menu" aria-label="Theme">
                  {(["light", "dark", "auto"] as ThemeChoice[]).map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      role="menuitemradio"
                      aria-checked={theme === choice}
                      className={`app-footer__popover-item${theme === choice ? " app-footer__popover-item--active" : ""}`}
                      onClick={() => chooseTheme(choice)}
                    >
                      {choice === "light" ? "Light" : choice === "dark" ? "Dark" : "Auto"}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="app-footer__menu">
              <button
                type="button"
                className="app-footer__button"
                onClick={() => {
                  setLangMenuOpen((value) => !value);
                  setThemeMenuOpen(false);
                }}
                aria-haspopup="menu"
                aria-expanded={langMenuOpen}
              >
                <Globe size={20} weight="regular" aria-hidden="true" />
                <span>{activeLocaleLabel}</span>
              </button>
              {langMenuOpen ? (
                <div className="app-footer__popover" role="menu" aria-label="Language">
                  {LOCALES.map((entry) => (
                    <button
                      key={entry.code}
                      type="button"
                      role="menuitemradio"
                      aria-checked={locale === entry.code}
                      className={`app-footer__popover-item${locale === entry.code ? " app-footer__popover-item--active" : ""}`}
                      onClick={() => updateLocale(entry.code)}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="app-footer__divider" aria-hidden="true" />

        <div className="app-footer__bottom">
          <nav className="app-footer__links" aria-label="Legal">
            {FOOTER_LINKS.map((item) => (
              <a key={item.key} href="#" className="js-link">
                {item.label}
              </a>
            ))}
          </nav>
          <p className="app-footer__copy">© 2026 JobCloud AG</p>
        </div>
      </div>
    </footer>
  );
}
