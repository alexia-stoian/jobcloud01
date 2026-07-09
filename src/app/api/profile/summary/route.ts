import { NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import { buildProfileSummary } from "@/lib/profile/summary-builder";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      qualifications: true,
      historyEvents: {
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!profile) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }

  return NextResponse.json(
    buildProfileSummary({
    profile,
    qualifications: profile.qualifications,
    history: profile.historyEvents
    })
  );
}
