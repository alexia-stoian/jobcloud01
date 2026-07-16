"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { SignalCategory, SignalRecord } from "@/lib/ai/signals/signal-definitions";

/**
 * Admin-only right-side profile + signals panel.
 *
 * REAL-TIME MECHANISM — short-interval polling (4s).
 * ------------------------------------------------------------------
 * When a `userId` is selected and this panel is mounted we do an immediate
 * fetch (so the panel populates instantly) and then re-fetch
 * `GET /api/admin/users/${userId}` every 4000ms. The endpoint is admin-gated
 * server-side (`requireAdmin`), so nothing here can leak to job seekers.
 *
 * Why polling and NOT SSE/WebSocket: this is a Next.js 15 App Router app with
 * plain route handlers and no existing socket/streaming infrastructure. Signal
 * writes are fire-and-forget from Phase 7 onboarding, so there is no push
 * channel to subscribe to. A 4s poll of an already-built admin read endpoint is
 * the simplest reliable option, satisfies "within a few seconds", adds no new
 * dependencies or server state, and cannot leak signals. SSE would add a new
 * streaming route + connection lifecycle for no functional gain at this scale.
 *
 * The interval is cleared on unmount AND whenever `userId` changes (effect
 * cleanup), so exactly one poller runs for the currently-selected user and none
 * lingers after the panel is closed.
 */

type ProfileBundle = {
  fullName: string | null;
  currentJobSituation: string | null;
  employmentObjective: string | null;
  primaryRole: string | null;
  preferredLocation: string | null;
  targetRoles: string | null;
  targetSeniority: string | null;
  targetIndustries: string | null;
  preferredWorkModel: string | null;
  contractPreference: string | null;
  workRate: string | null;
  workPermitStatus: string | null;
  salaryExpectation: string | null;
  visaSponsorship: string | null;
  relocationWillingness: string | null;
  commuteRadius: string | null;
  locale: string;
};

type CompletionBundle = {
  isMinimallyComplete: boolean;
  missingCriticalFields: string[];
};

type QualificationBundle = { category: string; value: string };

type HistoryBundle = { id: string; createdAt: string; source: string };

type OnboardingBundle = {
  targetRole: string | null;
  currentStep: string | null;
  cvFileName: string | null;
  cvExtractedFacts: unknown;
  conversationHistory: unknown;
  lastInteractedAt: string | null;
};

type UserBundle = { id: string; email: string; name: string };

type ApiBundle = {
  user: UserBundle;
  profile: ProfileBundle | null;
  completion: CompletionBundle | null;
  qualifications: QualificationBundle[];
  history: HistoryBundle[];
  onboarding: OnboardingBundle | null;
  signals: SignalRecord[];
  inputCount: number;
  updatedAt: string | null;
};

type Props = {
  userId: string;
  onClose: () => void;
};

const POLL_INTERVAL_MS = 4000;

const CATEGORY_ORDER: readonly SignalCategory[] = ["motivation", "behavioral", "skill"];

/** Ordered list of profile fields → i18n label key under `admin.fields.*`. */
const PROFILE_FIELDS: ReadonlyArray<{ key: keyof ProfileBundle; label: string }> = [
  { key: "fullName", label: "fullName" },
  { key: "currentJobSituation", label: "currentJobSituation" },
  { key: "employmentObjective", label: "employmentObjective" },
  { key: "primaryRole", label: "primaryRole" },
  { key: "preferredLocation", label: "preferredLocation" },
  { key: "targetRoles", label: "targetRoles" },
  { key: "targetSeniority", label: "targetSeniority" },
  { key: "targetIndustries", label: "targetIndustries" },
  { key: "preferredWorkModel", label: "preferredWorkModel" },
  { key: "contractPreference", label: "contractPreference" },
  { key: "workRate", label: "workRate" },
  { key: "workPermitStatus", label: "workPermitStatus" },
  { key: "salaryExpectation", label: "salaryExpectation" },
  { key: "visaSponsorship", label: "visaSponsorship" },
  { key: "relocationWillingness", label: "relocationWillingness" },
  { key: "commuteRadius", label: "commuteRadius" },
  { key: "locale", label: "locale" }
];

function toKeyValueEntries(value: unknown): Array<{ key: string; value: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value as Record<string, unknown>).map(([key, raw]) => ({
    key,
    value:
      raw === null || raw === undefined
        ? ""
        : typeof raw === "object"
          ? JSON.stringify(raw)
          : String(raw)
  }));
}

