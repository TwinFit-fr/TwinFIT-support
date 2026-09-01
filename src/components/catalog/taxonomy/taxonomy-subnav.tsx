"use client";

import type { TaxonomyTabId } from "./types";
import { TAXONOMY_TABS } from "./types";

type TaxonomySubnavProps = {
  active: TaxonomyTabId;
  onChange: (tab: TaxonomyTabId) => void;
};

export function TaxonomySubnav({ active, onChange }: TaxonomySubnavProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {TAXONOMY_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`rounded-md px-3 py-1.5 text-sm ${
            active === tab.id
              ? "bg-zinc-900 text-white"
              : "border border-zinc-300 hover:bg-zinc-50"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
