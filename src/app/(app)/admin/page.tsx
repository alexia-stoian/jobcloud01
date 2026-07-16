import { notFound } from "next/navigation";
import { getAdminUserIdOrNull } from "@/lib/auth/admin";
import { AppShellServer } from "@/components/layout/AppShellServer";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage(): Promise<React.ReactElement> {
  const adminUserId = await getAdminUserIdOrNull();
  if (!adminUserId) {
    notFound();
  }

  return (
    <AppShellServer>
      <main className="img3-stack">
        <AdminDashboard />
      </main>
    </AppShellServer>
  );
}
