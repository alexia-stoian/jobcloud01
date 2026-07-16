"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import type { Route } from "next";
import type { StaticImageData } from "next/image";
import logo from "../../../images/logo.png";

type NavItem = {
  labelKey: "dashboard" | "careerGuide" | "discoverJobs" | "profile" | "messages" | "notifications" | "admin";
  icon: string;
  href:
    | "/dashboard/unavailable/dashboard"
    | "/onboarding"
    | "/dashboard/unavailable/discover-jobs"
    | "/profile/summary"
    | "/dashboard/unavailable/messages"
    | "/dashboard/unavailable/notifications"
    | "/admin";
};

type Props = {
  userName: string;
  userRole: string;
  isAdmin: boolean;
  profileImageSrc: string | StaticImageData;
  children: React.ReactNode;
};

const navItems: NavItem[] = [
  { labelKey: "dashboard", icon: "⌂", href: "/dashboard/unavailable/dashboard" },
  { labelKey: "careerGuide", icon: "◌", href: "/onboarding" },
  { labelKey: "discoverJobs", icon: "⌕", href: "/dashboard/unavailable/discover-jobs" },
  { labelKey: "profile", icon: "◉", href: "/profile/summary" },
  { labelKey: "messages", icon: "⌘", href: "/dashboard/unavailable/messages" },
  { labelKey: "notifications", icon: "◔", href: "/dashboard/unavailable/notifications" }
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/onboarding") {
    return pathname.startsWith("/onboarding") || pathname.startsWith("/career-guide");
  }

  if (href === "/profile/summary") {
    return pathname.startsWith("/profile");
  }

  if (href === "/admin") {
    return pathname.startsWith("/admin");
  }

  return pathname === href;
}

export function AppShell({ userName, userRole, isAdmin, profileImageSrc, children }: Props): React.ReactElement {
  const tApp = useTranslations("app");
  const tAuth = useTranslations("auth");
  const locale = useLocale();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  async function updateLocale(nextLocale: string): Promise<void> {
    document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000; samesite=lax`;

    await fetch("/api/me/locale", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": nextLocale
      },
      body: JSON.stringify({ locale: nextLocale })
    }).catch(() => undefined);

    window.location.reload();
  }

  const appTitle = useMemo(() => {
    if (pathname.startsWith("/onboarding") || pathname.startsWith("/career-guide")) {
      return "Onboarding";
    }

    if (pathname.startsWith("/profile/chat")) {
      return tApp("profileChat");
    }

    if (pathname.startsWith("/profile")) {
      return tApp("profile");
    }

    return tApp("dashboard");
  }, [pathname, tApp]);

  const items = useMemo<NavItem[]>(
    () => (isAdmin ? [...navItems, { labelKey: "admin", icon: "◈", href: "/admin" }] : navItems),
    [isAdmin]
  );


  return (
    <div className={`app-shell${collapsed ? " app-shell--collapsed" : ""}`}>
      <aside className="app-sidebar" aria-label="Primary navigation">
        <div className="app-sidebar__header">
          <Link href="/profile/summary" className="app-sidebar__brand" aria-label="JobScout24">
            <Image src={logo} alt="JobScout24" className="app-sidebar__brand-image" priority />
          </Link>
          {!collapsed ? (
            <button
              type="button"
              className="app-sidebar__collapse"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
            >
              ◧
            </button>
          ) : null}
        </div>

        {collapsed ? (
          <button
            type="button"
            className="app-sidebar__collapsed-tab"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
          >
            ☰
          </button>
        ) : (
          <nav className="app-sidebar__nav">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href as Route}
                className={`app-sidebar__link${isActive(pathname, item.href) ? " app-sidebar__link--active" : ""}`}
              >
                <span className="app-sidebar__link-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="app-sidebar__link-label">{tApp(item.labelKey)}</span>
              </Link>
            ))}
          </nav>
        )}

        {!collapsed ? (
          <div className="app-sidebar__profile">
            <Image src={profileImageSrc} alt="Profile image" width={44} height={44} className="app-sidebar__avatar" />
            <div className="app-sidebar__profile-copy">
              <p className="app-sidebar__name">{userName}</p>
              {userRole ? <p className="app-sidebar__role">{userRole}</p> : null}
              <p className="app-sidebar__meta">{tApp("loggedInAvailable")}</p>
            </div>
            <div className="app-sidebar__profile-menu">
              <button
                type="button"
                className="app-sidebar__profile-menu-trigger"
                onClick={() => setProfileMenuOpen((value) => !value)}
                aria-label="Open profile options"
              >
                ⋯
              </button>
              {profileMenuOpen ? (
                <div className="app-sidebar__profile-menu-popover" role="menu" aria-label="Profile options">
                  <p className="app-sidebar__profile-menu-group-label">{tApp("language")}</p>
                  <button
                    type="button"
                    className={`app-sidebar__profile-menu-item${locale === "en" ? " app-sidebar__profile-menu-item--active" : ""}`}
                    onClick={() => updateLocale("en")}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    className={`app-sidebar__profile-menu-item${locale === "de" ? " app-sidebar__profile-menu-item--active" : ""}`}
                    onClick={() => updateLocale("de")}
                  >
                    Deutsch
                  </button>
                  <button
                    type="button"
                    className={`app-sidebar__profile-menu-item${locale === "fr" ? " app-sidebar__profile-menu-item--active" : ""}`}
                    onClick={() => updateLocale("fr")}
                  >
                    Francais
                  </button>
                  <div className="app-sidebar__profile-menu-separator" aria-hidden="true" />
                  <button type="button" className="app-sidebar__profile-menu-item" onClick={() => signOut({ callbackUrl: "/" })}>
                    {tAuth("signOut")}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </aside>

      <section className="app-main">
        <header className="app-main__header">
          <h1>{appTitle}</h1>
        </header>
        <div className="app-main__canvas">{children}</div>
      </section>
    </div>
  );
}
