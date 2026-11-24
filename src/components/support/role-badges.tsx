import { Badge } from "@/components/ui/primitives";
import { supportRoleOf } from "@/lib/nhost/jwt";
import { accountRoleNames, sortRoleNames } from "@/lib/support/roles";
import type { SupportUserRole } from "@/lib/support/types";

function roleStyle(role: string) {
  switch (role) {
    case "admin":
      return "bg-red-50 text-red-700 border border-red-200";
    case "staff":
      return "bg-violet-50 text-violet-700 border border-violet-200";
    case "lab":
      return "bg-sky-50 text-sky-700 border border-sky-200";
    default:
      return "bg-zinc-100 text-zinc-700 border border-zinc-200";
  }
}

type RoleBadgesProps = {
  defaultRole?: string | null;
  roles?: SupportUserRole[];
  className?: string;
};

export function RoleBadges({ defaultRole, roles = [], className }: RoleBadgesProps) {
  const unique = sortRoleNames(accountRoleNames(defaultRole, roles));
  // admin > staff: an account holding both is admin everywhere in Support.
  const supportRole = supportRoleOf(unique);

  if (unique.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1.5 ${className ?? ""}`}>
      {unique.map((role) => {
        const covered = role === "staff" && supportRole === "admin";
        return (
          <Badge
            key={role}
            className={`${roleStyle(role)} ${covered ? "opacity-60" : ""}`}
            title={covered ? "Also admin: Support treats this account as admin" : undefined}
          >
            {role}
            {defaultRole === role ? " · default" : ""}
            {covered ? " · covered by admin" : ""}
          </Badge>
        );
      })}
    </div>
  );
}
