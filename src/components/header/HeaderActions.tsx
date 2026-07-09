"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  isAuthenticated: boolean;
  loginLabel: string;
  signupLabel: string;
  profileLabel: string;
  signOutLabel: string;
};

export function HeaderActions({
  isAuthenticated,
  loginLabel,
  signupLabel,
  profileLabel,
  signOutLabel
}: Props): React.ReactElement {
  const pathname = usePathname();
  const publicGuestRoutes = new Set(["/", "/login", "/signup", "/forgot-password"]);
  const forceGuestActions = publicGuestRoutes.has(pathname);

  if (forceGuestActions || !isAuthenticated) {
    return (
      <>
        <Link href="/login" className="nav-button">
          {loginLabel}
        </Link>
        <Link href="/signup" className="nav-button nav-button--primary">
          {signupLabel}
        </Link>
      </>
    );
  }

  return (
    <>
      <Link href="/dashboard" className="nav-button">
        {profileLabel}
      </Link>
      <Link href="/api/auth/signout?callbackUrl=/" className="nav-button nav-button--primary">
        {signOutLabel}
      </Link>
    </>
  );
}
