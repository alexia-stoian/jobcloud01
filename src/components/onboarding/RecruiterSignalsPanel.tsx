"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { SignalCategory, SignalRecord } from "@/lib/ai/signals/signal-definitions";

type Props = {
  /**
   * Bumped by the host form after every user input. A change triggers a
   * re-fetch so the confidence bars stay live.
   */
  refreshKey: number;
};

type ApiResponse = {
  signals: SignalRecord[];
  inputCount: number;
  updatedAt: string | null;
};

/**
 * Client-visible gate. When this is not exactly "true" the component is never
 * rendered (returns null) so job seekers never receive it in the tree.
 * Next.js inlines NEXT_PUBLIC_* at build time.
 */
const SIGNALS_ADMIN_ENABLED = process.env.NEXT_PUBLIC_SIGNALS_ADMIN === "true";

const CATEGORY_ORDER: readonly SignalCategory[] = ["motivation", "behavioral", "skill"];

/**
 * Dev/admin/recruiter-only right-side panel showing the 11 invisible recruiter
 * signals with live confidence bars. INVISIBLE to job seekers by default.
 */
export default function RecruiterSignalsPanel({ refreshKey }: Props) {
  const t = useTranslations("recruiterSignals");
  const [signals, setSignals] = useState<SignalRecord[] | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/signals", { cache: "no-store" });
      if (!response.ok) {
        // 404 (flag off) / 401 (no session) -> render nothing.
        setSignals(null);
        return;
      }
      const data = (await response.json()) as ApiResponse;
      if (Array.isArray(data.signals)) {
        setSignals(data.signals);
      }
    } catch {
      setSignals(null);
    }
  }, []);

  useEffect(() => {
    if (!SIGNALS_ADMIN_ENABLED) {
      return;
    }
    void load();
  }, [load, refreshKey]);

  if (!SIGNALS_ADMIN_ENABLED || !signals) {
    return null;
  }

  const categoryLabel = (category: SignalCategory): string => {
    if (category === "motivation") {
      return t("categoryMotivation");
    }
    if (category === "behavioral") {
      return t("categoryBehavioral");
    }
    return t("categorySkill");
  };

  return (
    <aside className="img3-signals-panel" aria-label="Recruiter signals (admin)">
      <h3 className="img3-signals-panel__title" style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}>
        {t("title")}
      </h3>

      {CATEGORY_ORDER.map((category) => {
        const rows = signals.filter((signal) => signal.category === category);
        if (rows.length === 0) {
          return null;
        }

        return (
          <div key={category} className="img3-signals-group" style={{ marginBottom: 12 }}>
            <h4
              className="img3-signals-group__heading"
              style={{ margin: "0 0 6px", fontSize: 11, textTransform: "uppercase", opacity: 0.7 }}
            >
              {categoryLabel(category)}
            </h4>

            {rows.map((signal) => {
              const hasContradiction = signal.contradictionFlags.length > 0;
              const assessed = signal.confidence > 0;
              const hoverValue = assessed
                ? `${signal.name}: ${signal.inferredValue ?? "?"} — ${signal.confidence}%`
                : `${signal.name}: ${t("notAssessed")}`;

              return (
                <div
                  key={signal.key}
                  className="img3-signal-row"
                  title={hoverValue}
                  style={{ marginBottom: 8, cursor: "help" }}
                >
                  <div
                    className="img3-signal-row__head"
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, fontSize: 12 }}
                  >
                    <span className="img3-signal-row__name">{signal.name}</span>
                    {hasContradiction ? (
                      <span
                        className="img3-signal-row__badge"
                        title={t("contradiction")}
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#b91c1c",
                          background: "#fee2e2",
                          borderRadius: 4,
                          padding: "1px 5px"
                        }}
                      >
                        ⚠ {t("contradiction")}
                      </span>
                    ) : null}
                  </div>

                  <div
                    className="img3-signal-bar"
                    style={{
                      height: 6,
                      borderRadius: 999,
                      background: "#e5e7eb",
                      overflow: "hidden",
                      margin: "3px 0"
                    }}
                  >
                    <div
                      className="img3-signal-bar__fill"
                      style={{
                        width: `${signal.confidence}%`,
                        height: "100%",
                        borderRadius: 999,
                        transition: "width 0.4s ease",
                        background: hasContradiction ? "#f59e0b" : "#2563eb"
                      }}
                    />
                  </div>

                  <span className="img3-signal-row__value" style={{ fontSize: 11, opacity: 0.75 }}>
                    {assessed ? `${signal.inferredValue ?? "—"} · ${signal.confidence}%` : t("notAssessed")}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </aside>
  );
}
