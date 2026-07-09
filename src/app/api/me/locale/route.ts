import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import { isSupportedLocale } from "@/i18n/config";
import { incrementMetric } from "@/lib/observability/metrics";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  if (!body.locale || !isSupportedLocale(body.locale)) {
    return NextResponse.json({ error: "invalid_locale" }, { status: 400 });
  }

  await db.candidateProfile.update({
    where: { userId: session.user.id },
    data: { locale: body.locale }
  });

  incrementMetric("locale.switch.success");
  return NextResponse.json({ success: true });
}
