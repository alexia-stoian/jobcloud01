/**
 * Candidate-facing Sector-mode delivery endpoint (Phase 12, Plan 3).
 *
 * SERVER-ONLY. Delivers the <=3 persisted sector preference fields (generated in
 * Plan 12-1/12-2 and stored on `CandidateProfile.sectorPreferences`) one at a time
 * as an `InteractiveResponse`-shaped multiple-choice question that ALSO allows a
 * type-your-own answer (D-07). Answering writes the resolved value into
 * `sectorPreferences.fields[key].value` (JSON) — NEVER into a fixed profile column
 * (D-03/D-05).
 *
 * Guardrails:
 *  - EVERY read/write is scoped to `session.user.id` (owner of the
 *    `CandidateProfile`); a user can never reach another user's fields (T-12-09).
 *  - Uses a DISTINCT `sector:` prefix + this dedicated endpoint so it NEVER
 *    collides with, imports, or mutates the Phase 11 `sourcing:` mode (T-12-12).
 *  - Free-text answers are untrusted: clamped (length), trimmed, and stripped of
 *    control characters before they persist (T-12-11 / V5).
 *  - LLM-authored labels are stored/returned as plain strings; React auto-escapes
 *    them at render, never dangerouslySetInnerHTML (T-12-10).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import { DEFAULT_LOCALE, isSupportedLocale, type SupportedLocale } from "@/i18n/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Maximum sector-specific fields delivered per user (D-04). */
const MAX_FIELDS = 3;
/** Untrusted free-text is clamped before it is persisted (T-12-11 / V5). */
const FREE_TEXT_MAX = 400;

/** One localized MCQ option persisted on a sector field. */
type StoredOption = { value: string; label: string };

/** One persisted sector field (from Plan 12-1's SectorField shape). */
type StoredField = {
  key: string;
  label: string;
  question: string;
  options: StoredOption[];
  value: string;
};

/** The persisted `sectorPreferences` shape written by Plan 12-2. */
type SectorPreferences = {
  sector?: unknown;
  generatedLocale?: unknown;
  generatedForRole?: unknown;
  fields?: unknown;
};

function resolveLocale(value: string | null | undefined): SupportedLocale {
  return value && isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

/** Coerce the raw JSON option list into safe {value,label} pairs (defensive). */
function readOptions(raw: unknown): StoredOption[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((option) => {
      const record = (option ?? {}) as { value?: unknown; label?: unknown };
      return {
        value: typeof record.value === "string" ? record.value : "",
        label: typeof record.label === "string" ? record.label : ""
      };
    })
    .filter((option) => option.label.length > 0);
}

/**
 * Read the persisted sector fields (capped at MAX_FIELDS) from a profile's
 * `sectorPreferences`. Returns an empty array for the engineer/default `{}` case
 * or any malformed store, so callers uniformly treat "no fields" as `done`.
 */
function readSectorFields(sectorPreferences: unknown): StoredField[] {
  if (!sectorPreferences || typeof sectorPreferences !== "object") {
    return [];
  }
  const rawFields = (sectorPreferences as SectorPreferences).fields;
  if (!Array.isArray(rawFields)) {
    return [];
  }
  const fields: StoredField[] = [];
  for (const raw of rawFields) {
    if (fields.length >= MAX_FIELDS) {
      break;
    }
    const record = (raw ?? {}) as {
      key?: unknown;
      label?: unknown;
      question?: unknown;
      options?: unknown;
      value?: unknown;
    };
    const key = typeof record.key === "string" ? record.key : "";
    const question = typeof record.question === "string" ? record.question : "";
    if (!key || !question) {
      continue;
    }
    fields.push({
      key,
      label: typeof record.label === "string" ? record.label : "",
      question,
      options: readOptions(record.options),
      value: typeof record.value === "string" ? record.value : ""
    });
  }
  return fields;
}

/**
 * Human-readable answer for one answered field: the chosen option's label when
 * the stored value matches an option value, otherwise the stored free text.
 */
function answerDisplayText(field: StoredField): string {
  const option = field.options.find((candidate) => candidate.value === field.value);
  return option?.label ?? field.value;
}

/** Sanitize an untrusted free-text answer before persisting (T-12-11 / V5). */
function sanitizeFreeText(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, FREE_TEXT_MAX);
}

