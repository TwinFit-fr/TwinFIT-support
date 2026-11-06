import { StaffGuard } from "@/components/staff-guard";
import { ConfirmProvider } from "@/components/ui/confirm";
import { ToastProvider } from "@/components/ui/toast";

export const dynamic = "force-dynamic";

/**
 * The 3D Studio lives outside the dashboard shell: a full-viewport dark workspace with its own
 * top bar (no page scroll, no max-width container).
 */
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <StaffGuard>
      <ToastProvider>
        <ConfirmProvider>
          <div className="studio-root h-dvh w-screen overflow-hidden antialiased">{children}</div>
        </ConfirmProvider>
      </ToastProvider>
    </StaffGuard>
  );
}
