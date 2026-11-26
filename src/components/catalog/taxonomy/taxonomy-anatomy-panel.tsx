"use client";

import { useMemo, useState } from "react";
import { Button, Card, Input } from "@/components/ui/primitives";
import { resolveLocalizedName, type LocalizedLookup } from "@/lib/catalog/locales";
import { homeLinkBlocker } from "@/lib/catalog/pair-profiles";
import { GroupKindBadge, RegionSelect } from "./taxonomy-lookup-table";
import type { LookupRowFull, MuscleGroupRow } from "./types";

export type RelationApplyItem = {
  code: string;
  linked: boolean;
  currentRole?: string;
};

type AnatomyPanelProps = {
  groups: MuscleGroupRow[];
  muscles: LookupRowFull[];
  /** Body regions: a new group needs one. */
  regions: LookupRowFull[];
  onAddGroup: (code: string, regionCode: string) => Promise<void>;
  onApplyRelations: (
    groupCode: string,
    kind: "muscle",
    items: RelationApplyItem[],
    linkRole?: string,
  ) => Promise<void>;
  /** `homeGroupCode`: link the new muscle as target of that group (its home) in the same request. */
  onAddMuscle: (code: string, homeGroupCode?: string) => Promise<void>;
};

type LinkedItem = {
  code: string;
  name: string;
  role: string;
};

