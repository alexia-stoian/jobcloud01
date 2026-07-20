import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { parseRecruiterNeeds } from "@/lib/sourcing/recruiter-needs";
import { aggregateCandidates } from "@/lib/sourcing/aggregate";
import { rankCandidates, buildMatchChecklist, buildConciseSummary } from "@/lib/sourcing/score";
import { buildReports, computeCommute } from "@/lib/sourcing/report";
import {
  createSourcingRun,
  findActiveCandidate,
  completeCandidate,
  queueCandidateQuestions,
  getLatestSourcingRun
} from "@/lib/sourcing/session-dal";
import { generateGapQuestions } from "@/lib/sourcing/questions";
import type { SourcingResponse, SourcingResult } from "@/lib/sourcing/types";

/** Minimum DISPLAYED fit % at which a shown candidate gets a queued gap-question set. */
const QUESTION_TRIGGER_FIT = 60;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How many candidates are returned to the client (each gets its own LLM report). */
const RESULT_COUNT = 3;

/**
 * Admin-gated recruiter-sourcing matcher.
 *
 * Gate: `requireAdmin()` runs FIRST — before any DB read. Non-admins and
 * unauthenticated callers get a `404`. Raw signal objects are NEVER returned;
 * only derived report text leaves this endpoint.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const gate = await requireAdmin();
  if ("response" in gate) {
    return gate.response;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = parseRecruiterNeeds(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { needs } = parsed;

  const bundles = await aggregateCandidates();
  const ranked = rankCandidates(needs, bundles);

  // De-duplicate by candidate identity so the SAME person (duplicate test
  // accounts sharing a name) is never shown more than once. `ranked` is sorted
  // by score descending, so the first occurrence per identity is the best one.
  const seenIdentity = new Set<string>();
  const distinct = ranked.filter((scored) => {
    const name = scored.bundle.name.trim().toLowerCase();
    // Empty names can't be de-duplicated by name — fall back to the unique userId.
    const identity = name.length > 0 ? `name:${name}` : `id:${scored.bundle.userId}`;
    if (seenIdentity.has(identity)) {
      return false;
    }
    seenIdentity.add(identity);
    return true;
  });

  // Generate LLM reports ONLY for the candidates we actually show (the top 3),
  // each as its own parallel focused call — no wasted work on unshown candidates.
  const topResults = distinct.slice(0, RESULT_COUNT);

  const reports = await buildReports(needs, topResults);
  const usedLlm = Array.from(reports.values()).some((report) => report.grounded);

  // Public-transport commute per shown candidate so the Location line can count
  // as met when the candidate can commute to the job within their radius.
  const commutes = await Promise.all(
    topResults.map((scored) =>
      computeCommute(needs.location, scored.bundle.preferences.preferredLocation, scored.bundle.preferences.commuteRadius)
    )
  );
  const withinRadiusById = new Map<string, boolean>();
  topResults.forEach((scored, index) => {
    withinRadiusById.set(scored.bundle.userId, commutes[index]?.withinRadius === true);
  });

  const results: SourcingResult[] = topResults.map((scored) => {
    const report = reports.get(scored.bundle.userId);
    return {
      userId: scored.bundle.userId,
      name: scored.bundle.name,
      fitPercent: report ? report.fitPercent : scored.score,
      whyFit: report?.whyFit ?? "",
      bestSkills: report?.bestSkills ?? [],
      pros: report?.pros ?? [],
      cons: report?.cons ?? [],
      verdict: report?.verdict ?? "not_recommended",
      recommendation: report?.recommendation ?? "",
      checklist: buildMatchChecklist(needs, scored, withinRadiusById.get(scored.bundle.userId)),
      summary: buildConciseSummary(needs, scored)
    };
  });

  // The deterministic score decides WHO makes the top 3, but the LLM assigns the
  // final displayed fit %. Re-sort the shown results by that displayed percentage
  // (stable tiebreak by name) so rank 1 always has the highest %, rank 2 the
  // next, and rank 3 the lowest — matching what the recruiter sees.
  results.sort((a, b) => (b.fitPercent - a.fitPercent) || a.name.localeCompare(b.name));

  // Persist a sourcing run and, for every SHOWN candidate whose DISPLAYED fit is
  // >= 60%, queue <=5 grounded gap questions (storing that displayed percentage
  // as `fitBefore`). This runs in parallel, retires any prior non-completed set
  // for a candidate first (one active set per candidate), and is wrapped so a
  // generation failure never alters or fails the recruiter's ranking response.
  try {
    const run = await createSourcingRun({
      recruiterUserId: gate.userId,
      needsSnapshot: needs,
      roleLabel: needs.role ?? null,
      // Persist the displayed ranking so the Sourcing page survives across ALL
      // admin connections (tied to the administrative part, not a user session).
      resultsSnapshot: { results, usedLlm, candidateCount: bundles.length }
    });

    const qualifying = results.filter((r) => r.fitPercent >= QUESTION_TRIGGER_FIT);
    await Promise.all(
      qualifying.map(async (r) => {
        // One-active-set guard: retire any existing pending/delivering set with no
        // visible change so a partially-answered older set is never orphaned.
        const existing = await findActiveCandidate(r.userId);
        if (existing) {
          await completeCandidate({
            candidateId: existing.id,
            fitAfter: existing.fitAfter ?? existing.fitBefore
          });
        }

        const questions = await generateGapQuestions(needs, r);
        if (questions.length === 0) {
          return;
        }

        await queueCandidateQuestions({
          sessionId: run.id,
          candidateUserId: r.userId,
          fitBefore: r.fitPercent,
          questions
        });
      })
    );
  } catch (error) {
    // Never fail the recruiter's ranking response on a generation error.
    console.error("[sourcing] gap-question generation failed:", error);
  }

  const response: SourcingResponse = {
    results,
    usedLlm,
    candidateCount: bundles.length
  };

  return NextResponse.json(response);
}

/**
 * Admin-gated read-back of the LAST sourcing run's displayed ranking.
 *
 * Gate: `requireAdmin()` runs FIRST. Returns the most-recent run's persisted
 * `resultsSnapshot` so the Sourcing page rehydrates for ANY admin on ANY
 * connection/login — it is tied to the administrative part of the app, not to a
 * particular user session. Returns an empty snapshot when no run exists yet.
 */
export async function GET(): Promise<NextResponse> {
  const gate = await requireAdmin();
  if ("response" in gate) {
    return gate.response;
  }

  const latest = await getLatestSourcingRun();
  const snapshot = (latest?.resultsSnapshot ?? {}) as {
    results?: SourcingResult[];
    usedLlm?: boolean;
    candidateCount?: number;
  };

  const response: SourcingResponse = {
    results: Array.isArray(snapshot.results) ? snapshot.results : [],
    usedLlm: Boolean(snapshot.usedLlm),
    candidateCount: typeof snapshot.candidateCount === "number" ? snapshot.candidateCount : 0
  };

  return NextResponse.json(response);
}
