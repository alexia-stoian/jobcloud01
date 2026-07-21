import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { auth } from "@/auth/config";
import { RootChrome } from "@/components/layout/RootChrome";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap"
});

export const metadata: Metadata = {
  title: "JobScout24 Copilot",
  description: "Phase 1 foundation for auth, locale and candidate profile."
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>): Promise<React.ReactElement> {
  const session = await auth();
  const locale = await getLocale();
  const messages = await getMessages();
  const appMessages = messages.app as { brand?: string } | undefined;
  const authMessages = messages.auth as
    | { login?: string; signup?: string; forgotPassword?: string; profile?: string; signOut?: string }
    | undefined;

  return (
    <html lang={locale} className={geist.variable}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <RootChrome
            locale={locale}
            brandLabel={appMessages?.brand ?? "JobScout24"}
            isAuthenticated={Boolean(session?.user)}
            loginLabel={authMessages?.login ?? "Log in"}
            signupLabel={authMessages?.signup ?? "Create an account"}
            profileLabel={authMessages?.profile ?? "Profile"}
            signOutLabel={authMessages?.signOut ?? "Sign out"}
          >
            {children}
          </RootChrome>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
