import { hasAdminRole, hasStaffRole } from "@/lib/nhost/jwt";

export function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}

export function requireStaffToken(request: Request): string {
  const token = getBearerToken(request);
  if (!token) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  if (!hasStaffRole(token)) {
    throw new Response(JSON.stringify({ error: "Staff role required" }), {
      status: 403,
    });
  }
  return token;
}

export function requireAdminToken(request: Request): string {
  const token = getBearerToken(request);
  if (!token) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  if (!hasAdminRole(token)) {
    throw new Response(JSON.stringify({ error: "Admin role required" }), {
      status: 403,
    });
  }
  return token;
}

export async function callStaffFunction(
  accessToken: string,
  name: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
  const region = process.env.NEXT_PUBLIC_NHOST_REGION;
  const url = `https://${subdomain}.functions.${region}.nhost.run/v1/${name}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
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
