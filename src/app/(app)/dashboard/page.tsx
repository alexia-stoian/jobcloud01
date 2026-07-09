import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AppShellServer } from "@/components/layout/AppShellServer";

export const metadata: Metadata = {
  title: "Dashboard | JobScout24 Copilot",
  description: "Authenticated dashboard entry for JobScout24 Copilot"
};

export const dynamic = "force-dynamic";

export default async function DashboardPage(): Promise<React.ReactElement> {
  return (
    <AppShellServer>
      <DashboardShell
        userName="John Doe"
        profileHref="/profile/summary"
        careerGuideHref="/career-guide"
      />
    </AppShellServer>
  );
}