"use client";

import { useTranslations } from "next-intl";

type Props = {
  isMinimallyComplete: boolean;
  missingCriticalFields: string[];
};

export function ProfileCompletionStatus({
  isMinimallyComplete,
  missingCriticalFields
}: Props): React.ReactElement {
  const t = useTranslations("profile");

  if (isMinimallyComplete) {
    return <p className="img3-note">{t("completionComplete")}</p>;
  }

  return (
    <div className="img3-panel">
      <p className="img3-note">{t("completionIncomplete")}</p>
      <p>{t("warningsTitle")}:</p>
      <ul className="img3-list">
        {missingCriticalFields.map((field) => (
          <li key={field}>{field}</li>
        ))}
      </ul>
    </div>
  );
}
