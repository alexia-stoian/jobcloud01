import { NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import { buildDurableProfileMemory } from "@/lib/profile/memory";

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      qualifications: true,
      onboardingSession: true
    }
  });

  if (!profile) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }

  const memory = buildDurableProfileMemory({
    profile,
    qualifications: profile.qualifications,
    onboardingSession: profile.onboardingSession
  });

  return NextResponse.json({ memory });
}
