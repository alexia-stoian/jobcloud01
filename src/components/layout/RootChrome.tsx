"use client";

import Image from "next/image";
import Link from "next/link";
import { HeaderActions } from "@/components/header/HeaderActions";
import { LanguageSwitcher } from "@/components/header/LanguageSwitcher";
import logo from "../../../images/logo.png";

type Props = {
  children: React.ReactNode;
  locale: string;
  brandLabel: string;
  isAuthenticated: boolean;
  loginLabel: string;
  signupLabel: string;
  profileLabel: string;
  signOutLabel: string;
};

export function RootChrome({
  children,
  locale,
  brandLabel,
  isAuthenticated,
  loginLabel,
  signupLabel,
  profileLabel,
  signOutLabel
}: Props): React.ReactElement {
  return (
    <div className="site-shell">
      {!isAuthenticated ? (
        <header className="site-header">
          <Link href="/" className="brand-mark" aria-label={brandLabel}>
            <Image src={logo} alt={brandLabel} className="brand-mark__image" priority />
          </Link>
          <div className="site-actions">
            <LanguageSwitcher locale={locale} />
            <span className="site-actions__divider" aria-hidden="true" />
            <HeaderActions
              isAuthenticated={isAuthenticated}
              loginLabel={loginLabel}
              signupLabel={signupLabel}
              profileLabel={profileLabel}
              signOutLabel={signOutLabel}
            />
          </div>
        </header>
      ) : null}
      {children}
    </div>
  );
}
