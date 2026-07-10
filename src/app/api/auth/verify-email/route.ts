import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { recordAuthEvent } from "@/lib/audit/auth-events";
import { incrementMetric } from "@/lib/observability/metrics";

const schema = z.object({
  email: z.string().email(),
  token: z.string().min(20)
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const token = await db.verificationToken.findFirst({
    where: {
      identifier: parsed.data.email,
      tokenHash,
      expires: { gt: new Date() }
    }
  });

  if (!token) {
    incrementMetric("auth.verify.failed");
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  await db.$transaction([
    db.user.update({
      where: { email: parsed.data.email },
      data: { emailVerified: new Date() }
    }),
    db.verificationToken.delete({
      where: {
        identifier_tokenHash: {
          identifier: token.identifier,
          tokenHash: token.tokenHash
        }
      }
    })
  ]);

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  await recordAuthEvent("verify_email_success", user?.id, { email: parsed.data.email });
  incrementMetric("auth.verify.success");

  return NextResponse.json({ success: true });
}
