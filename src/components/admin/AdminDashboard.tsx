"use client";

import { useState } from "react";
import { AdminUsersList } from "@/components/admin/AdminUsersList";
import { AdminProfilePanel } from "@/components/admin/AdminProfilePanel";

/**
 * Admin dashboard shell. Owns the `selectedUserId` state: `AdminUsersList` on
 * the left/main, and — when a user is selected via its "Profile" button — the
 * `AdminProfilePanel` on the right. Passing a new `userId` while the panel is
 * open swaps its content (the panel re-fetches on `userId` change); closing it
 * clears the selection and stops polling.
 */
export function AdminDashboard(): React.ReactElement {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  return (
    <div className="admin">
      <AdminUsersList onSelect={setSelectedUserId} selectedUserId={selectedUserId} />
      {selectedUserId && (
        <>
          <div
            className="admin-scrim"
            role="button"
            tabIndex={-1}
            aria-label="Close profile"
            onClick={() => setSelectedUserId(null)}
          />
          <AdminProfilePanel
            key={selectedUserId}
            userId={selectedUserId}
            onClose={() => setSelectedUserId(null)}
          />
        </>
      )}
    </div>
  );
}
