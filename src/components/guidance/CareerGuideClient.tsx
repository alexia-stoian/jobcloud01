"use client";

import { useEffect, useState } from "react";

type GuidanceSection = {
  id: string;
  title: string;
  content: string;
};

type GuidanceData = {
  sections: GuidanceSection[];
  generatedAt: string;
  profileRole: string | null;
  profileLocation: string | null;
};

export function CareerGuideClient(): React.ReactElement {
  const [data, setData] = useState<GuidanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch("/api/guidance", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error ?? "guidance_error");
        }
        return res.json() as Promise<GuidanceData>;
      })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "guidance_error");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="guidance-loading">
        <div className="guidance-loading__spinner" />
        <p className="guidance-loading__text">Analysing your profile and generating personalised guidance…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="guidance-error">
        <p>Could not load guidance right now. Make sure your profile has at least a target role and location filled in, then try again.</p>
        <button
          type="button"
          className="guidance-retry"
          onClick={() => { window.location.reload(); }}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="guidance-root">
      {(data.profileRole || data.profileLocation) && (
        <p className="guidance-meta">
          {[data.profileRole, data.profileLocation].filter(Boolean).join(" · ")}
          <span className="guidance-meta__time"> · Generated {new Date(data.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </p>
      )}

      <div className="guidance-grid">
        {data.sections.map((section) => (
          <article key={section.id} className={`guidance-card guidance-card--${section.id}`}>
            <h2 className="guidance-card__title">{section.title}</h2>
            <p className="guidance-card__body">{section.content}</p>
          </article>
        ))}
      </div>

      <button
        type="button"
        className="guidance-refresh"
        onClick={() => { window.location.reload(); }}
      >
        Refresh guidance
      </button>
    </div>
  );
}
