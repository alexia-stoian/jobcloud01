import { randomBytes } from "crypto";
import { cookies } from "next/headers";

const CSRF_COOKIE = "phase1_csrf";

export async function issueCsrfToken(): Promise<string> {
  const token = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(CSRF_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
  return token;
}

export async function validateCsrfToken(token?: string | null): Promise<boolean> {
  if (!token) {
    return false;
  }
  const cookieStore = await cookies();
  const stored = cookieStore.get(CSRF_COOKIE)?.value;
  return Boolean(stored && stored === token);
}
