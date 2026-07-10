import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readMetrics } from "@/lib/observability/metrics";

export async function GET(): Promise<NextResponse> {
  const dbOk = await db.$queryRaw`SELECT 1`;
  return NextResponse.json({
    status: "ok",
    checks: {
      db: Boolean(dbOk),
      metrics: readMetrics()
    }
  });
}
