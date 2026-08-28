const HASURA_CLAIMS = "https://hasura.io/jwt/claims";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;

    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");

    const json =
      typeof globalThis.atob === "function"
        ? globalThis.atob(padded)
        : Buffer.from(part, "base64url").toString("utf8");

    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parseJwtRoles(accessToken: string): string[] {
  const payload = decodeJwtPayload(accessToken);
  if (!payload) return [];

  const claims = payload[HASURA_CLAIMS] as Record<string, unknown> | undefined;
  const raw = claims?.["x-hasura-allowed-roles"];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    if (raw.startsWith("[")) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {
        return raw.split(",").map((role) => role.trim()).filter(Boolean);
      }
    }
    return raw.split(",").map((role) => role.trim()).filter(Boolean);
  }
  return [];
}

export function hasAdminRole(accessToken: string | null | undefined): boolean {
  if (!accessToken) return false;
  return parseJwtRoles(accessToken).includes("admin");
}

export function parseJwtUserId(accessToken: string): string | null {
  const payload = decodeJwtPayload(accessToken);
  if (!payload) return null;
  const claims = payload[HASURA_CLAIMS] as Record<string, string> | undefined;
  return claims?.["x-hasura-user-id"] ?? (payload.sub as string) ?? null;
}

export function functionsBaseUrl(): string {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
  const region = process.env.NEXT_PUBLIC_NHOST_REGION;
  return `https://${subdomain}.functions.${region}.nhost.run/v1`;
}
