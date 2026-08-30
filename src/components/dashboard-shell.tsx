"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSignOut, useUserData } from "@nhost/react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  match?: "exact" | "prefix";
};

const topNav: NavItem[] = [
  { href: "/", label: "Home", match: "exact" },
  { href: "/support", label: "Support" },
  { href: "/catalog", label: "Catalog" },
  { href: "/lab", label: "Lab" },
];

const catalogSubNav: NavItem[] = [
  { href: "/catalog", label: "Exercises", match: "exact" },
  { href: "/catalog/compose", label: "New exercise" },
  { href: "/catalog/taxonomy", label: "Taxonomy" },
];

const labSubNav: NavItem[] = [
  { href: "/lab", label: "Stats", match: "exact" },
  { href: "/lab/exercises", label: "Exercises" },
  { href: "/lab/sets", label: "Sets" },
];

function navActive(pathname: string, item: NavItem): boolean {
  const match = item.match ?? (item.href === "/" ? "exact" : "prefix");
  if (match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLinks({ items, size = "md" }: { items: NavItem[]; size?: "sm" | "md" }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "rounded-md text-sm",
            size === "sm" ? "px-2.5 py-1" : "px-3 py-1.5",
            navActive(pathname, item)
              ? "bg-zinc-900 text-white"
              : "text-zinc-600 hover:bg-zinc-100",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const user = useUserData();
  const { signOut } = useSignOut();

  const subNav = pathname.startsWith("/catalog")
    ? catalogSubNav
    : pathname.startsWith("/lab")
      ? labSubNav
      : null;

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-lg font-semibold">TwinFIT Support</span>
            <NavLinks items={topNav} />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-zinc-500">{user?.email}</span>
            <button
              type="button"
              onClick={() => signOut()}
              className="rounded-md border border-zinc-300 px-3 py-1.5 hover:bg-zinc-50"
            >
              Sign out
            </button>
          </div>
        </div>
        {subNav && (
          <div className="border-t border-zinc-100">
            <div className="mx-auto max-w-7xl px-4 py-2">
              <NavLinks items={subNav} size="sm" />
            </div>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
