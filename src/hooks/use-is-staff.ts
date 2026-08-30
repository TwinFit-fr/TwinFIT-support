"use client";

import { useAccessToken } from "@nhost/react";
import { useMemo } from "react";
import { hasStaffRole, hasAdminRole } from "@/lib/nhost/jwt";

export function useIsStaff(): boolean {
  const accessToken = useAccessToken();
  return useMemo(() => hasStaffRole(accessToken), [accessToken]);
}

export function useIsAdmin(): boolean {
  const accessToken = useAccessToken();
  return useMemo(() => hasAdminRole(accessToken), [accessToken]);
}
