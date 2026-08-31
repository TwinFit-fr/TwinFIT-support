"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSignOut, useUserData } from "@nhost/react";
import { useState } from "react";
import { Search, Menu, X, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandMenu } from "@/components/command-menu";
import { ToastProvider } from "@/components/ui/toast";

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

function NavLinks({
  items,
  size = "md",
  onClick,
}: {
  items: NavItem[];
  size?: "sm" | "md";
  onClick?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onClick}
          className={cn(
            "rounded-md text-sm font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1" : "px-3 py-1.5",
            navActive(pathname, item)
              ? "bg-zinc-900 text-white"
              : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
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
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const subNav = pathname.startsWith("/catalog")
    ? catalogSubNav
    : pathname.startsWith("/lab")
      ? labSubNav
      : null;

  return (
    <ToastProvider>
      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />
      <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col">
        <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur-xs">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-4 sm:gap-6">
              <button
                type="button"
                className="md:hidden p-1.5 text-zinc-600 hover:bg-zinc-100 rounded-md"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>

              <Link href="/" className="flex items-center gap-2 font-bold text-base tracking-tight text-zinc-900">
                <span className="h-6 w-6 rounded bg-zinc-900 text-white flex items-center justify-center text-xs font-mono font-bold">
                  TF
                </span>
                TwinFIT Support
              </Link>

              <div className="hidden md:block">
                <NavLinks items={topNav} />
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setCommandOpen(true)}
                className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:border-zinc-300 transition-colors shadow-2xs cursor-pointer"
              >
                <Search className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Quick search…</span>
                <kbd className="inline-flex items-center rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] font-mono text-zinc-500 shadow-2xs">
                  ⌘K
                </kbd>
              </button>

              <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-500 pl-2 border-l border-zinc-200">
                <span className="max-w-[150px] truncate" title={user?.email}>
                  {user?.email}
                </span>
              </div>

              <button
                type="button"
                onClick={() => signOut()}
                className="rounded-md border border-zinc-200 p-1.5 sm:px-2.5 sm:py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          </div>

          {/* Mobile menu dropdown */}
          {mobileMenuOpen && (
            <div className="border-t border-zinc-200 bg-white px-4 py-3 md:hidden space-y-3 animate-in slide-in-from-top-2 duration-150">
              <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Menu
              </div>
              <NavLinks items={topNav} onClick={() => setMobileMenuOpen(false)} />
              {subNav && (
                <div className="pt-2 border-t border-zinc-100">
                  <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                    Section Links
                  </div>
                  <NavLinks items={subNav} size="sm" onClick={() => setMobileMenuOpen(false)} />
                </div>
              )}
              <div className="pt-2 border-t border-zinc-100 text-xs text-zinc-500">
                Signed in as: <strong className="text-zinc-800">{user?.email}</strong>
              </div>
            </div>
          )}

          {subNav && (
            <div className="hidden md:block border-t border-zinc-100 bg-zinc-50/50">
              <div className="mx-auto max-w-7xl px-4 py-1.5">
                <NavLinks items={subNav} size="sm" />
              </div>
            </div>
          )}
        </header>

        <main className="mx-auto max-w-7xl flex-1 w-full px-4 py-6">{children}</main>
      </div>
    </ToastProvider>
  );
}
