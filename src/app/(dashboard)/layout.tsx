import { AdminGuard } from "@/components/admin-guard";
import { DashboardShell } from "@/components/dashboard-shell";

export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminGuard>
      <DashboardShell>{children}</DashboardShell>
    </AdminGuard>
  );
}
