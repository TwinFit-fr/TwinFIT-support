"use client";

import { useMemo, useState } from "react";
import { Button, Card, Input } from "@/components/ui/primitives";
import {
  CATALOG_LOCALES,
  emptyLocaleLabels,
  resolveLocalizedName,
  type CatalogLocale,
  type LocalizationRow,
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
  movements: LookupRowFull[];
  onAddGroup: (code: string) => Promise<void>;
  onApplyRelations: (
    groupCode: string,
    kind: "muscle" | "movement",
    items: RelationApplyItem[],
    linkRole?: string,
  ) => Promise<void>;
  onAddPoolEntry: (kind: "muscle" | "movement", code: string) => Promise<void>;
  onSaveGroupMovementLabels: (
    groupCode: string,
    movementCode: string,
    labels: Record<CatalogLocale, string>,
  ) => Promise<void>;
};

type LinkedItem = {
  code: string;
  name: string;
  role: string;
  /** Movements only: the pair's custom names and the composed fallback, per locale. */
  pairLabels?: Record<CatalogLocale, string>;
  composed?: Record<CatalogLocale, string>;
};

function labelsFromRows(rows: LocalizationRow[] | undefined): Record<CatalogLocale, string> {
  const labels = emptyLocaleLabels();
  for (const row of rows ?? []) {
    if (row.locale in labels && row.display_name) {
      labels[row.locale as CatalogLocale] = row.display_name;
    }
  }
  return labels;
}

export function TaxonomyAnatomyPanel({
  locale,
  groups,
  muscles,
  movements,
  onAddGroup,
  onApplyRelations,
  onAddPoolEntry,
  onSaveGroupMovementLabels,
}: AnatomyPanelProps) {
  const [groupCode, setGroupCode] = useState(groups[0]?.code ?? "");
  const [relationKind, setRelationKind] = useState<"muscle" | "movement">("muscle");
  const [linkRole, setLinkRole] = useState<"target" | "secondary">("target");
  const [poolFilter, setPoolFilter] = useState("");
  const [newGroupCode, setNewGroupCode] = useState("");
  const [newItemCode, setNewItemCode] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showNewItem, setShowNewItem] = useState(false);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [editingMovement, setEditingMovement] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState(emptyLocaleLabels);
  const [labelSaving, setLabelSaving] = useState(false);

  const group = groups.find((g) => g.code === groupCode) ?? null;

  const linked = useMemo((): LinkedItem[] => {
    if (!group) return [];
    if (relationKind === "muscle") {
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
    }
    return group.group_movement_types
      .map((x) => {
        const composed = emptyLocaleLabels();
        for (const loc of CATALOG_LOCALES) {
          composed[loc] = `${resolveLocalizedName(group as LocalizedLookup, loc)} - ${resolveLocalizedName(x.movement_type as LocalizedLookup, loc)}`;
        }
        return {
          code: x.movement_type.code,
          name: resolveLocalizedName(x.movement_type as LocalizedLookup, locale),
          role: "",
          pairLabels: labelsFromRows(x.localizations),
          composed,
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [group, relationKind, locale]);

  const linkedCodes = new Set(linked.map((x) => x.code));
  const q = poolFilter.trim().toLowerCase();
  const poolSource = relationKind === "muscle" ? muscles : movements;
  const pool = poolSource
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
    setEditingMovement(null);
  }

  function startEditing(item: LinkedItem) {
    setEditingMovement(item.code);
    setLabelDraft(item.pairLabels ?? emptyLocaleLabels());
  }

  async function saveLabels() {
    if (!groupCode || !editingMovement) return;
    setLabelSaving(true);
    try {
      await onSaveGroupMovementLabels(groupCode, editingMovement, labelDraft);
      setEditingMovement(null);
    } catch {
      // The page shows the error; keep the editor open with the draft.
    } finally {
      setLabelSaving(false);
    }
  }

  const editingItem = linked.find((item) => item.code === editingMovement) ?? null;

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
      await onApplyRelations(groupCode, relationKind, items, linkRole);
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-medium">{group.code}</h3>
                <p className="text-sm text-zinc-500">
                  {resolveLocalizedName(group as LocalizedLookup, locale)}
                </p>
              </div>
              <div className="flex gap-1">
                <SegButton
                  active={relationKind === "muscle"}
                  onClick={() => {
                    setRelationKind("muscle");
                    clearSelection();
                  }}
                >
                  Muscles
                </SegButton>
                <SegButton
                  active={relationKind === "movement"}
                  onClick={() => {
                    setRelationKind("movement");
                    clearSelection();
                  }}
                >
                  Movements
                </SegButton>
              </div>
            </div>

            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Linked ({linked.length})
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {linked.length === 0 && (
                  <span className="text-sm text-zinc-500">None linked yet</span>
                )}
                {linked.map((item) => {
                  // Custom pair name in this locale (falls back to EN), else the composed label.
                  const pairName = item.pairLabels?.[locale] || item.pairLabels?.en || "";
                  return (
                    <span
                      key={item.code}
                      className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 text-sm ${
                        item.role === "target"
                          ? "border-blue-300 bg-blue-50"
                          : editingMovement === item.code
                            ? "border-zinc-900 bg-white"
                            : "border-zinc-300 bg-zinc-50"
                      }`}
                    >
                      <span className="font-mono">{item.code}</span>
                      {item.role && <span className="text-xs text-zinc-500">{item.role}</span>}
                      {item.composed && (
                        <>
                          <span className={pairName ? "text-zinc-800" : "text-zinc-400"}>
                            {pairName || item.composed[locale]}
                          </span>
                          <button
                            type="button"
                            onClick={() => startEditing(item)}
                            className="text-xs text-zinc-500 underline hover:text-zinc-800"
                          >
                            Edit name
                          </button>
                        </>
                      )}
                    </span>
                  );
                })}
              </div>
              {editingItem?.composed && (
                <div className="mt-3 space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <div>
                    <p className="text-sm font-medium">
                      Name for {group.code} + {editingItem.code}
                    </p>
                    <p className="text-xs text-zinc-500">
                      Leave a language empty to show the composed name (e.g. &quot;
                      {editingItem.composed.en}&quot;).
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {CATALOG_LOCALES.map((loc) => (
                      <label key={loc} className="space-y-1 text-xs text-zinc-500">
                        <span className="font-medium uppercase">{loc}</span>
                        <Input
                          value={labelDraft[loc]}
                          placeholder={editingItem.composed?.[loc]}
                          onChange={(e) => setLabelDraft({ ...labelDraft, [loc]: e.target.value })}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" disabled={labelSaving} onClick={() => void saveLabels()}>
                      {labelSaving ? "Saving…" : "Save name"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={labelSaving}
                      onClick={() => setEditingMovement(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Pool — select multiple, then Save or Cancel
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {relationKind === "muscle" && (
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
                  )}
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
                    + New {relationKind === "muscle" ? "muscle" : "movement"}
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
                      void onAddPoolEntry(relationKind, newItemCode).then(() => {
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
                  <span className="text-sm text-zinc-500">
                    {selectedCodes.size} selected
                  </span>
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
