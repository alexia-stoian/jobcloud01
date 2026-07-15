/**
 * Recruiter-signals inference engine.
 *
 * INTERNAL / INVISIBLE MODULE. Orchestrates a single Claude call per user input,
 * strictly parses the JSON response, and merges updates into the persisted signal
 * state via a pure reducer. All failures are swallowed and return the prior
 * signals unchanged — inference must never break the user request.
 */

import { env } from "@/lib/env";
import { loadSignalState, saveSignalState } from "./signal-dal";
import { buildInferencePrompt } from "./prompt";
import {
  SATURATION_THRESHOLD,
  inferenceSourceToEvidenceSource,
  type EvidenceSource,
  type InferenceSource,
  type SignalRecord,
} from "./signal-definitions";

export interface InferSignalsArgs {
  userId: string;
  newInput: string;
  source: InferenceSource;
  cvFacts?: unknown;
  sessionId?: string | null;
}

/** Shape of a single update as returned by Claude. */
export interface SignalUpdate {
  key: string;
  inferredValue: string | null;
  confidence: number;
  evidence: { quote: string; source: EvidenceSource };
  contradiction: { description: string; conflicting: string[] } | null;
}

type AnthropicTextContent = { type: "text"; text: string };
type AnthropicResponse = {
  content?: Array<{ type: string; text?: string }>;
  error?: { message?: string };
};

/**
 * Run one inference pass for a user input.
 *
 * 1. Load prior signals.
 * 2. Build the prompt (with a consistency-pass cross-check) and call Claude once.
 * 3. Strictly parse the JSON; on ANY failure, return priors unchanged (no throw).
 * 4. Merge via the pure reducer and persist.
 */
export async function inferSignals(args: InferSignalsArgs): Promise<SignalRecord[]> {
  const { userId, newInput, source, cvFacts, sessionId } = args;

  const prior = await loadSignalState(userId);

  const trimmedInput = newInput?.trim() ?? "";
  if (!trimmedInput) {
    return prior;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    // Nothing to infer with — return priors unchanged.
    return prior;
  }

  const model = (process.env.ANTHROPIC_MODEL ?? env.ANTHROPIC_MODEL)
    .replace(/["'`\r\n]/g, "")
    .trim();

  const priorClaimsToCheck = runConsistencyPass(prior, trimmedInput);

  const { system, user } = buildInferencePrompt({
    newInput: trimmedInput,
    source,
    cvFacts,
    priorSignals: prior,
    sessionId,
    priorClaimsToCheck,
  });

  let updates: SignalUpdate[];
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    if (!response.ok) {
      return prior;
    }

    const data = (await response.json()) as AnthropicResponse;
    // Responses may include a `thinking` block — pick the first `text` block.
    const text =
      data.content?.find(
        (c): c is AnthropicTextContent => c.type === "text" && typeof c.text === "string"
      )?.text?.trim() ?? "";

    if (!text) {
      return prior;
    }

    const parsed = parseUpdates(text);
    if (!parsed) {
      return prior;
    }
    updates = parsed;
  } catch {
    // Network / parse / anything — never throw.
    return prior;
  }

  const merged = mergeUpdates(
    prior,
    updates,
    sessionId ?? null,
    inferenceSourceToEvidenceSource(source)
  );

  try {
    await saveSignalState(userId, merged, sessionId ?? null);
  } catch {
    // Persistence failure must not break the caller.
    return merged;
  }

  return merged;
}

/**
 * Strictly parse Claude output into a well-formed update list. Returns null on
 * any structural problem (caller falls back to priors).
 */
function parseUpdates(text: string): SignalUpdate[] | null {
  // Tolerate an accidental ```json fence but otherwise require a clean object.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    return null;
  }

  if (typeof obj !== "object" || obj === null) {
    return null;
  }
  const payload = obj as { updates?: unknown };
  if (!Array.isArray(payload.updates)) {
    return null;
  }

  const valid: SignalUpdate[] = [];
  for (const raw of payload.updates as unknown[]) {
    if (typeof raw !== "object" || raw === null) continue;
    const u = raw as Record<string, unknown>;
    const key = typeof u.key === "string" ? u.key : null;
    const confidence = typeof u.confidence === "number" ? u.confidence : null;
    const evidence = u.evidence as { quote?: unknown; source?: unknown } | undefined;
    const quote = evidence && typeof evidence.quote === "string" ? evidence.quote : null;

    // An update without a key, numeric confidence, or a verbatim quote is invalid.
    if (!key || confidence === null || !quote) {
      continue;
    }

    const source = normalizeSource(evidence?.source);
    const inferredValue =
      typeof u.inferredValue === "string" ? u.inferredValue : null;

    let contradiction: SignalUpdate["contradiction"] = null;
    const rawContradiction = u.contradiction as
      | { description?: unknown; conflicting?: unknown }
      | null
      | undefined;
    if (
      rawContradiction &&
      typeof rawContradiction === "object" &&
      typeof rawContradiction.description === "string"
    ) {
      const conflicting = Array.isArray(rawContradiction.conflicting)
        ? rawContradiction.conflicting.filter((c): c is string => typeof c === "string")
        : [];
      contradiction = { description: rawContradiction.description, conflicting };
    }

    valid.push({
      key,
      inferredValue,
      confidence,
      evidence: { quote, source },
      contradiction,
    });
  }

  return valid;
}

