import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword } from "@/auth/password";
import { recordAuthEvent } from "@/lib/audit/auth-events";

const schema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(8)
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const resetToken = await db.passwordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() }
    }
  });

  if (!resetToken) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  await db.$transaction([
    db.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash: newHash }
    }),
    db.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() }
    })
  ]);

  await recordAuthEvent("password_reset_complete", resetToken.userId);

  return NextResponse.json({ success: true });
}
