import { StaffGuard } from "@/components/staff-guard";
import { StudioBootSkeleton } from "@/components/studio/shell/boot-skeleton";
import { ConfirmProvider } from "@/components/ui/confirm";
import { ToastProvider } from "@/components/ui/toast";

export const dynamic = "force-dynamic";

/**
 * The 3D Studio lives outside the dashboard shell: a full-viewport dark workspace with its own
 * top bar (no page scroll, no max-width container). While the staff session is checked it shows
 * the same dark frame with skeletons, never a white page.
 */
export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <StaffGuard fallback={<StudioBootSkeleton />}>
      <ToastProvider>
        <ConfirmProvider>
          <div className="studio-root h-dvh w-screen overflow-hidden antialiased">{children}</div>
        </ConfirmProvider>
      </ToastProvider>
    </StaffGuard>
  );
}
