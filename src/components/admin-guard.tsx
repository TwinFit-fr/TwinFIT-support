"use client";

import { useAuthenticationStatus, useSignOut } from "@nhost/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useIsAdmin } from "@/hooks/use-is-admin";

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthenticationStatus();
  const isAdmin = useIsAdmin();
  const { signOut } = useSignOut();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
      return;
    }
    if (!isAdmin) {
      void signOut();
      router.replace("/login?error=admin_required");
    }
  }, [isLoading, isAuthenticated, isAdmin, router, signOut]);

  if (isLoading || !isAuthenticated || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
        Checking admin session…
      </div>
    );
  }

  return <>{children}</>;
}
