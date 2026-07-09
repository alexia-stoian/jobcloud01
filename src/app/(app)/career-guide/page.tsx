import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth/config";
import { AppShellServer } from "@/components/layout/AppShellServer";
import { CareerGuideClient } from "@/components/guidance/CareerGuideClient";

export const metadata: Metadata = {
  title: "Career Guide | JobScout24 Copilot",
  description: "Personalised job-search guidance, interview preparation, and coaching based on your profile."
};

export const dynamic = "force-dynamic";

export default async function CareerGuidePage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/career-guide");
  }

  return (
    <AppShellServer>
      <div className="guidance-page">
        <header className="guidance-header">
          <h1 className="guidance-header__title">Career Guide</h1>
          <p className="guidance-header__sub">Personalised coaching based on your saved profile 🎯</p>
        </header>
        <CareerGuideClient />
      </div>
    </AppShellServer>
  );
}
