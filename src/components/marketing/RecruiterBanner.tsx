"use client";

import { useState } from "react";

type RecruiterBannerProps = {
  title: string;
  subtitle: string;
  dismissLabel: string;
};

export function RecruiterBanner({ title, subtitle, dismissLabel }: RecruiterBannerProps): React.ReactElement | null {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) {
    return null;
  }

  return (
    <aside className="recruiter-banner" aria-label="Recruiter prompt">
      <span className="recruiter-banner__icon" aria-hidden="true">
        ◔
      </span>
      <div className="recruiter-banner__copy">
        <span className="recruiter-banner__title">{title}</span>
        <span className="recruiter-banner__subtitle">{subtitle}</span>
      </div>
      <button
        type="button"
        className="recruiter-banner__dismiss"
        aria-label={dismissLabel}
        onClick={() => setDismissed(true)}
      >
        ×
      </button>
    </aside>
  );
}