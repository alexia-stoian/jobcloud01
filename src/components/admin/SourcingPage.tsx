"use client";

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { SourcingResponse, SourcingResult } from "@/lib/sourcing/types";

type Status = "idle" | "loading" | "done" | "error";

export function SourcingPage(): React.ReactElement {
  const t = useTranslations("admin.sourcing");
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorKey, setErrorKey] = useState<"parse" | "request" | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [results, setResults] = useState<SourcingResult[]>([]);
  const [usedLlm, setUsedLlm] = useState(false);
  const [candidateCount, setCandidateCount] = useState(0);

  const runMatching = useCallback(
    async (file: File): Promise<void> => {
      setFileName(file.name);
      setStatus("loading");
      setErrorKey(null);
      setResults([]);

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
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
