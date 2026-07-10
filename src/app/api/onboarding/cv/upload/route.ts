import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { cvUploadRequestSchema } from "@/lib/cv/extract";
import { upsertOnboardingCvExtraction } from "@/lib/onboarding/persist";

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

  try {
    const result = await upsertOnboardingCvExtraction({
      userId: session.user.id,
      cvText: parsed.data.cvText,
      fileName: parsed.data.fileName,
      mimeType: parsed.data.mimeType,
      locale: parsed.data.locale
    });

    return NextResponse.json({
      success: true,
      session: result.session,
      facts: result.extracted.facts,
      uncertainFacts: result.extracted.uncertainFacts,
      profileSeeds: result.profileSeeds
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[CV Upload] Error:", errorMessage, error);
    return NextResponse.json(
      { error: "extraction_failed", detail: errorMessage },
      { status: 500 }
    );
  }
}
