/**
 * Recruiter-signals inference engine.
 *
 * INTERNAL / INVISIBLE MODULE. Orchestrates a single Claude call per user input,
 * strictly parses the JSON response, and merges updates into the persisted signal
 * state via a pure reducer. All failures are swallowed and return the prior
 * signals unchanged — inference must never break the user request.
 */

import { env } from "@/lib/env";
import { getBedrockModel, bedrockInvokeUrl, bedrockHeaders, BEDROCK_ANTHROPIC_VERSION } from "@/lib/ai/bedrock";
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

  const apiKey = process.env.AWS_BEARER_TOKEN_BEDROCK?.trim() || env.AWS_BEARER_TOKEN_BEDROCK?.trim();
  if (!apiKey) {
    // Nothing to infer with — return priors unchanged.
    return prior;
  }

  const model = getBedrockModel();

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
    const response = await fetch(bedrockInvokeUrl(model), {
      method: "POST",
      headers: bedrockHeaders(apiKey),
      body: JSON.stringify({
        anthropic_version: BEDROCK_ANTHROPIC_VERSION,
        max_tokens: 4096,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    if (!response.ok) {
      console.error(`[signals] Anthropic error: ${response.status}`);
      return prior;
    }

    const data = (await response.json()) as AnthropicResponse;
    // Responses may include a `thinking` block — pick the first `text` block.
    const text =
      data.content?.find(
        (c): c is AnthropicTextContent => c.type === "text" && typeof c.text === "string"
      )?.text?.trim() ?? "";

    if (!text) {
      console.error("[signals] empty text response from model");
      return prior;
    }

    const parsed = parseUpdates(text);
    if (!parsed) {
      console.error("[signals] failed to parse updates:", text.slice(0, 300));
      return prior;
    }
    updates = parsed;
  } catch (err) {
    // Network / parse / anything — never throw.
    console.error("[signals] inference call threw:", err);
    return prior;
  }

  const merged = mergeUpdates(
    prior,
    updates,
    sessionId ?? null,
    inferenceSourceToEvidenceSource(source)
  );

  if (updates.length > 0) {
    console.log(
      `[signals] updated ${updates.length} signal(s):`,
      updates.map((u) => `${u.key}=${u.confidence}`).join(", ")
    );
  } else {
    console.log("[signals] no signal cues in input");
  }

  try {
    await saveSignalState(userId, merged, sessionId ?? null);
  } catch (err) {
    // Persistence failure must not break the caller.
    console.error("[signals] save failed:", err);
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
    // The model may have truncated its output mid-array (many rich updates can
    // exceed the token budget). Try to salvage the complete update objects.
    const salvaged = salvageTruncatedUpdates(cleaned);
    if (salvaged === null) {
      return null;
    }
    obj = salvaged;
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
 * Best-effort recovery of a truncated `{ "updates": [ ... ] }` payload.
 *
 * When the model runs out of tokens mid-array, the trailing update object is
 * incomplete and `JSON.parse` fails. We scan the array body, keep only the
 * update objects whose braces balance completely, and rebuild a valid payload.
 * Returns null if nothing salvageable is found.
 */
function salvageTruncatedUpdates(text: string): { updates: unknown[] } | null {
  const arrStart = text.indexOf("[");
  if (arrStart === -1) {
    return null;
  }

  const complete: string[] = [];
  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escaped = false;

  for (let i = arrStart + 1; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      if (depth === 0) {
        objStart = i;
      }
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        complete.push(text.slice(objStart, i + 1));
        objStart = -1;
      }
    } else if (ch === "]" && depth === 0) {
      break;
    }
  }

  if (complete.length === 0) {
    return null;
  }

  try {
    const updates = complete.map((o) => JSON.parse(o) as unknown);
    return { updates };
  } catch {
    return null;
  }
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
