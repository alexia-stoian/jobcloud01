/**
 * Recruiter-signals persistence (Data Access Layer).
 *
 * INTERNAL / INVISIBLE MODULE. Single row per user (CandidateSignalState) holding
 * all 11 signals as a JSON array. Reuses the shared Prisma client from `@/lib/db`
 * and the Phase-6 `userId String` -> `User.id` (cuid/TEXT) FK convention.
 */

import { db } from "@/lib/db";
import { seedSignals, type SignalRecord } from "./signal-definitions";

// Re-export so callers can `seedSignals` from the DAL as well.
export { seedSignals } from "./signal-definitions";

/**
 * Load the persisted signal state for a user.
 *
 * If no row exists yet, returns a freshly seeded 11-signal array WITHOUT creating
 * the row (the row is created lazily on first `saveSignalState`).
 */
export async function loadSignalState(userId: string): Promise<SignalRecord[]> {
  const row = await db.candidateSignalState.findUnique({
    where: { userId },
    select: { signals: true },
  });

  if (!row) {
    return seedSignals();
  }

  return normalizeSignals(row.signals);
}

/**
 * Persist the signal state for a user.
 *
 * Upserts the single row, records the session id, increments `inputCount`, and
 * refreshes `updatedAt` (handled automatically by Prisma).
 */
export async function saveSignalState(
  userId: string,
  signals: SignalRecord[],
  sessionId: string | null
): Promise<void> {
  const serialized = JSON.parse(JSON.stringify(signals)) as unknown;

  await db.candidateSignalState.upsert({
    where: { userId },
    create: {
      userId,
      // Prisma's Json input type does not accept our concrete array type directly.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signals: serialized as any,
      lastSessionId: sessionId,
      inputCount: 1,
    },
    update: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signals: serialized as any,
      lastSessionId: sessionId,
      inputCount: { increment: 1 },
    },
  });
}

/**
 * Read the full stored state (signals + bookkeeping) for a user. Used by the
 * admin/recruiter read-only layer. Returns seeded defaults when no row exists.
 */
export async function loadSignalStateWithMeta(userId: string): Promise<{
  signals: SignalRecord[];
  inputCount: number;
  lastSessionId: string | null;
  updatedAt: Date | null;
}> {
  const row = await db.candidateSignalState.findUnique({
    where: { userId },
  });

  if (!row) {
    return { signals: seedSignals(), inputCount: 0, lastSessionId: null, updatedAt: null };
  }

  return {
    signals: normalizeSignals(row.signals),
    inputCount: row.inputCount,
    lastSessionId: row.lastSessionId,
    updatedAt: row.updatedAt,
  };
}

/**
 * Defensive cast of the stored Json into SignalRecord[]. Reconciles the stored
 * signals against the full registry so ALL 11 signals always exist — a signal
 * that is missing from an older/partial row (e.g. saved before the registry grew)
 * would otherwise never be updatable, because `mergeUpdates` only touches signals
 * already present in the prior array. Falls back to a fresh seed on bad shape.
 */
function normalizeSignals(value: unknown): SignalRecord[] {
  if (!Array.isArray(value)) {
    return seedSignals();
  }

  const stored = new Map<string, SignalRecord>();
  for (const item of value as SignalRecord[]) {
    if (item && typeof item === "object" && typeof item.key === "string") {
      stored.set(item.key, item);
    }
  }

  // Start from a fresh seed (guarantees every registry key is present) and
  // overlay any stored values on top.
  return seedSignals().map((seed) => stored.get(seed.key) ?? seed);
}