function summarizeConversation(value: unknown): Array<{ role: string; text: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => {
      const role = typeof item.role === "string" ? item.role : "message";
      const content =
        typeof item.content === "string"
          ? item.content
          : typeof item.text === "string"
            ? item.text
            : JSON.stringify(item);
      const text = content.length > 160 ? `${content.slice(0, 160)}…` : content;
      return { role, text };
    });
}

export function AdminProfilePanel({ userId, onClose }: Props): React.ReactElement {
  const t = useTranslations("admin");
  const tSignals = useTranslations("recruiterSignals");
  const [bundle, setBundle] = useState<ApiBundle | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const isMountedRef = useRef(true);

  const load = useCallback(
    async (isInitial: boolean): Promise<void> => {
      try {
        const response = await fetch(`/api/admin/users/${userId}`, { cache: "no-store" });
        if (!response.ok) {
          if (isMountedRef.current && isInitial) {
            setState("error");
          }
          return;
        }
        const data = (await response.json()) as ApiBundle;
        if (isMountedRef.current) {
          setBundle(data);
          setState("ready");
        }
      } catch {
        if (isMountedRef.current && isInitial) {
          setState("error");
        }
      }
    },
    [userId]
  );

  useEffect(() => {
    isMountedRef.current = true;
    // Reset to loading whenever the selected user changes so the panel does not
    // show stale content while the first fetch for the new user is in flight.
    setState("loading");
    setBundle(null);

    // Immediate fetch so the panel populates instantly …
    void load(true);
    // … then poll every 4s to keep profile + signals fresh in real time.
    const intervalId = setInterval(() => {
      void load(false);
    }, POLL_INTERVAL_MS);

    // Cleanup: clear the interval on unmount AND on userId change so exactly one
    // poller runs for the currently-selected user and none lingers after close.
    return () => {
      isMountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [load]);

  const dash = t("fieldEmpty");

  const categoryLabel = (category: SignalCategory): string => {
    if (category === "motivation") {
      return tSignals("categoryMotivation");
    }
    if (category === "behavioral") {
      return tSignals("categoryBehavioral");
    }
    return tSignals("categorySkill");
  };

  const cvFacts = bundle?.onboarding ? toKeyValueEntries(bundle.onboarding.cvExtractedFacts) : [];
  const conversation = bundle?.onboarding
    ? summarizeConversation(bundle.onboarding.conversationHistory)
    : [];

  return (
    <aside
      className="img3-signals-panel img3-panel"
      aria-label={t("profileHeading")}
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(560px, 92vw)",
        overflowY: "auto",
        background: "#ffffff",
        borderLeft: "1px solid #e5e7eb",
        boxShadow: "-8px 0 24px rgba(0,0,0,0.08)",
        padding: 20,
        zIndex: 50
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{t("profileHeading")}</h2>
        <button
          type="button"
          className="img3-button"
          onClick={onClose}
          aria-label={t("close")}
          title={t("close")}
        >
          ✕
        </button>
      </div>

      {state === "loading" && <p>{t("loading")}</p>}
      {state === "error" && <p role="alert">{t("error")}</p>}

      {state === "ready" && bundle && (
        <>
          {/* Header: name + email + completion badge */}
          <header style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{bundle.user.name}</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{bundle.user.email}</div>
            <span
              className={
                bundle.completion?.isMinimallyComplete
                  ? "img3-badge img3-badge--complete"
                  : "img3-badge img3-badge--incomplete"
              }
              style={{ marginTop: 6, display: "inline-block" }}
            >
              {bundle.completion?.isMinimallyComplete ? t("complete") : t("incomplete")}
            </span>
          </header>

          {/* Profile fields */}
          <section style={{ marginBottom: 18 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>
              {t("profileHeading")}
            </h3>
            {bundle.profile ? (
              <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {PROFILE_FIELDS.map((field) => {
                  const raw = bundle.profile ? bundle.profile[field.key] : null;
                  const value = raw === null || raw === undefined || raw === "" ? dash : String(raw);
                  return (
                    <div key={field.key}>
                      <dt style={{ fontSize: 10, textTransform: "uppercase", opacity: 0.6 }}>
                        {t(`fields.${field.label}`)}
                      </dt>
                      <dd style={{ margin: 0, fontSize: 12 }}>{value}</dd>
                    </div>
                  );
                })}
              </dl>
            ) : (
              <p style={{ fontSize: 12, opacity: 0.7 }}>{t("noData")}</p>
            )}
          </section>

          {/* Qualifications */}
          <section style={{ marginBottom: 18 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>
              {t("qualificationsHeading")}
            </h3>
            {bundle.qualifications.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {bundle.qualifications.map((q, index) => (
                  <li key={`${q.category}-${index}`} style={{ fontSize: 12 }}>
                    <strong>{q.category}:</strong> {q.value}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: 12, opacity: 0.7 }}>{t("noData")}</p>
            )}
          </section>

          {/* CV-derived facts + onboarding answers */}
          <section style={{ marginBottom: 18 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>
              {t("cvFactsHeading")}
            </h3>
            {bundle.onboarding ? (
              <>
                <dl style={{ margin: "0 0 8px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  <div>
                    <dt style={{ fontSize: 10, textTransform: "uppercase", opacity: 0.6 }}>
                      {t("fields.targetRole")}
                    </dt>
                    <dd style={{ margin: 0, fontSize: 12 }}>{bundle.onboarding.targetRole ?? dash}</dd>
                  </div>
                  <div>
                    <dt style={{ fontSize: 10, textTransform: "uppercase", opacity: 0.6 }}>
                      {t("fields.cvFileName")}
                    </dt>
                    <dd style={{ margin: 0, fontSize: 12 }}>{bundle.onboarding.cvFileName ?? dash}</dd>
                  </div>
                </dl>
                {cvFacts.length > 0 ? (
                  <dl style={{ margin: 0 }}>
                    {cvFacts.map((fact) => (
                      <div key={fact.key} style={{ marginBottom: 4 }}>
                        <dt style={{ fontSize: 10, textTransform: "uppercase", opacity: 0.6 }}>
                          {fact.key}
                        </dt>
                        <dd style={{ margin: 0, fontSize: 12 }}>{fact.value || dash}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p style={{ fontSize: 12, opacity: 0.7 }}>{t("noData")}</p>
                )}

                {conversation.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <h4 style={{ fontSize: 11, textTransform: "uppercase", opacity: 0.7, margin: "0 0 6px" }}>
                      {t("onboardingHeading")}
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {conversation.map((turn, index) => (
                        <li key={index} style={{ fontSize: 11, marginBottom: 3 }}>
                          <strong>{turn.role}:</strong> {turn.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p style={{ fontSize: 12, opacity: 0.7 }}>{t("noData")}</p>
            )}
          </section>

          {/* Profile history / timeline */}
          <section style={{ marginBottom: 18 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>
              {t("historyHeading")}
            </h3>
            {bundle.history.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {bundle.history.map((event) => (
                  <li key={event.id} style={{ fontSize: 11, marginBottom: 3 }}>
                    <span style={{ opacity: 0.6 }}>
                      {new Date(event.createdAt).toLocaleString()}
                    </span>{" "}
                    — {event.source}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ fontSize: 12, opacity: 0.7 }}>{t("noData")}</p>
            )}
          </section>

          {/* Signals — all 11, reusing RecruiterSignalsPanel row styling + evidence */}
          <section>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>
              {t("signalsHeading")}
            </h3>
            {CATEGORY_ORDER.map((category) => {
              const rows = bundle.signals.filter((signal) => signal.category === category);
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
                    return (
                      <div key={signal.key} className="img3-signal-row" style={{ marginBottom: 8 }}>
                        <div
                          className="img3-signal-row__head"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 6,
                            fontSize: 12
                          }}
                        >
                          <span className="img3-signal-row__name">{signal.name}</span>
                          {hasContradiction ? (
                            <span
                              className="img3-signal-row__badge"
                              title={tSignals("contradiction")}
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: "#b91c1c",
                                background: "#fee2e2",
                                borderRadius: 4,
                                padding: "1px 5px"
                              }}
                            >
                              ⚠ {tSignals("contradiction")}
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
                          {assessed
                            ? `${signal.inferredValue ?? dash} · ${signal.confidence}%`
                            : tSignals("notAssessed")}
                        </span>

                        {/* Evidence — admin dashboard is the reveal surface */}
                        {signal.evidence.length > 0 && (
                          <details style={{ marginTop: 4 }}>
                            <summary style={{ fontSize: 10, cursor: "pointer", opacity: 0.7 }}>
                              {t("evidenceHeading")} ({signal.evidence.length})
                            </summary>
                            <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                              {signal.evidence.map((item, index) => (
                                <li key={index} style={{ fontSize: 10, marginBottom: 2 }}>
                                  <span style={{ opacity: 0.6 }}>[{item.source}]</span> “{item.quote}”
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}

                        {/* Contradiction detail */}
                        {hasContradiction && (
                          <ul style={{ margin: "3px 0 0", paddingLeft: 16 }}>
                            {signal.contradictionFlags.map((flag, index) => (
                              <li key={index} style={{ fontSize: 10, color: "#b91c1c" }}>
                                {flag.description}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </section>
        </>
      )}
    </aside>
  );
}
