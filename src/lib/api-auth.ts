import { resolveSupportHasuraRole, supportRoleOf } from "./nhost/jwt.ts";
import {
  AccessTokenVerificationUnavailableError,
  InvalidAccessTokenError,
  verifyAccessToken,
} from "./nhost/verify-jwt.ts";
import { UPSTREAM_TIMEOUT_MS, nhostUrl } from "./nhost/urls.ts";

export function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}

/** A caller whose access token was verified (signature, `exp`, issuer) and holds a Support role. */
export type SupportAuth = {
  token: string;
  userId: string;
  /** admin > staff: an account holding both is admin. */
  role: "admin" | "staff";
};

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Verifies the request's bearer token and its Support role. Throws a Response (401 missing,
 * forged or expired token; 403 no staff/admin role; 503 keys unavailable) that the route's catch
 * returns as is.
 */
export async function requireStaffAuth(request: Request): Promise<SupportAuth> {
  const token = getBearerToken(request);
  if (!token) throw jsonError("Unauthorized", 401);

  let verified;
  try {
    verified = await verifyAccessToken(token);
  } catch (error) {
    if (error instanceof InvalidAccessTokenError) throw jsonError(error.message, 401);
    if (error instanceof AccessTokenVerificationUnavailableError) {
      throw jsonError("Token verification unavailable", 503);
    }
    throw error;
  }

  const role = supportRoleOf(verified.roles);
  if (!role) throw jsonError("Staff role required", 403);
  return { token, userId: verified.userId, role };
}

/** {@link requireStaffAuth}, admin only. */
export async function requireAdminAuth(request: Request): Promise<SupportAuth> {
  const auth = await requireStaffAuth(request);
  if (auth.role !== "admin") throw jsonError("Admin role required", 403);
  return auth;
}

/** The verified access token of a staff or admin caller (see {@link requireStaffAuth}). */
export async function requireStaffToken(request: Request): Promise<string> {
  return (await requireStaffAuth(request)).token;
}

/** The verified access token of an admin caller (see {@link requireAdminAuth}). */
export async function requireAdminToken(request: Request): Promise<string> {
  return (await requireAdminAuth(request)).token;
}

export async function callStaffFunction(
  accessToken: string,
  name: string,
  body: Record<string, unknown>,
  options: { timeoutMs?: number } = {},
): Promise<{ status: number; body: unknown }> {
  const url = `${nhostUrl("functions")}/${name}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      // The Functions authorize from the JWT's allowed roles; the role is named anyway, as on
      // every Support request, in case one forwards it to Hasura.
      "x-hasura-role": resolveSupportHasuraRole(accessToken),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? UPSTREAM_TIMEOUT_MS),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  return { status: res.status, body: parsed };
}
