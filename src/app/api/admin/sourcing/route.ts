import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { parseRecruiterNeeds } from "@/lib/sourcing/recruiter-needs";
import { aggregateCandidates } from "@/lib/sourcing/aggregate";
import { rankCandidates } from "@/lib/sourcing/score";
import { buildReports } from "@/lib/sourcing/report";
import type { SourcingResponse, SourcingResult } from "@/lib/sourcing/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How many top candidates are sent to the LLM for a narrative report. */
const TOP_N_FOR_LLM = 5;
/** How many candidates are returned to the client. */
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
  const topForLlm = ranked.slice(0, TOP_N_FOR_LLM);

  const reports = await buildReports(needs, topForLlm);
  const usedLlm = Array.from(reports.values()).some((report) => report.grounded);

  const results: SourcingResult[] = ranked.slice(0, RESULT_COUNT).map((scored) => {
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
      recommendation: report?.recommendation ?? ""
    };
  });

  const response: SourcingResponse = {
    results,
    usedLlm,
    candidateCount: bundles.length
  };

  return NextResponse.json(response);
}
