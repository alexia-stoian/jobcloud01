import { NextRequest, NextResponse } from "next/server";

const SUPPORTED_LOCALES = ["en", "de", "fr"] as const;

function resolveLocale(request: NextRequest): string {
  const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value;
  if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale as (typeof SUPPORTED_LOCALES)[number])) {
    return cookieLocale;
  }

  const acceptLanguage = request.headers.get("accept-language");
  if (acceptLanguage) {
    const candidates = acceptLanguage
      .split(",")
      .map((part) => part.split(";")[0]?.trim().toLowerCase())
      .filter((part): part is string => Boolean(part));

    for (const candidate of candidates) {
      const baseLocale = candidate.split("-")[0];
      if (baseLocale && SUPPORTED_LOCALES.includes(baseLocale as (typeof SUPPORTED_LOCALES)[number])) {
        return baseLocale;
      }
    }
  }

  return "en";
}

export function middleware(request: NextRequest): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-app-locale", resolveLocale(request));
  requestHeaders.set("x-pathname", request.nextUrl.pathname);

  return NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"]
};
