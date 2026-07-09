import { NextResponse } from "next/server";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import { buildDurableProfileMemory } from "@/lib/profile/memory";

type DatasetRow = {
  profileId: string;
  userId: string;
  locale: string;
  prompt: string;
  expectedBehavior: string;
  confirmationProvenance: string;
  memoryContext: ReturnType<typeof buildDurableProfileMemory>;
};

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const profile = await db.candidateProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      qualifications: true,
      onboardingSession: true,
      historyEvents: {
        orderBy: { createdAt: "desc" },
        take: 100
      }
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

  const rows: DatasetRow[] = profile.historyEvents.map((event) => ({
    profileId: profile.id,
    userId: profile.userId,
    locale: profile.locale,
    prompt: `Apply profile mutation source=${event.source} with change set`,
    expectedBehavior: "Reuse confirmed profile facts and avoid asking already confirmed details.",
    confirmationProvenance: event.confirmationRef ?? "history_event",
    memoryContext: memory
  }));

  return NextResponse.json({
    rows,
    count: rows.length
  });
}
