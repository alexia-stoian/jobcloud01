/**
 * Visible-increase re-score clamp for Phase 11 sourcing.
 *
 * SERVER-ONLY, pure. The LLM decides how a candidate's answers move their match
 * %, but decision D3 guarantees that a good answer must produce a VISIBLE
 * increase — never a decrease. `rescoreFromAnswers` clamps the LLM's proposed
 * value so a satisfactory answer always bumps the displayed fit by at least
 * `max(1, goodAnswers)` (capped at 100), and leaves the fit unchanged when
 * nothing landed.
 */

/** Round + clamp a number into an inclusive integer range. */
function clampInt(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) {
    return lo;
  }
  return Math.min(hi, Math.max(lo, Math.round(value)));
}

export interface RescoreArgs {
  /** The displayed fitPercent at generation time (0..100). */
  fitBefore: number;
  /** Correct choices + satisfiedNeed open answers. */
  goodAnswers: number;
  /** The LLM's proposed new fit % (0..100, pre-clamp). */
  llmAfter: number;
}

/**
 * Clamp the re-scored fit so good answers always yield a visible increase.
 *
 * - With no good answers, the fit is returned unchanged (no visible change).
 * - With good answers, the result is at least `fitBefore + max(1, goodAnswers)`
 *   (capped at 100), and never below the LLM's own proposal.
 */
export function rescoreFromAnswers(args: RescoreArgs): number {
  const fitBefore = clampInt(args.fitBefore, 0, 100);
  const llm = clampInt(args.llmAfter, 0, 100);

  if (args.goodAnswers <= 0) {
    return fitBefore;
  }

  const minVisible = Math.min(100, fitBefore + Math.max(1, args.goodAnswers));
  return Math.max(llm, minVisible);
}
