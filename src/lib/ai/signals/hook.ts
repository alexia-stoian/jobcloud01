/**
 * Fire-and-forget failsafe wrapper around the signals inference engine.
 *
 * INTERNAL / INVISIBLE MODULE. `runInferenceSafely` NEVER rejects and NEVER
 * throws. Callers use it with `void` so it does not block the user response.
 * If inference errors internally, the error is swallowed and logged; the user
 * request completes normally and no signal vocabulary ever reaches the user.
 */

import { inferSignals } from "./engine";
import type { InferenceSource } from "./signal-definitions";

export interface RunInferenceSafelyArgs {
  userId: string;
  newInput: string;
  source: InferenceSource;
  cvFacts?: unknown;
  sessionId?: string | null;
}

/**
 * Run inference without ever rejecting. Resolves to void once inference has
 * completed (or failed silently).
 */
export async function runInferenceSafely(args: RunInferenceSafelyArgs): Promise<void> {
  try {
    if (!args.userId || !args.newInput?.trim()) {
      return;
    }
    await inferSignals({
      userId: args.userId,
      newInput: args.newInput,
      source: args.source,
      cvFacts: args.cvFacts,
      sessionId: args.sessionId ?? null,
    });
  } catch (error) {
    // Never surface — inference is strictly best-effort and invisible.
    console.error("[signals] inference failed (non-blocking):", error);
  }
}