/** Strip the distinct `sector:` prefix if the client echoed it back on questionId. */
function toFieldKey(questionId: string): string {
  return questionId.startsWith("sector:") ? questionId.slice("sector:".length) : questionId;
}

/**
 * GET — serve the next sector field whose value is still empty as one MCQ
 * (`allowCustom: true` for type-your-own), plus the answered transcript so a
 * returning user sees their prior answers. Returns `{ done: true }` when there is
 * no store or every (<=3) field is answered.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { sectorPreferences: true }
  });

  const fields = readSectorFields(profile?.sectorPreferences);
  if (fields.length === 0) {
    return NextResponse.json({ done: true });
  }

  const answered = fields
    .filter((field) => field.value.trim().length > 0)
    .map((field) => ({ prompt: field.question, answerText: answerDisplayText(field) }));

  const next = fields.find((field) => field.value.trim().length === 0);
  if (!next) {
    return NextResponse.json({ done: true, answered });
  }

  return NextResponse.json({
    question: {
      id: next.key,
      field: `sector:${next.key}`,
      prompt: next.question,
      options: next.options,
      allowCustom: true
    },
    answered,
    done: false,
    answeredCount: answered.length
  });
}

type PostBody = {
  questionId?: unknown;
  chosenValue?: unknown;
  freeText?: unknown;
  locale?: unknown;
};

/**
 * POST — persist one sector answer into `sectorPreferences.fields[key].value`
 * (owner-scoped), then advance. Exactly one of `chosenValue` / `freeText` must be
 * present (XOR). NEVER writes a fixed profile column.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as PostBody;
  const questionId = typeof body.questionId === "string" ? body.questionId.trim() : "";
  if (!questionId) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  // The answer SOURCE is distinguished by which field is present — never inferred.
  const isOption = typeof body.chosenValue === "string";
  const isFreeText = typeof body.freeText === "string";
  if (isOption === isFreeText) {
    // Neither present, or both present — ambiguous.
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const key = toFieldKey(questionId);

  // Owner-scoped read: a profile that is not THIS user's is never found (T-12-09).
  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    select: { sectorPreferences: true }
  });

  const stored = (profile?.sectorPreferences && typeof profile.sectorPreferences === "object"
    ? profile.sectorPreferences
    : {}) as SectorPreferences;
  const fields = readSectorFields(stored);
  const target = fields.find((field) => field.key === key);
  if (!target) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let resolvedValue: string;
  if (isOption) {
    const chosen = (body.chosenValue as string).trim();
    const option = target.options.find((candidate) => candidate.value === chosen);
    if (!option) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }
    resolvedValue = option.value;
  } else {
    resolvedValue = sanitizeFreeText(body.freeText as string);
    if (resolvedValue.length === 0) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }
  }

  // Spread-preserve every other field + sector/locale metadata; only set the one
  // answered field's `value`. Never touch a fixed profile column (D-03).
  const rawFields = Array.isArray(stored.fields) ? (stored.fields as Array<Record<string, unknown>>) : [];
  const nextFields = rawFields.map((raw) =>
    typeof raw?.key === "string" && raw.key === key ? { ...raw, value: resolvedValue } : raw
  );
  const nextSectorPreferences = { ...stored, fields: nextFields };

  await db.candidateProfile.update({
    where: { userId: session.user.id },
    data: { sectorPreferences: JSON.parse(JSON.stringify(nextSectorPreferences)) }
  });

  const remaining = fields.some((field) => field.key !== key && field.value.trim().length === 0);
  return NextResponse.json({ done: !remaining });
}
