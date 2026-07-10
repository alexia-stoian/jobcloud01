import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { cvUploadRequestSchema } from "@/lib/cv/extract";
import { extractCvFacts } from "@/lib/cv/extract";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = cvUploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const extracted = await extractCvFacts(parsed.data.cvText);
  return NextResponse.json({
    facts: extracted.facts,
    uncertainFacts: extracted.uncertainFacts,
    locale: parsed.data.locale
  });
}
