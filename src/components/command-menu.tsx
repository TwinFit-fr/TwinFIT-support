"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  User,
  Dumbbell,
  FlaskConical,
  Layers,
  PlusCircle,
  BarChart3,
  Home,
  ArrowRight,
  X,
} from "lucide-react";
import { useStaffFetch } from "@/hooks/use-staff-fetch";

type CommandItem = {
  id: string;
  title: string;
  subtitle?: string;
  category: "Navigation" | "Quick Action" | "Search";
  icon: React.ReactNode;
  perform: () => void;
};

export function CommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const staffFetch = useStaffFetch();
  const [query, setQuery] = useState("");
  const [searchingUser, setSearchingUser] = useState(false);
  const [userResult, setUserResult] = useState<{ id: string; email: string } | null>(null);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  // Debounced lookup if query looks like email/handle
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || (!trimmed.includes("@") && trimmed.length < 3)) {
      setUserResult(null);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingUser(true);
      try {
        const res = (await staffFetch(
          `/api/support/lookup?q=${encodeURIComponent(trimmed)}`,
        )) as { user?: { id: string; email: string } };
        if (res?.user) {
          setUserResult(res.user);
        } else {
          setUserResult(null);
        }
      } catch {
        setUserResult(null);
      } finally {
        setSearchingUser(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, staffFetch]);

  const defaultItems: CommandItem[] = useMemo(
    () => [
      {
        id: "nav-home",
        title: "Dashboard Overview",
        subtitle: "Go to home summary",
        category: "Navigation",
        icon: <Home className="h-4 w-4 text-zinc-500" />,
        perform: () => router.push("/"),
      },
      {
        id: "nav-support",
        title: "User Support Lookup",
        subtitle: "Search accounts by email, handle, or ID",
        category: "Navigation",
        icon: <User className="h-4 w-4 text-zinc-500" />,
        perform: () => router.push("/support"),
      },
      {
        id: "nav-catalog",
        title: "Exercise Catalog",
        subtitle: "Browse and filter active exercises",
        category: "Navigation",
        icon: <Dumbbell className="h-4 w-4 text-zinc-500" />,
        perform: () => router.push("/catalog"),
      },
      {
        id: "action-new-exercise",
        title: "New Exercise",
        subtitle: "Compose and create a catalog exercise",
        category: "Quick Action",
        icon: <PlusCircle className="h-4 w-4 text-emerald-600" />,
        perform: () => router.push("/catalog/compose"),
      },
      {
        id: "nav-taxonomy",
        title: "Taxonomy & Lookups",
        subtitle: "Manage muscle groups, equipment, and movement types",
        category: "Navigation",
        icon: <Layers className="h-4 w-4 text-zinc-500" />,
        perform: () => router.push("/catalog/taxonomy"),
      },
      {
        id: "nav-lab-stats",
        title: "Lab Dataset Stats",
        subtitle: "View capture counts and metrics",
        category: "Navigation",
        icon: <BarChart3 className="h-4 w-4 text-zinc-500" />,
        perform: () => router.push("/lab"),
      },
      {
        id: "nav-lab-exercises",
        title: "Lab Exercise Pool",
        subtitle: "Manage linked exercises for Lab collection",
        category: "Navigation",
        icon: <FlaskConical className="h-4 w-4 text-zinc-500" />,
        perform: () => router.push("/lab/exercises"),
      },
      {
        id: "nav-lab-sets",
        title: "Lab Sets Browser",
        subtitle: "Filter, view sensor plots and download files",
        category: "Navigation",
        icon: <Layers className="h-4 w-4 text-zinc-500" />,
        perform: () => router.push("/lab/sets"),
      },
    ],
    [router],
  );

  const filteredItems = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return defaultItems;
    return defaultItems.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.subtitle?.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q),
    );
  }, [query, defaultItems]);

  if (!open) return null;

  const handleSelect = (item: CommandItem) => {
    onOpenChange(false);
    setQuery("");
    item.perform();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh] px-4 backdrop-blur-xs animate-in fade-in"
      onClick={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-xl rounded-xl border border-zinc-200 bg-white shadow-2xl overflow-hidden flex flex-col max-h-[70vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-zinc-200 px-4 py-3 gap-3">
          <Search className="h-5 w-5 text-zinc-400 shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Type a command or search user (@handle, email, uuid)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400 text-zinc-900"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-zinc-400 hover:text-zinc-600 p-1"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500">
            ESC
          </kbd>
        </div>

        <div className="overflow-y-auto p-2 divide-y divide-zinc-100">
          {/* User search result match if detected */}
          {userResult && (
            <div className="pb-2">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                User Match
              </div>
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  setQuery("");
                  router.push(`/support/${userResult.id}`);
                }}
                className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left text-sm hover:bg-zinc-100 transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-medium text-xs">
                    {userResult.email.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-zinc-900">{userResult.email}</p>
                    <p className="text-xs text-zinc-500 font-mono">ID: {userResult.id}</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-700 transition-colors" />
              </button>
            </div>
          )}

          {searchingUser && (
            <div className="px-3 py-2 text-xs text-zinc-400 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              Checking user accounts...
            </div>
          )}

          <div className="space-y-1 pt-1">
            {filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item)}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-left text-sm hover:bg-zinc-100 transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-1.5 rounded-md bg-zinc-100 group-hover:bg-white transition-colors">
                    {item.icon}
                  </div>
                  <div>
                    <p className="font-medium text-zinc-900">{item.title}</p>
                    {item.subtitle && (
                      <p className="text-xs text-zinc-500">{item.subtitle}</p>
                    )}
                  </div>
                </div>
                <span className="text-[11px] text-zinc-400 group-hover:text-zinc-600">
                  {item.category}
                </span>
              </button>
            ))}

            {filteredItems.length === 0 && !userResult && !searchingUser && (
              <div className="py-8 text-center text-sm text-zinc-500">
                No matching commands or pages found for &quot;{query}&quot;.
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-zinc-100 px-4 py-2 bg-zinc-50 flex items-center justify-between text-xs text-zinc-500">
          <div className="flex items-center gap-2">
            <span>Navigation:</span>
            <kbd className="rounded border border-zinc-200 bg-white px-1 font-mono text-[10px]">
              ↑
            </kbd>
            <kbd className="rounded border border-zinc-200 bg-white px-1 font-mono text-[10px]">
              ↓
            </kbd>
            <kbd className="rounded border border-zinc-200 bg-white px-1 font-mono text-[10px]">
              ↵
            </kbd>
          </div>
          <span>Quick actions & support lookup</span>
        </div>
      </div>
    </div>
  );
}
