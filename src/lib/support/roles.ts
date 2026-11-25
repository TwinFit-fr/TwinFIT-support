/**
 * Roles an admin grants or revokes from Support through the backend Function `admin-set-role`.
 * `admin` itself is not managed here (provisioned from the backend), and `user` / `me` are every
 * account's base roles.
 */
export const MANAGED_ROLES = ["lab", "staff"] as const;

export type ManagedRole = (typeof MANAGED_ROLES)[number];

export const MANAGED_ROLE_LABELS: Record<ManagedRole, { label: string; description: string }> = {
  lab: { label: "Lab", description: "TwinFIT Lab: records and reads lab sensor sets." },
  staff: { label: "Staff", description: "Support: user lookup, grants, catalog edits." },
};

export function isManagedRole(value: unknown): value is ManagedRole {
  return typeof value === "string" && (MANAGED_ROLES as readonly string[]).includes(value);
}

/** Every role an account holds: its default role and its `auth.user_roles` rows, without repeats. */
export function accountRoleNames(
  defaultRole: string | null | undefined,
  roles: readonly { role: string }[] = [],
): string[] {
  return Array.from(new Set([defaultRole, ...roles.map((r) => r.role)].filter(Boolean) as string[]));
}

/** Badge order: the roles that give the most access first. */
const ROLE_RANK: Record<string, number> = { admin: 0, staff: 1, lab: 2, user: 3, me: 4 };

export function sortRoleNames(roles: readonly string[]): string[] {
  return [...roles].sort(
    (a, b) => (ROLE_RANK[a] ?? 50) - (ROLE_RANK[b] ?? 50) || a.localeCompare(b),
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Body of `admin-set-role`, as Support sends it. */
export type SetRoleRequest = { userId: string; role: ManagedRole; granted: boolean };

/** Checks the `set-role` action body before it reaches the Function. */
export function parseSetRoleRequest(
  body: unknown,
): { ok: true; value: SetRoleRequest } | { ok: false; error: string } {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  if (!UUID_RE.test(userId)) return { ok: false, error: "userId must be an account UUID" };
  if (!isManagedRole(input.role)) {
    return { ok: false, error: `role must be one of: ${MANAGED_ROLES.join(", ")}` };
  }
  if (typeof input.granted !== "boolean") return { ok: false, error: "granted must be true or false" };
  return { ok: true, value: { userId, role: input.role, granted: input.granted } };
}

function functionError(body: unknown): string | null {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error: unknown }).error;
    if (typeof error === "string" && error.trim()) return error.trim();
  }
  return null;
}

/**
 * Staff words for a failed `admin-set-role` call. The backend answers its errors with
 * `{ success: false, error }`; a 404 without that shape means the Function itself is missing
 * (backend not deployed yet), not the account.
 */
export function setRoleErrorMessage(status: number, body: unknown): string {
  const detail = functionError(body);
  const fromBackend =
    !!body && typeof body === "object" && (body as { success?: unknown }).success === false;
  switch (status) {
    case 400:
      return `The backend refused the role change${detail ? `: ${detail}` : "."}`;
    case 401:
      return "Your session has expired. Sign in again.";
    case 403:
      return "Only an admin can change roles. Your session has no admin role.";
    case 404:
      return fromBackend
        ? "No account with this ID. It may have been deleted."
        : "Role changes are not available on this backend yet (admin-set-role is missing).";
    default:
      return `Role change failed (${status})${detail ? `: ${detail}` : ""}`;
  }
}

/** Success toast: the account only sees the change in its next access token. */
export function setRoleSuccessMessage(role: ManagedRole, granted: boolean, email: string): string {
  const label = MANAGED_ROLE_LABELS[role].label;
  return `${label} ${granted ? "granted to" : "revoked from"} ${email}. It applies at their next sign-in or token refresh.`;
}
