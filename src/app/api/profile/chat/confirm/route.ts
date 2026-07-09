import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { confirmRequestSchema } from "@/lib/profile/intent-schema";
import { applyConfirmedProfileMutation } from "@/lib/profile/service";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = confirmRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  if (!parsed.data.confirmationAccepted) {
    return NextResponse.json({ success: false, reason: "confirmation_required" }, { status: 409 });
  }

  const result = await applyConfirmedProfileMutation({
    userId: session.user.id,
    intents: parsed.data.intents,
    confirmationRef: parsed.data.confirmationId
  });

  return NextResponse.json({ success: true, ...result });
}
