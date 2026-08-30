import { StaffGuard } from "@/components/staff-guard";
import { DashboardShell } from "@/components/dashboard-shell";

export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <StaffGuard>
      <DashboardShell>{children}</DashboardShell>
    </StaffGuard>
  );
}
