"use client";

import { useAccessToken, useAuthenticationStatus, useSignOut } from "@nhost/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useIsStaff } from "@/hooks/use-is-staff";
import { loginUrl } from "@/lib/auth-next";

/** `fallback` replaces the default waiting text while the session is checked (the Studio shows its own dark frame). */
export function StaffGuard({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthenticationStatus();
  const accessToken = useAccessToken();
  const isStaff = useIsStaff();
  const { signOut } = useSignOut();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      // Back to this page after the sign-in (the Studio also gets the dark sign-in screen).
      router.replace(loginUrl(window.location.pathname + window.location.search));
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
    if (fallback) return <>{fallback}</>;
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
        Checking staff session…
      </div>
    );
  }

  return <>{children}</>;
}
