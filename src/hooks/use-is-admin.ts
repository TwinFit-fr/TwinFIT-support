"use client";

import { useHasuraClaims } from "@nhost/react";
import { hasAdminRole } from "@/lib/nhost/jwt";
import { useAccessToken } from "@nhost/react";

export function useIsAdmin(): boolean {
  const claims = useHasuraClaims();
  const accessToken = useAccessToken();

  const rolesFromClaims = claims?.["x-hasura-allowed-roles"];
  if (Array.isArray(rolesFromClaims)) {
    return rolesFromClaims.includes("admin");
  }

  return hasAdminRole(accessToken);
}
