"use client";

import { useAuthenticationStatus, useSignOut } from "@nhost/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useIsStaff } from "@/hooks/use-is-staff";

export function StaffGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthenticationStatus();
  const isStaff = useIsStaff();
  const { signOut } = useSignOut();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (!isStaff) {
      void signOut();
      router.replace("/login?error=staff_required");
    }
  }, [isLoading, isAuthenticated, isStaff, router, signOut]);

  if (isLoading || !isAuthenticated || !isStaff) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
        Checking staff session…
      </div>
    );
  }

  return <>{children}</>;
}