export function TaxonomyAnatomyPanel({
  groups,
  muscles,
  regions,
  onAddGroup,
  onApplyRelations,
  onAddMuscle,
}: AnatomyPanelProps) {
  const [groupCode, setGroupCode] = useState(groups[0]?.code ?? "");
  const [linkRole, setLinkRole] = useState<"target" | "secondary">("target");
  const [poolFilter, setPoolFilter] = useState("");
  const [newGroupCode, setNewGroupCode] = useState("");
  const [newGroupRegion, setNewGroupRegion] = useState("");
  const [newItemCode, setNewItemCode] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showNewItem, setShowNewItem] = useState(false);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [newItemHome, setNewItemHome] = useState(true);
  const [showInactiveGroups, setShowInactiveGroups] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  const group = groups.find((g) => g.code === groupCode) ?? null;
  const inactiveGroupCount = groups.filter((g) => g.active === false).length;
  const shownGroups = groups.filter(
    (g) => showInactiveGroups || g.active !== false || g.code === groupCode,
  );

  const linked = useMemo((): LinkedItem[] => {
    if (!group) return [];
    return group.group_muscles
      .map((x) => ({
        code: x.muscle.code,
        name: resolveLocalizedName(x.muscle as LocalizedLookup, "en"),
        role: x.role === "target" ? "target" : "secondary",
      }))
      .sort((a, b) => {
        if (a.role !== b.role) return a.role === "target" ? -1 : 1;
        return a.code.localeCompare(b.code);
      });
  }, [group]);

  const linkedCodes = new Set(linked.map((x) => x.code));
  /** Home group of each muscle (its role target row): linking it as target elsewhere moves it. */
  const homeOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) {
      for (const m of g.group_muscles) if (m.role === "target") map.set(m.muscle.code, g.code);
    }
    return map;
  }, [groups]);
  const q = poolFilter.trim().toLowerCase();
  const pool = muscles
    .filter((x) => x.active !== false)
    // Sentinels (CARDIOVASCULAR) are not muscles: listed only in the group they belong to.
    .filter((x) => x.is_anatomical !== false || linkedCodes.has(x.code))
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
    setBlocked(null);
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
    // A home row (role target here) is never removed nor turned secondary: the muscle would be
    // left without a home, which the database refuses at commit. It moves from another group.
    const reasons: string[] = [];
    const items: RelationApplyItem[] = [];
    for (const code of selectedCodes) {
      const linkRow = linked.find((l) => l.code === code);
      if (linkRow?.role === "target") {
        const blocker = homeLinkBlocker(
          { code, active: muscles.find((m) => m.code === code)?.active !== false, home: groupCode },
          groupCode,
          linkRole === "target" ? "unlink" : "secondary",
        );
        if (blocker) {
          reasons.push(blocker);
          continue;
        }
      }
      items.push({ code, linked: linkedCodes.has(code), currentRole: linkRow?.role });
    }
    setBlocked(reasons.length ? reasons.join(" · ") : null);
    if (!items.length) return;
    setActionLoading(true);
    try {
      await onApplyRelations(groupCode, "muscle", items, linkRole);
      setSelectedCodes(new Set());
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
            <RegionSelect regions={regions} value={newGroupRegion} onChange={setNewGroupRegion} />
            <Button
              type="button"
              className="w-full"
              disabled={!newGroupRegion}
              onClick={() => {
                void onAddGroup(newGroupCode, newGroupRegion).then(() => {
                  setNewGroupCode("");
                  setNewGroupRegion("");
                  setShowNewGroup(false);
                  setGroupCode(newGroupCode.trim().toUpperCase().replace(/\s+/g, "_"));
                });
              }}
            >
              Add entry
            </Button>
          </div>
        )}
        {inactiveGroupCount > 0 && (
          <label className="mt-2 flex items-center gap-1 text-xs text-zinc-500">
            <input
              type="checkbox"
              checked={showInactiveGroups}
              onChange={(e) => setShowInactiveGroups(e.target.checked)}
            />
            Show inactive ({inactiveGroupCount})
          </label>
        )}
        <div className="mt-3 space-y-1">
          {shownGroups.map((g) => (
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
                {resolveLocalizedName(g as LocalizedLookup, "en")}
              </span>
              {g.kind && g.kind !== "major" && (
                <span className="ml-1 text-[11px] text-zinc-400">{g.kind}</span>
              )}
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
              <h3 className="flex items-center gap-2 font-medium">
                {group.code} <GroupKindBadge kind={group.kind} />
              </h3>
              <p className="text-sm text-zinc-500">
                {resolveLocalizedName(group as LocalizedLookup, "en")} — link muscles
                (target / secondary). Group + movement pairs are under{" "}
                <span className="font-medium">Group movements</span>. A muscle has one home
                (target) group: linking it as target here moves it, which is refused while
                exercises, pairs or profiles of its current group target it. A home cannot be
                unlinked or made secondary: move the muscle from its new group, or deactivate it.
                Secondary rows are the group&apos;s picker rows: the muscles of another home its
                pairs, profiles and exercises use as secondaries (saving a pair or profile adds
                them).
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
                    <span className="text-xs text-zinc-500">
                      {item.role === "target" ? "target · home" : item.role}
                    </span>
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
                    placeholder="CODE (upper case, digits, _)"
                    value={newItemCode}
                    onChange={(e) => setNewItemCode(e.target.value.toUpperCase().replace(/\s+/g, "_"))}
                  />
                  <label className="flex items-center gap-1 text-xs text-zinc-600">
                    <input
                      type="checkbox"
                      checked={newItemHome}
                      onChange={(e) => setNewItemHome(e.target.checked)}
                    />
                    Home: {groupCode} (link as target)
                  </label>
                  <Button
                    type="button"
                    disabled={!newItemCode.trim()}
                    onClick={() => {
                      void onAddMuscle(newItemCode, newItemHome ? groupCode : undefined).then(() => {
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
                        {resolveLocalizedName(item as LocalizedLookup, "en")}
                      </p>
                      {linkRow?.role && (
                        <span className="text-xs text-zinc-500">{linkRow.role}</span>
                      )}
                      {homeOf.get(item.code) && homeOf.get(item.code) !== groupCode && (
                        <span className="block text-xs text-zinc-400">home: {homeOf.get(item.code)}</span>
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
              {blocked && <p className="mt-2 text-sm text-red-600">{blocked}</p>}
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
