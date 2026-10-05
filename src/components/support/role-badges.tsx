import { Badge } from "@/components/ui/primitives";
import type { SupportUserRole } from "@/lib/support/types";

function roleStyle(role: string) {
  switch (role) {
    case "admin":
      return "bg-red-50 text-red-700 border border-red-200";
    case "staff":
      return "bg-violet-50 text-violet-700 border border-violet-200";
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
  const unique = Array.from(
    new Set([defaultRole, ...roles.map((r) => r.role)].filter(Boolean) as string[]),
  );

  if (unique.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1.5 ${className ?? ""}`}>
      {unique.map((role) => (
        <Badge key={role} className={roleStyle(role)}>
          {role}
          {defaultRole === role ? " · default" : ""}
        </Badge>
      ))}
    </div>
  );
}
