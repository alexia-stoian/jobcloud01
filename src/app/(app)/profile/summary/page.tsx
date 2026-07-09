import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import { buildProfileSummary } from "@/lib/profile/summary-builder";
import { ProfileSummaryCard } from "@/components/profile/ProfileSummaryCard";
import { redirect } from "next/navigation";
import { AppShellServer } from "@/components/layout/AppShellServer";

export const dynamic = "force-dynamic";

export default async function ProfileSummaryPage(): Promise<React.ReactElement> {
  const session = await auth();
  const userId = session?.user?.id
    ? session.user.id
    : session?.user?.email
      ? (
          await db.user.findUnique({
            where: { email: session.user.email },
            select: { id: true }
          })
        )?.id
      : undefined;

  if (!userId) {
      redirect("/login?callbackUrl=/profile/summary");
  }

  const profile = await db.candidateProfile.findUnique({
    where: { userId },
    include: {
      qualifications: true,
      historyEvents: {
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!profile) {
    return (
      <AppShellServer>
        <section className="img3-panel">
          <p>No profile found.</p>
        </section>
      </AppShellServer>
    );
  }

  const summary = buildProfileSummary({
    profile,
    qualifications: profile.qualifications,
    history: profile.historyEvents
  });

  return (
    <AppShellServer>
      <main className="img3-stack">
        <ProfileSummaryCard profile={summary.profile} />
      </main>
    </AppShellServer>
  );
}
