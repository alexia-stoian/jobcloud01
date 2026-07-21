"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { SignalCategory, SignalRecord } from "@/lib/ai/signals/signal-definitions";
import { formatProficiency } from "@/lib/languages/proficiency";

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
  sectorPreferences: unknown;
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

type FieldKey = keyof ProfileBundle;

/**
 * Profile fields organised into logical groups so the panel reads like a
 * recruiter would think about a candidate, instead of one flat 17-field grid.
 */
const FIELD_GROUPS: ReadonlyArray<{ heading: string; fields: FieldKey[] }> = [
  {
    heading: "careerGoalHeading",
    fields: ["primaryRole"]
  },
  {
    heading: "preferencesHeading",
    fields: []
  },
  {
    heading: "situationHeading",
    fields: ["locale"]
  }
];

// Preferences fields, MIRRORING the user's own Profile > Preferences exactly:
// the engineer-oriented fields (seniority / industries / work model) show only
// for engineer/default (no generated sector fields); visa sponsorship,
// relocation willingness and preferred location are never shown here.
const PREFERENCE_ALWAYS_FIELDS: FieldKey[] = ["currentJobSituation", "employmentObjective", "targetRoles"];
const PREFERENCE_ENGINEER_FIELDS: FieldKey[] = ["targetSeniority", "targetIndustries", "preferredWorkModel"];
const PREFERENCE_TAIL_FIELDS: FieldKey[] = [
  "contractPreference",
  "workRate",
  "workPermitStatus",
  "salaryExpectation",
  "commuteRadius"
];

type AdminSectorField = { key: string; label: string; value: string; options: Array<{ value: string; label: string }> };

/** Read the persisted sector-specific fields (≤ the stored set) for display. */
function readAdminSectorFields(sectorPreferences: unknown): AdminSectorField[] {
  if (!sectorPreferences || typeof sectorPreferences !== "object") return [];
  const fields = (sectorPreferences as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) return [];
  return fields
    .filter((field): field is Record<string, unknown> => Boolean(field) && typeof field === "object")
    .map((field) => ({
      key: typeof field.key === "string" ? field.key : "",
      label: typeof field.label === "string" ? field.label : "",
      value: typeof field.value === "string" ? field.value : "",
      options: Array.isArray(field.options)
        ? (field.options as unknown[])
            .filter((o): o is Record<string, unknown> => Boolean(o) && typeof o === "object")
            .map((o) => ({
              value: typeof o.value === "string" ? o.value : "",
              label: typeof o.label === "string" ? o.label : ""
            }))
        : []
    }))
    .filter((field) => field.label.length > 0);
}

/** Resolve a sector field's stored value to its human-readable option label. */
function resolveSectorValue(field: AdminSectorField): string {
  const value = field.value.trim();
  if (!value) return "";
  return field.options.find((option) => option.value === value)?.label ?? value;
}

type ParsedQual =
  | { kind: "tag"; text: string }
  | { kind: "item"; title: string; sub?: string; desc?: string };

/** Parse a raw qualification value (skills are plain strings; experience /
 * education / certifications are JSON blobs) into a display-friendly shape. */
function parseQualification(category: string, value: string): ParsedQual {
  const cat = category.toLowerCase();
  if (cat === "skill" || cat === "tool") {
    return { kind: "tag", text: value };
  }
  if (cat === "language") {
    // Languages are stored as a JSON blob { language, proficiency, cefr }.
    // Render a clean "English — C1 (Advanced)" tag with the level normalized to
    // a canonical CEFR label; fall back to the raw string if it isn't a blob.
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      const name = typeof parsed.language === "string" ? parsed.language : value;
      const rawLevel =
        typeof parsed.cefr === "string" && parsed.cefr.length > 0
          ? parsed.cefr
          : typeof parsed.proficiency === "string"
            ? parsed.proficiency
            : "";
      const level = formatProficiency(rawLevel);
      return { kind: "tag", text: level ? `${name} — ${level}` : name };
    } catch {
      return { kind: "tag", text: value };
    }
  }
  let obj: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object") {
      obj = parsed as Record<string, unknown>;
    }
  } catch {
    obj = null;
  }
  if (!obj) {
    return { kind: "item", title: value };
  }
  const str = (k: string): string | undefined => (typeof obj?.[k] === "string" ? (obj[k] as string) : undefined);
  const dates = [str("startDate"), str("endDate") ?? (obj.isCurrentRole ? "present" : undefined)]
    .filter(Boolean)
    .join(" – ");

  if (cat === "experience") {
    const sub = [str("company"), str("location"), dates || str("period")].filter(Boolean).join(" · ");
    return { kind: "item", title: str("title") ?? value, sub: sub || undefined, desc: str("description") };
  }
  if (cat === "diploma" || cat === "education" || cat === "degree") {
    const title = [str("degree"), str("field")].filter(Boolean).join(", ");
    const sub = [str("school"), str("location"), str("graduationDate") ?? dates].filter(Boolean).join(" · ");
    return { kind: "item", title: title || str("school") || value, sub: sub || undefined, desc: str("honors") };
  }
  // certification / other
  const sub = [str("issuer"), str("date")].filter(Boolean).join(" · ");
  return { kind: "item", title: str("name") ?? value, sub: sub || undefined };
}

