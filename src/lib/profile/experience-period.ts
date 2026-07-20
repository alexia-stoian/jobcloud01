/**
 * Shared free-text experience "period" parser.
 *
 * A single source of truth used by BOTH the profile save path
 * (`buildQualificationsFromDraft`) and the sourcing aggregation
 * (`parseQualifications`), so the structured start/end/current-role signal is
 * derived identically everywhere. The editor stores a human-entered range like
 * "2020-01 - Present"; this splits it into start/end tokens and detects an
 * open-ended ("present") current role.
 *
 * Splits only on a range separator surrounded by spaces so the internal dashes
 * of an ISO-ish date such as "2020-01" are preserved.
 */

const CURRENT_ROLE_RE = /present|current|now|ongoing|today|heute|aktuell|présent|actuel|en cours/i;
const YEAR_RE = /\b(?:19|20)\d{2}\b/;

export type ParsedPeriod = {
  start?: string;
  end?: string;
  isCurrentRole: boolean;
};

/** Parse a period string into `{ start, end, isCurrentRole }` tokens. */
export function parseExperiencePeriod(period: string): ParsedPeriod {
  const normalized = period.trim();
  if (normalized.length === 0) {
    return { isCurrentRole: false };
  }
  const parts = normalized.split(/\s+(?:[-–—]|to|bis|à)\s+/i);
  const isCurrentText = (value: string): boolean => CURRENT_ROLE_RE.test(value);
  if (parts.length >= 2) {
    const start = parts[0].trim();
    const endRaw = parts[1].trim();
    const isCurrentRole = isCurrentText(endRaw);
    return {
      start: start || undefined,
      end: isCurrentRole ? undefined : endRaw || undefined,
      isCurrentRole
    };
  }
  const isCurrentRole = isCurrentText(normalized);
  return { start: isCurrentRole ? undefined : normalized, isCurrentRole };
}

/**
 * Derive persistable structured date fields from a free-text period. Structured
 * `startDate`/`endDate` are only emitted when the token actually contains a
 * 4-digit year, so free-text labels (e.g. "Summer internship") never pollute the
 * date fields while still round-tripping through `period`. `isCurrentRole` is
 * always surfaced when a "present"-style marker is detected.
 */
export function structuredDatesFromPeriod(period: string): {
  startDate?: string;
  endDate?: string;
  isCurrentRole: boolean;
} {
  const parsed = parseExperiencePeriod(period);
  const withYear = (token: string | undefined): string | undefined =>
    token && YEAR_RE.test(token) ? token : undefined;
  return {
    startDate: withYear(parsed.start),
    endDate: withYear(parsed.end),
    isCurrentRole: parsed.isCurrentRole
  };
}
