import { NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    include: { historyEvents: { orderBy: { createdAt: "desc" } } }
  });

  return NextResponse.json({ history: profile?.historyEvents ?? [] });
}
