"use client";

import { useMemo, useState } from "react";
import { Button, Card, Input } from "@/components/ui/primitives";
import {
  resolveLocalizedName,
  type CatalogLocale,
  type LocalizedLookup,
} from "@/lib/catalog/locales";
import type { LookupRowFull, MuscleGroupRow } from "./types";

export type RelationApplyItem = {
  code: string;
  linked: boolean;
  currentRole?: string;
};

type AnatomyPanelProps = {
  locale: CatalogLocale;
  groups: MuscleGroupRow[];
  muscles: LookupRowFull[];
  onAddGroup: (code: string) => Promise<void>;
  onApplyRelations: (
    groupCode: string,
    kind: "muscle",
    items: RelationApplyItem[],
    linkRole?: string,
  ) => Promise<void>;
  onAddMuscle: (code: string) => Promise<void>;
};

type LinkedItem = {
  code: string;
  name: string;
  role: string;
};

export function TaxonomyAnatomyPanel({
  locale,
  groups,
  muscles,
  onAddGroup,
  onApplyRelations,
  onAddMuscle,
}: AnatomyPanelProps) {
  const [groupCode, setGroupCode] = useState(groups[0]?.code ?? "");
  const [linkRole, setLinkRole] = useState<"target" | "secondary">("target");
  const [poolFilter, setPoolFilter] = useState("");
  const [newGroupCode, setNewGroupCode] = useState("");
  const [newItemCode, setNewItemCode] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showNewItem, setShowNewItem] = useState(false);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);

  const group = groups.find((g) => g.code === groupCode) ?? null;

  const linked = useMemo((): LinkedItem[] => {
    if (!group) return [];
    return group.group_muscles
      .map((x) => ({
        code: x.muscle.code,
        name: resolveLocalizedName(x.muscle as LocalizedLookup, locale),
        role: x.role === "target" ? "target" : "secondary",
      }))
      .sort((a, b) => {
        if (a.role !== b.role) return a.role === "target" ? -1 : 1;
        return a.code.localeCompare(b.code);
      });
  }, [group, locale]);

  const linkedCodes = new Set(linked.map((x) => x.code));
  const q = poolFilter.trim().toLowerCase();
  const pool = muscles
    .filter((x) => x.active !== false)
    .filter(
      (x) =>
        !q ||
        x.code.toLowerCase().includes(q) ||
        (x.name || "").toLowerCase().includes(q),
    )
    .sort((a, b) => {
      const al = linkedCodes.has(a.code) ? 0 : 1;
      const bl = linkedCodes.has(b.code) ? 0 : 1;
      if (al !== bl) return al - bl;
      return a.code.localeCompare(b.code);
    });

  function clearSelection() {
    setSelectedCodes(new Set());
  }

  function toggleSelected(code: string) {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function saveSelection() {
    if (!groupCode || selectedCodes.size === 0) return;
    setActionLoading(true);
    try {
      const items: RelationApplyItem[] = [...selectedCodes].map((code) => {
        const linkRow = linked.find((l) => l.code === code);
        return {
          code,
          linked: linkedCodes.has(code),
          currentRole: linkRow?.role,
        };
      });
      await onApplyRelations(groupCode, "muscle", items, linkRole);
      clearSelection();
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <Card className="p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium">Muscle groups</h3>
          <Button
            type="button"
            variant="secondary"
            className="text-xs"
            onClick={() => setShowNewGroup(true)}
          >
            + Group
          </Button>
        </div>
        {showNewGroup && (
          <div className="mt-2 space-y-2">
            <Input
              placeholder="CODE"
              value={newGroupCode}
              onChange={(e) => setNewGroupCode(e.target.value)}
            />
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                void onAddGroup(newGroupCode).then(() => {
                  setNewGroupCode("");
                  setShowNewGroup(false);
                  setGroupCode(newGroupCode.trim().toUpperCase());
                });
              }}
            >
              Add entry
            </Button>
          </div>
        )}
        <div className="mt-3 space-y-1">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setGroupCode(g.code);
                clearSelection();
              }}
              className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${
                g.code === groupCode ? "bg-zinc-100 font-medium" : "hover:bg-zinc-50"
              } ${g.active === false ? "text-zinc-400" : ""}`}
            >
              <span className="font-mono">{g.code}</span>
              <span className="ml-1 text-zinc-500">
                {resolveLocalizedName(g as LocalizedLookup, locale)}
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        {!group ? (
          <p className="text-sm text-zinc-500">Select a muscle group</p>
        ) : (
          <>
            <div>
              <h3 className="font-medium">{group.code}</h3>
              <p className="text-sm text-zinc-500">
                {resolveLocalizedName(group as LocalizedLookup, locale)} — link muscles
                (target / secondary). Group + movement pairs are under{" "}
                <span className="font-medium">Group movements</span>.
              </p>
            </div>

            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Linked muscles ({linked.length})
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {linked.length === 0 && (
                  <span className="text-sm text-zinc-500">None linked yet</span>
                )}
                {linked.map((item) => (
                  <span
                    key={item.code}
                    className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 text-sm ${
                      item.role === "target"
                        ? "border-blue-300 bg-blue-50"
                        : "border-zinc-300 bg-zinc-50"
                    }`}
                  >
                    <span className="font-mono">{item.code}</span>
                    <span className="text-xs text-zinc-500">{item.role}</span>
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Pool — select multiple, then Save or Cancel
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex gap-1">
                    <SegButton active={linkRole === "target"} onClick={() => setLinkRole("target")}>
                      As target
                    </SegButton>
                    <SegButton
                      active={linkRole === "secondary"}
                      onClick={() => setLinkRole("secondary")}
                    >
                      As secondary
                    </SegButton>
                  </div>
                  <Input
                    placeholder="Filter…"
                    value={poolFilter}
                    onChange={(e) => setPoolFilter(e.target.value)}
                    className="max-w-[180px]"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowNewItem(true)}
                  >
                    + New muscle
                  </Button>
                </div>
              </div>

              {showNewItem && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Input
                    placeholder="Code"
                    value={newItemCode}
                    onChange={(e) => setNewItemCode(e.target.value)}
                  />
                  <Button
                    type="button"
                    onClick={() => {
                      void onAddMuscle(newItemCode).then(() => {
                        setNewItemCode("");
                        setShowNewItem(false);
                      });
                    }}
                  >
                    Add entry
                  </Button>
                </div>
              )}

              <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {pool.map((item) => {
                  const isLinked = linkedCodes.has(item.code);
                  const linkRow = linked.find((l) => l.code === item.code);
                  const isSelected = selectedCodes.has(item.code);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleSelected(item.code)}
                      className={`rounded-lg border p-3 text-left ${
                        isSelected
                          ? "border-zinc-900 ring-2 ring-zinc-300"
                          : isLinked
                            ? linkRow?.role === "target"
                              ? "border-blue-300 bg-blue-50"
                              : "border-zinc-400 bg-zinc-50"
                            : "border-zinc-200 hover:border-zinc-400"
                      }`}
                    >
                      <span className="font-mono text-sm">{item.code}</span>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {resolveLocalizedName(item as LocalizedLookup, locale)}
                      </p>
                      {linkRow?.role && (
                        <span className="text-xs text-zinc-500">{linkRow.role}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  disabled={selectedCodes.size === 0 || actionLoading}
                  onClick={() => void saveSelection()}
                >
                  {actionLoading ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={selectedCodes.size === 0 || actionLoading}
                  onClick={clearSelection}
                >
                  Cancel
                </Button>
                {selectedCodes.size > 0 && (
                  <span className="text-sm text-zinc-500">{selectedCodes.size} selected</span>
                )}
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-sm ${
        active ? "bg-zinc-900 text-white" : "border border-zinc-300 hover:bg-zinc-50"
      }`}
    >
      {children}
    </button>
  );
}
