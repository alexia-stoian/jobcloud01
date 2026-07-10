import { getRequestConfig } from "next-intl/server";
import { headers } from "next/headers";
import { auth } from "@/auth/config";
import { db } from "@/lib/db";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/i18n/config";

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = await requestLocale;
  const headerStore = await headers();
  const middlewareLocale = headerStore.get("x-app-locale");
  const session = await auth();
  const profileLocale = session?.user?.id
    ? (
        await db.candidateProfile.findUnique({
          where: { userId: session.user.id },
          select: { locale: true }
        })
      )?.locale
    : undefined;

  const currentLocale =
    (profileLocale && isSupportedLocale(profileLocale) && profileLocale) ||
    (middlewareLocale && isSupportedLocale(middlewareLocale) && middlewareLocale) ||
    (locale && isSupportedLocale(locale) && locale) ||
    DEFAULT_LOCALE;

  return {
    locale: currentLocale,
    messages: (await import(`../../messages/${currentLocale}.json`)).default
  };
});
