import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { interpretRequestSchema } from "@/lib/profile/intent-schema";
import { parseIntentFromMessage } from "@/lib/profile/intent-parser";
import { requiresExplicitConfirmation, buildDiffPreview } from "@/lib/profile/confirm-policy";
import { assertJobDomainMessage } from "@/lib/ai/domain-guard";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = interpretRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  try {
    assertJobDomainMessage(parsed.data.message);
    const intent = parseIntentFromMessage(parsed.data.message);
    const confirmationId = randomUUID();
    return NextResponse.json({
      intents: [intent],
      confirmationRequired: requiresExplicitConfirmation([intent]),
      preview: buildDiffPreview([intent]),
      confirmationId,
      locale: parsed.data.locale
    });
  } catch (error) {
    return NextResponse.json({ error: "unable_to_interpret", detail: String(error) }, { status: 400 });
  }
}
