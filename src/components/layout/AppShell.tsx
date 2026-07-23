"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import type { Route } from "next";
import type { StaticImageData } from "next/image";
import {
  Bell,
  Briefcase,
  ChatCircle,
  House,
  MagnifyingGlass,
  ShieldCheck,
  Sparkle,
  User
} from "@phosphor-icons/react";
import { AppFooter } from "./AppFooter";
import { JsLogo } from "./JsLogo";

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

const ICON_COMPONENTS: Record<IconName, typeof House> = {
  home: House,
  sparkle: Sparkle,
  search: MagnifyingGlass,
  user: User,
  chat: ChatCircle,
  bell: Bell,
  shield: ShieldCheck,
  briefcase: Briefcase
};

function NavIcon({ name }: { name: IconName }): React.ReactElement {
  const Icon = ICON_COMPONENTS[name];
  return <Icon size={20} weight="regular" aria-hidden="true" />;
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
          <JsLogo className="app-topbar__brand-image" height={26} />
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
            <JsLogo className="app-sidebar__brand-image" height={30} />
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