/** Group qualifications into skills (tags) + itemised categories. */
function groupQualifications(quals: QualificationBundle[]): {
  skills: string[];
  languages: string[];
  experience: ParsedQual[];
  education: ParsedQual[];
  certifications: ParsedQual[];
} {
  const skills: string[] = [];
  const languages: string[] = [];
  const experience: ParsedQual[] = [];
  const education: ParsedQual[] = [];
  const certifications: ParsedQual[] = [];
  for (const q of quals) {
    const cat = q.category.toLowerCase();
    const parsed = parseQualification(q.category, q.value);
    if (parsed.kind === "tag") {
      if (cat === "language") {
        languages.push(parsed.text);
      } else {
        skills.push(parsed.text);
      }
    } else if (cat === "experience") {
      experience.push(parsed);
    } else if (cat === "diploma" || cat === "education" || cat === "degree") {
      education.push(parsed);
    } else {
      certifications.push(parsed);
    }
  }
  return { skills, languages, experience, education, certifications };
}

/** camelCase / snake_case key → human "Title Case" label. */
function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Extracted-fact keys that are either already shown in the structured profile
 * sections above, or are large blobs rendered elsewhere (qualifications live in
 * their own section). Skipping them keeps "CV facts" focused on genuinely
 * CV-specific extras rather than repeating the profile.
 */
const CV_FACT_SKIP = new Set([
  "qualifications",
  "fullName",
  "primaryRole",
  "currentJobSituation",
  "employmentObjective",
  "preferredLocation",
  "contractPreference",
  "workRate",
  "workPermitStatus",
  "salaryExpectation"
]);

function toKeyValueEntries(value: unknown): Array<{ key: string; value: string }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !CV_FACT_SKIP.has(key))
    .map(([key, raw]) => {
      let display = "";
      if (raw === null || raw === undefined) {
        display = "";
      } else if (Array.isArray(raw)) {
        // Show a count rather than dumping a giant JSON array.
        display = raw.length > 0 ? `${raw.length}` : "";
      } else if (typeof raw === "object") {
        // Skip nested objects — too noisy for this summary row.
        display = "";
      } else {
        display = String(raw).trim();
      }
      return { key: humanizeKey(key), value: display };
    })
    .filter((entry) => entry.value !== "");
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

/**
 * Build a plain-text CV document from the structured data we hold (profile +
 * parsed qualifications). The original CV binary is not persisted, so the admin
 * "Download CV" action reconstructs a clean, readable CV from what was extracted
 * — this works for every candidate, including those onboarded before this
 * feature existed.
 */
