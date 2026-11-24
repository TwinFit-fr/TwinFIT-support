import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { supportRoleOf } from "@/lib/nhost/jwt";
import {
  MANAGED_ROLES,
  MANAGED_ROLE_LABELS,
  accountRoleNames,
  type ManagedRole,
} from "@/lib/support/roles";
import type { SupportUserRole } from "@/lib/support/types";

type RoleManagerProps = {
  defaultRole: string | null;
  roles: SupportUserRole[];
  /** Only admins change roles; staff see them read-only. */
  canEdit: boolean;
  busy?: boolean;
  /** Set after a change made from this page: the account gets it with its next token. */
  lastChange?: { role: ManagedRole; granted: boolean } | null;
  onChange: (role: ManagedRole, granted: boolean) => void;
};

/** The roles an admin grants or revokes from Support (`admin-set-role`), with the account's Support access. */
export function RoleManager({
  defaultRole,
  roles,
  canEdit,
  busy = false,
  lastChange = null,
  onChange,
}: RoleManagerProps) {
  const held = accountRoleNames(defaultRole, roles);
  const supportRole = supportRoleOf(held);

  return (
    <div className="space-y-3 border-t border-zinc-100 pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-600">
          <ShieldCheck className="h-3.5 w-3.5" /> Roles
        </p>
        <p className="text-xs text-zinc-500">
          Support access:{" "}
          <span className="font-medium text-zinc-800">
            {supportRole === "admin" ? "Admin" : supportRole === "staff" ? "Staff" : "None"}
          </span>
          {supportRole === "admin" && held.includes("staff") ? " (admin takes precedence over staff)" : ""}
        </p>
      </div>

      <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
        {MANAGED_ROLES.map((role) => {
          const granted = held.includes(role);
          const { label, description } = MANAGED_ROLE_LABELS[role];
          return (
            <li key={role} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900">
                  {label}{" "}
                  <span
                    className={`ml-1 text-xs font-normal ${granted ? "text-emerald-700" : "text-zinc-500"}`}
                  >
                    {granted ? "Granted" : "Not granted"}
                  </span>
                </p>
                <p className="text-xs text-zinc-500">{description}</p>
              </div>
              {canEdit && (
                <Button
                  type="button"
                  variant={granted ? "danger" : "secondary"}
                  disabled={busy}
                  onClick={() => onChange(role, !granted)}
                >
                  {granted ? `Revoke ${label.toLowerCase()}` : `Grant ${label.toLowerCase()}`}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {lastChange ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {MANAGED_ROLE_LABELS[lastChange.role].label} {lastChange.granted ? "granted" : "revoked"}. The
          account gets the change at its next sign-in or token refresh; an open session keeps its
          current roles until then.
        </p>
      ) : (
        <p className="text-xs text-zinc-500">
          {canEdit
            ? "A change applies at the account's next sign-in or token refresh."
            : "Only an admin can grant or revoke roles."}
        </p>
      )}
    </div>
  );
}
