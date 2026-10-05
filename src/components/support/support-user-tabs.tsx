"use client";

export type SupportUserTabId =
  | "account"
  | "profile"
  | "sessions"
  | "templates"
  | "routines"
  | "custom";

export const SUPPORT_USER_TABS: Array<{ id: SupportUserTabId; label: string }> = [
  { id: "account", label: "Account" },
  { id: "profile", label: "Profile" },
  { id: "sessions", label: "Workouts" },
  { id: "templates", label: "Templates" },
  { id: "routines", label: "Routines" },
  { id: "custom", label: "Custom" },
];

type SupportUserTabsProps = {
  active: SupportUserTabId;
  onChange: (tab: SupportUserTabId) => void;
};

export function SupportUserTabs({ active, onChange }: SupportUserTabsProps) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-zinc-100 pb-3">
      {SUPPORT_USER_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
            active === tab.id
              ? "bg-zinc-900 text-white"
              : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