function buildCvDocument(bundle: ApiBundle): string {
  const p = bundle.profile;
  const lines: string[] = [];
  const push = (s = ""): void => {
    lines.push(s);
  };

  const name = bundle.user.name || p?.fullName || bundle.user.email;
  push(name.toUpperCase());
  const roleLine = [p?.primaryRole, p?.preferredLocation].filter(Boolean).join(" · ");
  if (roleLine) push(roleLine);
  push(bundle.user.email);
  push();

  const targetRole = bundle.onboarding?.targetRole ?? p?.targetRoles;
  if (targetRole) {
    push(`TARGET ROLE: ${targetRole}`);
    push();
  }

  const quals = groupQualifications(bundle.qualifications);

  const section = (title: string, items: ParsedQual[]): void => {
    const real = items.filter((i): i is Extract<ParsedQual, { kind: "item" }> => i.kind === "item");
    if (real.length === 0) return;
    push(title.toUpperCase());
    for (const item of real) {
      push(`- ${item.title}${item.sub ? ` — ${item.sub}` : ""}`);
      if (item.desc) push(`  ${item.desc}`);
    }
    push();
  };

  section("Experience", quals.experience);
  section("Education", quals.education);
  section("Certifications", quals.certifications);

  if (quals.skills.length > 0) {
    push("SKILLS");
    push(quals.skills.join(", "));
    push();
  }

  if (quals.languages.length > 0) {
    push("LANGUAGES");
    push(quals.languages.join(", "));
    push();
  }

  push("—");
  push(`Generated from JobScout24 profile data · ${new Date().toLocaleDateString()}`);

  return lines.join("\n");
}

