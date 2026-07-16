"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  targetRole: string | null;
  isComplete: boolean;
};

type ApiResponse = {
  users: AdminUser[];
};

type Props = {
  /**
   * Optional selection handler. Plan 2 wires the "Profile" button to this;
   * Plan 3 supplies a handler that opens the right-side profile/signals panel.
   */
  onSelect?: (userId: string) => void;
  /** Currently-open user, for the selected card highlight. */
  selectedUserId?: string | null;
};

type LoadState = "loading" | "error" | "ready";

/** First initial of the best available display name for the avatar. */
function initialOf(user: AdminUser): string {
  const source = user.name?.trim() || user.email?.trim() || "?";
  return source.charAt(0).toUpperCase();
}

/**
 * Admin-only client list of every user. Fetches `/api/admin/users` (server-gated
 * by `requireAdmin`) on mount and renders one card per user with avatar,
 * name/email, target role, a completion pill, and a "Profile" button.
 */
export function AdminUsersList({ onSelect, selectedUserId }: Props): React.ReactElement {
  const t = useTranslations("admin");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const response = await fetch("/api/admin/users", { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) {
            setState("error");
          }
          return;
        }
        const data = (await response.json()) as ApiResponse;
        if (!cancelled) {
          setUsers(Array.isArray(data.users) ? data.users : []);
          setState("ready");
        }
      } catch {
        if (!cancelled) {
          setState("error");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return users;
    }
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(needle) ||
        user.email.toLowerCase().includes(needle)
    );
  }, [users, query]);

  return (
    <section className="admin-list">
      <header className="admin-list__header">
        <div>
          <h1 className="admin-list__title">{t("title")}</h1>
          <p className="admin-list__subtitle">{t("usersHeading")}</p>
        </div>
        {state === "ready" && (
          <span className="admin-count">
            <span className="admin-count__dot" aria-hidden="true" />
            {t("countLabel", { count: filtered.length })}
          </span>
        )}
      </header>

      <div className="admin-search">
        <span className="admin-search__icon" aria-hidden="true">⌕</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="admin-search__input"
        />
      </div>

      {state === "loading" && <p className="admin-state">{t("loading")}</p>}
      {state === "error" && <p className="admin-state" role="alert">{t("error")}</p>}
      {state === "ready" && filtered.length === 0 && <p className="admin-state">{t("empty")}</p>}

      {state === "ready" && filtered.length > 0 && (
        <ul className="admin-cards">
          {filtered.map((user) => (
            <li
              key={user.id}
              className="admin-card"
              aria-selected={selectedUserId === user.id}
            >
              <span className="admin-avatar" aria-hidden="true">{initialOf(user)}</span>
              <div className="admin-card__body">
                <span className="admin-card__name" title={user.name}>{user.name}</span>
                <span className="admin-card__email" title={user.email}>{user.email}</span>
                <span className="admin-card__meta">
                  <span
                    className={user.targetRole ? "admin-chip" : "admin-chip admin-chip--muted"}
                    title={user.targetRole ?? undefined}
                  >
                    {user.targetRole ?? t("noTargetRole")}
                  </span>
                  <span
                    className={user.isComplete ? "admin-pill admin-pill--ok" : "admin-pill admin-pill--pending"}
                  >
                    {user.isComplete ? t("complete") : t("incomplete")}
                  </span>
                </span>
              </div>
              <button
                type="button"
                className="admin-card__action"
                onClick={() => onSelect?.(user.id)}
              >
                {t("profileButton")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
