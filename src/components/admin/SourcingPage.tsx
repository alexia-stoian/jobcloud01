"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { SourcingResponse, SourcingResult, SourcingVerdict } from "@/lib/sourcing/types";

type Status = "idle" | "loading" | "done" | "error";

/** Persist the last completed sourcing run so the page survives navigation + refresh. */
const SOURCING_STORAGE_KEY = "jobscout24.sourcing-results.v1";

type PersistedSourcing = {
  fileName: string | null;
  results: SourcingResult[];
  usedLlm: boolean;
  candidateCount: number;
};

export function SourcingPage(): React.ReactElement {
  const t = useTranslations("admin.sourcing");
  const inputRef = useRef<HTMLInputElement>(null);
  const hydratedRef = useRef(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorKey, setErrorKey] = useState<"parse" | "request" | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [results, setResults] = useState<SourcingResult[]>([]);
  const [usedLlm, setUsedLlm] = useState(false);
  const [candidateCount, setCandidateCount] = useState(0);
  const [selected, setSelected] = useState<SourcingResult | null>(null);

  // Restore the last completed run on mount (persists across page changes/refresh).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SOURCING_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as PersistedSourcing;
        if (Array.isArray(saved.results) && saved.results.length > 0) {
          setResults(saved.results);
          setFileName(saved.fileName ?? null);
          setUsedLlm(Boolean(saved.usedLlm));
          setCandidateCount(saved.candidateCount ?? 0);
          setStatus("done");
        }
      }
    } catch {
      // Ignore corrupted/unavailable storage — fall back to the empty state.
    }
    hydratedRef.current = true;
  }, []);

  // Persist the results whenever a run completes.
  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }
    try {
      if (status === "done" && results.length > 0) {
        const snapshot: PersistedSourcing = { fileName, results, usedLlm, candidateCount };
        window.localStorage.setItem(SOURCING_STORAGE_KEY, JSON.stringify(snapshot));
      }
    } catch {
      // Ignore quota/serialization errors — persistence is best-effort.
    }
  }, [status, results, fileName, usedLlm, candidateCount]);

  const verdictLabel = useCallback(
    (verdict: SourcingVerdict): string =>
      verdict === "recommended"
        ? t("verdictRecommended")
        : verdict === "consider"
          ? t("verdictConsider")
          : t("verdictNotRecommended"),
    [t]
  );

  const runMatching = useCallback(
    async (file: File): Promise<void> => {
      setFileName(file.name);
      setStatus("loading");
      setErrorKey(null);
      setResults([]);
      setSelected(null);

      let payload: unknown;
      try {
        payload = JSON.parse(await file.text());
      } catch {
        setStatus("error");
        setErrorKey("parse");
        return;
      }

      try {
        const response = await fetch("/api/admin/sourcing", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          setStatus("error");
          setErrorKey("request");
          return;
        }

        const data = (await response.json()) as SourcingResponse;
        setResults(data.results ?? []);
        setUsedLlm(Boolean(data.usedLlm));
        setCandidateCount(data.candidateCount ?? 0);
        setStatus("done");
      } catch {
        setStatus("error");
        setErrorKey("request");
      }
    },
    []
  );

  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) {
      void runMatching(file);
    }
    // Reset so re-selecting the same file name re-triggers change.
    event.target.value = "";
  }

  return (
    <section className="sourcing admin">
      <header className="sourcing__header">
        <h2 className="sourcing__title">{t("title")}</h2>
        <p className="sourcing__subtitle">{t("subtitle")}</p>
      </header>

      <div className="sourcing__upload">
        <label className="sourcing__dropzone">
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            className="sourcing__file-input"
            onChange={handleChange}
          />
          <span className="sourcing__dropzone-icon" aria-hidden="true">
            ⌗
          </span>
          <span className="sourcing__dropzone-prompt">{t("uploadPrompt")}</span>
          <span className="sourcing__dropzone-hint">{fileName ? t("replaceHint") : t("uploadHint")}</span>
          {fileName ? <span className="sourcing__file-name">{fileName}</span> : null}
        </label>
      </div>

      {status === "loading" ? (
        <p className="sourcing__status" role="status">
          {t("analyzing")}
        </p>
      ) : null}

      {status === "error" ? (
        <p className="sourcing__status sourcing__status--error" role="alert">
          {errorKey === "parse" ? t("parseError") : t("requestError")}
        </p>
      ) : null}

      {status === "done" ? (
        <>
          {!usedLlm ? (
            <p className="sourcing__note" role="note">
              {t("fallbackNote")}
            </p>
          ) : null}

          {results.length === 0 ? (
            <p className="sourcing__status">{t("noResults", { count: candidateCount })}</p>
          ) : (
            <ul className="sourcing__results">
              {results.map((result, index) => (
                <li key={result.userId} className="sourcing-card">
                  <header className="sourcing-card__header">
                    <span className="sourcing-card__rank" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span className="sourcing-card__name">{result.name}</span>
                    <span className={`sourcing-verdict sourcing-verdict--${result.verdict}`}>
                      {verdictLabel(result.verdict)}
                    </span>
                    <span className="sourcing-card__fit">
                      {t("fitLabel", { percent: result.fitPercent })}
                    </span>
                  </header>

                  <div
                    className="sourcing-card__bar"
                    role="progressbar"
                    aria-valuenow={result.fitPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div className="sourcing-card__bar-fill" style={{ width: `${result.fitPercent}%` }} />
                  </div>

                  {result.whyFit ? (
                    <div className="sourcing-card__section">
                      <h3 className="sourcing-card__heading">{t("whyFitHeading")}</h3>
                      <p className="sourcing-card__why">{result.whyFit}</p>
                    </div>
                  ) : null}

                  {result.bestSkills.length > 0 ? (
                    <div className="sourcing-card__section">
                      <h3 className="sourcing-card__heading">{t("bestSkillsHeading")}</h3>
                      <div className="sourcing-card__chips">
                        {result.bestSkills.map((skill) => (
                          <span key={skill} className="admin-chip">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {result.pros.length > 0 ? (
                    <div className="sourcing-card__section">
                      <h3 className="sourcing-card__heading">{t("prosHeading")}</h3>
                      <ul className="sourcing-card__list sourcing-card__list--pros">
                        {result.pros.map((pro, i) => (
                          <li key={i}>{pro}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {result.cons.length > 0 ? (
                    <div className="sourcing-card__section">
                      <h3 className="sourcing-card__heading">{t("consHeading")}</h3>
                      <ul className="sourcing-card__list sourcing-card__list--cons">
                        {result.cons.map((con, i) => (
                          <li key={i}>{con}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {result.recommendation ? (
                    <button
                      type="button"
                      className="sourcing-card__report-btn"
                      onClick={() => setSelected(result)}
                    >
                      <span aria-hidden="true">▤</span> {t("viewReport")}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      {selected ? (
        <>
          <div
            className="sourcing-scrim"
            role="button"
            tabIndex={0}
            aria-label={t("closeReport")}
            onClick={() => setSelected(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " " || e.key === "Escape") setSelected(null);
            }}
          />
          <aside className="sourcing-panel" aria-label={t("reportPanelLabel")}>
            <header className="sourcing-panel__header">
              <div>
                <h2 className="sourcing-panel__name">{selected.name}</h2>
                <span className={`sourcing-verdict sourcing-verdict--${selected.verdict}`}>
                  {verdictLabel(selected.verdict)} · {t("fitLabel", { percent: selected.fitPercent })}
                </span>
              </div>
              <button
                type="button"
                className="sourcing-panel__close"
                onClick={() => setSelected(null)}
                aria-label={t("closeReport")}
              >
                ✕
              </button>
            </header>

            <div className="sourcing-panel__body">
              <h3 className="sourcing-panel__heading">{t("recommendationHeading")}</h3>
              {selected.recommendation
                .split(/\n{2,}|(?<=\.) (?=[A-Z])/)
                .reduce<string[]>((acc, sentence) => {
                  // Group sentences into ~3-sentence paragraphs for readability.
                  const last = acc[acc.length - 1];
                  if (last && last.split(". ").length < 3) {
                    acc[acc.length - 1] = `${last} ${sentence}`.trim();
                  } else {
                    acc.push(sentence.trim());
                  }
                  return acc;
                }, [])
                .filter(Boolean)
                .map((para, i) => (
                  <p key={i} className="sourcing-panel__para">
                    {para}
                  </p>
                ))}

              {selected.bestSkills.length > 0 ? (
                <>
                  <h3 className="sourcing-panel__heading">{t("bestSkillsHeading")}</h3>
                  <div className="sourcing-card__chips">
                    {selected.bestSkills.map((skill) => (
                      <span key={skill} className="admin-chip">
                        {skill}
                      </span>
                    ))}
                  </div>
                </>
              ) : null}

              {selected.pros.length > 0 ? (
                <>
                  <h3 className="sourcing-panel__heading">{t("prosHeading")}</h3>
                  <ul className="sourcing-card__list sourcing-card__list--pros">
                    {selected.pros.map((pro, i) => (
                      <li key={i}>{pro}</li>
                    ))}
                  </ul>
                </>
              ) : null}

              {selected.cons.length > 0 ? (
                <>
                  <h3 className="sourcing-panel__heading">{t("consHeading")}</h3>
                  <ul className="sourcing-card__list sourcing-card__list--cons">
                    {selected.cons.map((con, i) => (
                      <li key={i}>{con}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </aside>
        </>
      ) : null}
    </section>
  );
}
