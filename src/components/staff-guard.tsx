"use client";

import { useAccessToken, useAuthenticationStatus, useSignOut } from "@nhost/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useIsStaff } from "@/hooks/use-is-staff";

export function StaffGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthenticationStatus();
  const accessToken = useAccessToken();
  const isStaff = useIsStaff();
  const { signOut } = useSignOut();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    // Wait for the access token before deciding the user is not staff — otherwise a brief
    // null token after reload signs them out.
    if (!accessToken) return;
    if (!isStaff) {
      void signOut();
      router.replace("/login?error=staff_required");
    }
  }, [isLoading, isAuthenticated, accessToken, isStaff, router, signOut]);

  if (isLoading || !isAuthenticated || !accessToken || !isStaff) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
        Checking staff session…
      </div>
    );
  }

  return <>{children}</>;
}