/** Trigger a browser download of the given text as a file. */
function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
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
  const quals = bundle ? groupQualifications(bundle.qualifications) : null;
  const avatarInitial = (bundle?.user.name?.trim() || bundle?.user.email?.trim() || "?")
    .charAt(0)
    .toUpperCase();
  const updatedTime = bundle?.updatedAt ? new Date(bundle.updatedAt).toLocaleTimeString() : null;

  const handleDownloadCv = (): void => {
    if (!bundle) return;
    const rawName = bundle.onboarding?.cvFileName || bundle.user.name || "cv";
    const base = rawName.replace(/\.[a-z0-9]+$/i, "").trim() || "cv";
    downloadTextFile(`${base}.txt`, buildCvDocument(bundle));
  };

  const renderValue = (raw: unknown): React.ReactElement => {
    const isEmpty = raw === null || raw === undefined || raw === "";
    return (
      <span className={isEmpty ? "admin-kv__val admin-kv__val--empty" : "admin-kv__val"}>
        {isEmpty ? dash : String(raw)}
      </span>
    );
  };

  // Preferences that mirror the user's own Profile > Preferences: engineer fields
  // only for engineer/default, plus the persisted sector-specific fields.
  const adminSectorFields = readAdminSectorFields(bundle?.profile?.sectorPreferences);
  const isSectorTailored = adminSectorFields.length > 0;
  const preferenceFieldKeys: FieldKey[] = [
    ...PREFERENCE_ALWAYS_FIELDS,
    ...(isSectorTailored ? [] : PREFERENCE_ENGINEER_FIELDS),
    ...PREFERENCE_TAIL_FIELDS
  ];

  const renderItems = (items: ParsedQual[]): React.ReactElement => (
    <div>
      {items.map((item, index) =>
        item.kind === "item" ? (
          <div className="admin-item" key={index}>
            <div className="admin-item__title">{item.title}</div>
            {item.sub ? <div className="admin-item__sub">{item.sub}</div> : null}
            {item.desc ? <div className="admin-item__desc">{item.desc}</div> : null}
          </div>
        ) : null
      )}
    </div>
  );

  return (
    <aside className="admin-panel" aria-label={t("profileHeading")}>
      <header className="admin-panel__header">
        <span className="admin-avatar" aria-hidden="true">
          {state === "ready" ? avatarInitial : "…"}
        </span>
        <div className="admin-panel__id">
          <div className="admin-panel__name">{bundle?.user.name ?? t("loading")}</div>
          <div className="admin-panel__email">{bundle?.user.email ?? ""}</div>
        </div>
        {state === "ready" && (
          <span
            className={
              bundle?.completion?.isMinimallyComplete
                ? "admin-pill admin-pill--ok"
                : "admin-pill admin-pill--pending"
            }
          >
            {bundle?.completion?.isMinimallyComplete ? t("complete") : t("incomplete")}
          </span>
        )}
        <button
          type="button"
          className="admin-panel__close"
          onClick={onClose}
          aria-label={t("close")}
          title={t("close")}
        >
          ✕
        </button>
      </header>

      <div className="admin-panel__body">
        {state === "loading" && <p className="admin-state">{t("loading")}</p>}
        {state === "error" && (
          <p className="admin-state" role="alert">
            {t("error")}
          </p>
        )}

        {state === "ready" && bundle && (
          <>
            {/* Grouped profile fields */}
            {bundle.profile &&
              FIELD_GROUPS.map((group) => (
                <section className="admin-section" key={group.heading}>
                  <h3 className="admin-section__title">{t(group.heading)}</h3>
                  <dl className="admin-kv">
                    {(group.heading === "preferencesHeading" ? preferenceFieldKeys : group.fields).map((key) => (
                      <div className="admin-kv__item" key={key}>
                        <dt className="admin-kv__key">{t(`fields.${key}`)}</dt>
                        <dd style={{ margin: 0 }}>{renderValue(bundle.profile ? bundle.profile[key] : null)}</dd>
                      </div>
                    ))}
                    {group.heading === "preferencesHeading" &&
                      adminSectorFields.map((field) => (
                        <div className="admin-kv__item" key={`sector-${field.key}`}>
                          <dt className="admin-kv__key">{field.label}</dt>
                          <dd style={{ margin: 0 }}>{renderValue(resolveSectorValue(field))}</dd>
                        </div>
                      ))}
                  </dl>
                </section>
              ))}

            {/* Qualifications — skills as chips, experience/education/certs itemised */}
            {quals &&
              (quals.skills.length > 0 ||
                quals.languages.length > 0 ||
                quals.experience.length > 0 ||
                quals.education.length > 0 ||
                quals.certifications.length > 0) && (
                <section className="admin-section">
                  <h3 className="admin-section__title">{t("qualificationsHeading")}</h3>

                  {quals.skills.length > 0 && (
                    <>
                      <div className="admin-subhead">{t("skillsLabel")}</div>
                      <div className="admin-taglist">
                        {quals.skills.map((skill, index) => (
                          <span className="admin-tag" key={index}>
                            {skill}
                          </span>
                        ))}
                      </div>
                    </>
                  )}

                  {quals.languages.length > 0 && (
                    <>
                      <div className="admin-subhead">{t("languagesLabel")}</div>
                      <div className="admin-taglist">
                        {quals.languages.map((language, index) => (
                          <span className="admin-tag" key={index}>
                            {language}
                          </span>
                        ))}
                      </div>
                    </>
                  )}

                  {quals.experience.length > 0 && (
                    <>
                      <div className="admin-subhead">{t("experienceLabel")}</div>
                      {renderItems(quals.experience)}
                    </>
                  )}

                  {quals.education.length > 0 && (
                    <>
                      <div className="admin-subhead">{t("educationLabel")}</div>
                      {renderItems(quals.education)}
                    </>
                  )}

                  {quals.certifications.length > 0 && (
                    <>
                      <div className="admin-subhead">{t("certificationsLabel")}</div>
                      {renderItems(quals.certifications)}
                    </>
                  )}
                </section>
              )}

            {/* CV-derived facts + onboarding conversation */}
            {bundle.onboarding && (
              <section className="admin-section">
                <div className="admin-section__head">
                  <h3 className="admin-section__title">{t("cvFactsHeading")}</h3>
                  <button
                    type="button"
                    className="admin-download"
                    onClick={handleDownloadCv}
                  >
                    <span aria-hidden="true">⬇</span> {t("downloadCv")}
                  </button>
                </div>

                {/* CV metadata as compact tiles */}
                <div className="admin-meta">
                  <div className="admin-meta__tile">
                    <span className="admin-meta__icon" aria-hidden="true">📄</span>
                    <div className="admin-meta__body">
                      <div className="admin-meta__label">{t("fields.cvFileName")}</div>
                      <div
                        className={
                          bundle.onboarding.cvFileName
                            ? "admin-meta__value"
                            : "admin-meta__value admin-meta__value--empty"
                        }
                        title={bundle.onboarding.cvFileName ?? undefined}
                      >
                        {bundle.onboarding.cvFileName ?? dash}
                      </div>
                    </div>
                  </div>
                  <div className="admin-meta__tile">
                    <span className="admin-meta__icon" aria-hidden="true">🎯</span>
                    <div className="admin-meta__body">
                      <div className="admin-meta__label">{t("fields.targetRole")}</div>
                      <div
                        className={
                          bundle.onboarding.targetRole
                            ? "admin-meta__value"
                            : "admin-meta__value admin-meta__value--empty"
                        }
                        title={bundle.onboarding.targetRole ?? undefined}
                      >
                        {bundle.onboarding.targetRole ?? dash}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Any genuinely extra extracted facts (profile duplicates + blobs filtered out) */}
                {cvFacts.length > 0 && (
                  <>
                    <div className="admin-subhead">{t("extractedFactsLabel")}</div>
                    <div className="admin-taglist">
                      {cvFacts.map((fact) => (
                        <span className="admin-tag" key={fact.key}>
                          {fact.key}: {fact.value}
                        </span>
                      ))}
                    </div>
                  </>
                )}

                {conversation.length > 0 && (
                  <>
                    <div className="admin-subhead">{t("onboardingHeading")}</div>
                    <ul className="admin-convo">
                      {conversation.map((turn, index) => (
                        <li
                          key={index}
                          className={
                            turn.role === "user"
                              ? "admin-convo__turn admin-convo__turn--user"
                              : "admin-convo__turn admin-convo__turn--assistant"
                          }
                        >
                          <span className="admin-convo__role">{turn.role}</span>
                          {turn.text}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}

            {/* Profile history */}
            {bundle.history.length > 0 && (
              <section className="admin-section">
                <h3 className="admin-section__title">{t("historyHeading")}</h3>
                <div>
                  {bundle.history.map((event) => (
                    <div className="admin-item" key={event.id}>
                      <div className="admin-item__sub">
                        {new Date(event.createdAt).toLocaleString()} — {event.source}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Recruiter signals — grouped by category */}
            <section className="admin-section admin-section--live">
              <h3 className="admin-section__title">{t("signalsHeading")}</h3>
              {CATEGORY_ORDER.map((category) => {
                const rows = bundle.signals.filter((signal) => signal.category === category);
                if (rows.length === 0) {
                  return null;
                }
                return (
                  <div className="admin-signal-group" key={category}>
                    <div className="admin-subhead">{categoryLabel(category)}</div>
                    {rows.map((signal) => {
                      const hasContradiction = signal.contradictionFlags.length > 0;
                      const assessed = signal.confidence > 0;
                      const fillClass = !assessed
                        ? "admin-signal__fill admin-signal__fill--none"
                        : hasContradiction
                          ? "admin-signal__fill admin-signal__fill--warn"
                          : "admin-signal__fill";
                      return (
                        <div className="admin-signal" key={signal.key}>
                          <div className="admin-signal__head">
                            <span className="admin-signal__name">{signal.name}</span>
                            {hasContradiction ? (
                              <span className="admin-badge-warn" title={tSignals("contradiction")}>
                                ⚠ {tSignals("contradiction")}
                              </span>
                            ) : (
                              <span className="admin-signal__pct">{assessed ? `${signal.confidence}%` : ""}</span>
                            )}
                          </div>
                          <div className="admin-signal__bar">
                            <div className={fillClass} style={{ width: `${signal.confidence}%` }} />
                          </div>
                          <div
                            className={
                              assessed ? "admin-signal__value" : "admin-signal__value admin-signal__value--none"
                            }
                          >
                            {assessed
                              ? `${signal.inferredValue ?? dash} · ${signal.confidence}%`
                              : tSignals("notAssessed")}
                          </div>

                          {signal.evidence.length > 0 && (
                            <details className="admin-evidence">
                              <summary>
                                {t("evidenceHeading")} ({signal.evidence.length})
                              </summary>
                              <ul className="admin-evidence__list">
                                {signal.evidence.map((item, index) => (
                                  <li className="admin-evidence__item" key={index}>
                                    <span className="admin-evidence__src">[{item.source}]</span> “{item.quote}”
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}

                          {hasContradiction && (
                            <ul className="admin-contradiction">
                              {signal.contradictionFlags.map((flag, index) => (
                                <li className="admin-contradiction__item" key={index}>
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

            {updatedTime && <div className="admin-updated">{t("updatedLabel", { time: updatedTime })}</div>}
          </>
        )}
      </div>
    </aside>
  );
}
