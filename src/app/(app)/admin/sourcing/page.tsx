import { notFound } from "next/navigation";
import { getAdminUserIdOrNull } from "@/lib/auth/admin";
import { AppShellServer } from "@/components/layout/AppShellServer";
import { SourcingPage } from "@/components/admin/SourcingPage";

export const dynamic = "force-dynamic";

export default async function AdminSourcingPage(): Promise<React.ReactElement> {
  const adminUserId = await getAdminUserIdOrNull();
  if (!adminUserId) {
    notFound();
  }

  return (
    <AppShellServer>
      <main className="img3-stack">
        <SourcingPage />
      </main>
    </AppShellServer>
  );
}
