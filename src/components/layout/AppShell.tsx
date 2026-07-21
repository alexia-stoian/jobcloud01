"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import type { Route } from "next";
import type { StaticImageData } from "next/image";
import logo from "../../../images/logo.png";
import { AppFooter } from "./AppFooter";

type IconName = "home" | "sparkle" | "search" | "user" | "chat" | "bell" | "shield" | "briefcase";

type NavItem = {
  labelKey: "dashboard" | "careerGuide" | "discoverJobs" | "profile" | "messages" | "notifications" | "admin" | "sourcing";
  icon: IconName;
  badge?: "new";
  href:
    | "/dashboard/unavailable/dashboard"
    | "/onboarding"
    | "/dashboard/unavailable/discover-jobs"
    | "/profile/summary"
    | "/dashboard/unavailable/messages"
    | "/dashboard/unavailable/notifications"
    | "/admin"
    | "/admin/sourcing";
};

type Props = {
  userName: string;
  userRole: string;
  isAdmin: boolean;
  profileImageSrc: string | StaticImageData;
  children: React.ReactNode;
};

const navItems: NavItem[] = [
  { labelKey: "dashboard", icon: "home", href: "/dashboard/unavailable/dashboard" },
  { labelKey: "careerGuide", icon: "sparkle", badge: "new", href: "/onboarding" },
  { labelKey: "discoverJobs", icon: "search", href: "/dashboard/unavailable/discover-jobs" },
  { labelKey: "profile", icon: "user", href: "/profile/summary" },
  { labelKey: "messages", icon: "chat", href: "/dashboard/unavailable/messages" },
  { labelKey: "notifications", icon: "bell", href: "/dashboard/unavailable/notifications" }
];

const ICON_PATHS: Record<IconName, React.ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5M5.25 9v10.5A1.5 1.5 0 0 0 6.75 21h3.75v-6h3v6h3.75a1.5 1.5 0 0 0 1.5-1.5V9" />,
  sparkle: <path d="M12 3.5 13.9 9l5.5 1.9-5.5 1.9L12 18.3l-1.9-5.5L4.6 10.9 10.1 9 12 3.5ZM19 3v3M20.5 4.5h-3" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.6-3.6" /></>,
  user: <><circle cx="12" cy="8" r="3.75" /><path d="M4.75 20a7.25 7.25 0 0 1 14.5 0" /></>,
  chat: <path d="M4 5.5h16v11H9l-4 3.5v-3.5H4z" />,
  bell: <path d="M6.5 9.5a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5ZM10 18.5a2 2 0 0 0 4 0" />,
  shield: <path d="M12 3l7 2.5v5.5c0 4.5-3 8-7 9.5-4-1.5-7-5-7-9.5V5.5L12 3Z" />,
  briefcase: <><rect x="3.5" y="7.5" width="17" height="12" rx="2" /><path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5M3.5 12.5h17" /></>
};

function NavIcon({ name }: { name: IconName }): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/onboarding") {
    return pathname.startsWith("/onboarding") || pathname.startsWith("/career-guide");
  }

  if (href === "/profile/summary") {
    return pathname.startsWith("/profile");
  }

  if (href === "/admin/sourcing") {
    return pathname.startsWith("/admin/sourcing");
  }

  if (href === "/admin") {
    return pathname === "/admin" || (pathname.startsWith("/admin") && !pathname.startsWith("/admin/sourcing"));
  }

  return pathname === href;
}

export function AppShell({ userName, userRole, isAdmin, profileImageSrc, children }: Props): React.ReactElement {
  const tApp = useTranslations("app");
  const tAuth = useTranslations("auth");
  const locale = useLocale();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
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

  const crumbs = useMemo<string[]>(() => {
    const segments = pathname.split("/").filter((segment) => Boolean(segment) && !segment.startsWith("["));
    const prettify = (segment: string): string =>
      segment.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
    return segments.map(prettify);
  }, [pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const items = useMemo<NavItem[]>(
    () =>
      isAdmin
        ? [
            ...navItems,
            { labelKey: "admin", icon: "shield", href: "/admin" },
            { labelKey: "sourcing", icon: "briefcase", href: "/admin/sourcing" }
          ]
        : navItems,
    [isAdmin]
  );


  return (
    <div
      className={`app-shell${collapsed ? " app-shell--collapsed" : ""}${mobileOpen ? " app-shell--mobile-open" : ""}`}
    >
      <header className="app-topbar">
        <button
          type="button"
          className="app-topbar__menu"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
        >
          <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <Link href="/profile/summary" className="app-topbar__brand" aria-label="JobScout24">
          <Image src={logo} alt="JobScout24" className="app-topbar__brand-image" priority />
        </Link>
        <Image src={profileImageSrc} alt="Profile image" width={36} height={36} className="app-topbar__avatar" />
      </header>

      <button
        type="button"
        className="app-shell__overlay"
        onClick={() => setMobileOpen(false)}
        aria-label="Close navigation menu"
        tabIndex={mobileOpen ? 0 : -1}
      />

      <aside className="app-sidebar" aria-label="Primary navigation">
        <div className="app-sidebar__header">
          <Link href="/profile/summary" className="app-sidebar__brand" aria-label="JobScout24">
            <Image src={logo} alt="JobScout24" className="app-sidebar__brand-image" priority />
          </Link>
          <button
            type="button"
            className="app-sidebar__collapse"
            onClick={() => (mobileOpen ? setMobileOpen(false) : setCollapsed((value) => !value))}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? "☰" : "◧"}
          </button>
        </div>

        <nav className="app-sidebar__nav">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href as Route}
              className={`app-sidebar__link${isActive(pathname, item.href) ? " app-sidebar__link--active" : ""}`}
              title={tApp(item.labelKey)}
              onClick={() => setMobileOpen(false)}
            >
              <span className="app-sidebar__link-icon" aria-hidden="true">
                <NavIcon name={item.icon} />
              </span>
              <span className="app-sidebar__link-label">{tApp(item.labelKey)}</span>
              {item.badge === "new" ? <span className="app-sidebar__link-badge">{tApp("badgeNew")}</span> : null}
            </Link>
          ))}
        </nav>

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
      </aside>

      <section className="app-main">
        <header className="app-main__header">
          {crumbs.length > 0 ? (
            <nav className="js-breadcrumbs" aria-label="Breadcrumb">
              <span className="js-breadcrumbs__item">Home</span>
              {crumbs.map((crumb, index) => (
                <span key={`${crumb}-${index}`} className="js-breadcrumbs__item-wrap">
                  <span className="js-breadcrumbs__sep" aria-hidden="true">
                    /
                  </span>
                  <span
                    className={`js-breadcrumbs__item${index === crumbs.length - 1 ? " js-breadcrumbs__item--current" : ""}`}
                    aria-current={index === crumbs.length - 1 ? "page" : undefined}
                  >
                    {crumb}
                  </span>
                </span>
              ))}
            </nav>
          ) : null}
          <h1>{appTitle}</h1>
        </header>
        <div className="app-main__canvas">{children}</div>
        <AppFooter />
      </section>
    </div>
  );
}
