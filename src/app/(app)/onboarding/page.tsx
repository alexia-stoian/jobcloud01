import { auth } from "@/auth/config";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { OnboardingCvUploadForm } from "@/components/onboarding/OnboardingCvUploadForm";
import { AppShellServer } from "@/components/layout/AppShellServer";

export default async function OnboardingPage(): Promise<React.ReactElement> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/onboarding");
  }

  const locale = await getLocale();
  const normalizedLocale = locale === "de" || locale === "fr" ? locale : "en";

  return (
    <AppShellServer>
      <OnboardingCvUploadForm locale={normalizedLocale} />
    </AppShellServer>
  );
}
