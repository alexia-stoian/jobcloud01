"use client";

import { useTranslations } from "next-intl";

type Props = {
  history: Array<{ id: string; createdAt: string; source: string }>;
};

export function ProfileHistoryTimeline({ history }: Props): React.ReactElement {
  const t = useTranslations("profile");

  return (
    <section className="img3-panel">
      <h3>{t("historyTitle")}</h3>
      <ul className="img3-list">
        {history.map((event) => (
          <li key={event.id}>
            {event.createdAt}: {event.source}
          </li>
        ))}
      </ul>
    </section>
  );
}