function normalizeSource(value: unknown): EvidenceSource {
  if (
    value === "message" ||
    value === "cv" ||
    value === "mock_interview" ||
    value === "forced_choice"
  ) {
    return value;
  }
  return "message";
}

/**
 * Pure reducer: apply the updates onto the prior signals.
 *
 * - Clamps confidence to 0-100.
 * - Enforces the >= SATURATION_THRESHOLD rule (saturated signals only move on a
 *   genuine contradiction).
 * - Appends the evidence item, any contradiction flag, and an update-history event.
 * - Only touches signals present in `updates`; everything else passes through unchanged.
 */
export function mergeUpdates(
  prior: SignalRecord[],
  updates: SignalUpdate[],
  sessionId: string | null,
  fallbackSource: EvidenceSource
): SignalRecord[] {
  if (updates.length === 0) {
    return prior;
  }

  const byKey = new Map<string, SignalUpdate>();
  for (const u of updates) {
    // Last update for a given key wins.
    byKey.set(u.key, u);
  }

  const now = new Date().toISOString();

  return prior.map((signal) => {
    const update = byKey.get(signal.key);
    if (!update) {
      return signal;
    }

    const hasContradiction = update.contradiction !== null;
    const isSaturated = signal.confidence >= SATURATION_THRESHOLD;

    // Saturated signals only move on a genuine contradiction.
    if (isSaturated && !hasContradiction) {
      return signal;
    }

    const from = signal.confidence;
    const to = clamp(update.confidence, 0, 100);

    const evidence = [
      ...signal.evidence,
      {
        quote: update.evidence.quote,
        source: update.evidence.source ?? fallbackSource,
        at: now,
      },
    ];

    const contradictionFlags = update.contradiction
      ? [
          ...signal.contradictionFlags,
          {
            description: update.contradiction.description,
            conflicting: update.contradiction.conflicting,
            at: now,
          },
        ]
      : signal.contradictionFlags;

    const reason = update.contradiction
      ? `contradiction: ${update.contradiction.description}`
      : to >= from
        ? "corroborating evidence"
        : "weaker evidence";

    const updateHistory = [
      ...signal.updateHistory,
      { at: now, from, to, reason, ...(sessionId ? { sessionId } : {}) },
    ];

    return {
      ...signal,
      inferredValue: update.inferredValue ?? signal.inferredValue,
      confidence: to,
      evidence,
      contradictionFlags,
      lastUpdated: now,
      sessionId,
      updateHistory,
    };
  });
}

/**
 * Consistency pass (Section 6): pick up to two of the lowest-confidence signals
 * that already have evidence and surface their most recent evidence quote so the
 * prompt can cross-check the new input against prior claims.
 */
export function runConsistencyPass(prior: SignalRecord[], _newInput: string): string[] {
  return prior
    .filter((s) => s.evidence.length > 0)
    .sort((a, b) => a.confidence - b.confidence)
    .slice(0, 2)
    .map((s) => {
      const last = s.evidence[s.evidence.length - 1];
      return `${s.key} (@${s.confidence}%): "${last.quote}"`;
    });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
