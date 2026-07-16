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
};

type LoadState = "loading" | "error" | "ready";

/**
 * Admin-only client list of every user. Fetches `/api/admin/users` (server-gated
 * by `requireAdmin`) on mount and renders one row per user with name/email,
 * target role, a completion badge, and a "Profile" button.
 */
export function AdminUsersList({ onSelect }: Props): React.ReactElement {
  const t = useTranslations("admin");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

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

  const handleSelect = (userId: string): void => {
    setSelectedUserId(userId);
    onSelect?.(userId);
  };

  return (
    <section className="img3-panel">
      <header className="img3-panel__header">
        <h1>{t("title")}</h1>
        <p>{t("usersHeading")}</p>
      </header>

      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchPlaceholder")}
        className="img3-input"
      />

      {state === "loading" && <p>{t("loading")}</p>}
      {state === "error" && <p role="alert">{t("error")}</p>}
      {state === "ready" && filtered.length === 0 && <p>{t("empty")}</p>}

      {state === "ready" && filtered.length > 0 && (
        <ul className="img3-list">
          {filtered.map((user) => (
            <li
              key={user.id}
              className="img3-list__row"
              aria-selected={selectedUserId === user.id}
            >
              <div className="img3-list__main">
                <span className="img3-list__name">{user.name}</span>
                <span className="img3-list__email">{user.email}</span>
              </div>
              <span className="img3-list__meta">
                {user.targetRole ?? t("noTargetRole")}
              </span>
              <span
                className={
                  user.isComplete
                    ? "img3-badge img3-badge--complete"
                    : "img3-badge img3-badge--incomplete"
                }
              >
                {user.isComplete ? t("complete") : t("incomplete")}
              </span>
              <button
                type="button"
                className="img3-button"
                onClick={() => handleSelect(user.id)}
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
