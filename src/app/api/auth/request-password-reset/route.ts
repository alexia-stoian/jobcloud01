import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateTokenPair } from "@/auth/password";
import { db } from "@/lib/db";
import { buildResetPasswordTemplate } from "@/lib/email/templates/auth";
import { recordAuthEvent } from "@/lib/audit/auth-events";
import { checkRateLimit } from "@/lib/security/rate-limit";

const schema = z.object({
  email: z.string().email()
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ipKey = request.headers.get("x-forwarded-for") ?? "reset-local";
  if (!checkRateLimit(`password-reset:${ipKey}`, 20, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (!user) {
    return NextResponse.json({ success: true });
  }

  const reset = generateTokenPair(30);
  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: reset.tokenHash,
      expiresAt: reset.expiresAt
    }
  });

  await recordAuthEvent("password_reset_requested", user.id, { email: parsed.data.email });
  const emailMessage = buildResetPasswordTemplate(reset.token);
  console.log({ type: "email", to: parsed.data.email, ...emailMessage });

  return NextResponse.json({ success: true });
}
