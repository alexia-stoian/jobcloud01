"use client";

import { useState, useTransition } from "react";

type Props = {
  locale: string;
};

export function LanguageSwitcher({ locale }: Props): React.ReactElement {
  const [selected, setSelected] = useState(locale);
  const [pending, startTransition] = useTransition();

  async function updateLocale(nextLocale: string): Promise<void> {
    setSelected(nextLocale);
    startTransition(async () => {
      document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000; samesite=lax`;

      await fetch("/api/me/locale", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept-Language": nextLocale
        },
        body: JSON.stringify({ locale: nextLocale })
      }).catch(() => undefined);

      window.location.reload();
    });
  }

  return (
    <label className="locale-switcher" aria-label="Language selector">
      <span className="locale-switcher__icon" aria-hidden="true">
        ◎
      </span>
      <select
        className="locale-switcher__select"
        value={selected}
        onChange={(event) => updateLocale(event.target.value)}
        disabled={pending}
      >
        <option value="en">English</option>
        <option value="de">Deutsch</option>
        <option value="fr">Francais</option>
      </select>
      <span className="locale-switcher__caret" aria-hidden="true">
        ▾
      </span>
    </label>
  );
}
