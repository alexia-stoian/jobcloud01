import { auth } from "@/auth/config";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { ApplicationCoachChat } from "@/components/onboarding/ApplicationCoachChat";
import { AppShellServer } from "@/components/layout/AppShellServer";

export default async function ApplicationCoachPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/application-coach");
  }

  const locale = await getLocale();
  const normalizedLocale = locale === "de" || locale === "fr" ? locale : "en";

  return (
    <AppShellServer>
      <ApplicationCoachChat locale={normalizedLocale} />
    </AppShellServer>
  );
}
