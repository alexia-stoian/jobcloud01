import { redirect } from "next/navigation";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import { AppShell } from "@/components/layout/AppShell";
import dashboardImage from "../../../images/img3.jpeg";

type Props = {
  children: React.ReactNode;
};

export async function AppShellServer({ children }: Props): Promise<React.ReactElement> {
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
    redirect("/login?callbackUrl=/dashboard");
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      profile: { select: { fullName: true, primaryRole: true } }
    }
  });

  const emailName = user?.email ? user.email.split("@")[0] : undefined;
  const userName = user?.profile?.fullName?.trim() || emailName || "Candidate";
  const userRole = user?.profile?.primaryRole?.trim() || "";

  return (
    <AppShell userName={userName} userRole={userRole} profileImageSrc={dashboardImage}>
      {children}
    </AppShell>
  );
}
