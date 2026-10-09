"use client";

import { useMemo, useState } from "react";
import { Button, Card, Input } from "@/components/ui/primitives";
import { useConfirm } from "@/components/ui/confirm";
import { resolveLocalizedName, type LocalizedLookup } from "@/lib/catalog/locales";
import type { LookupRowFull, MuscleGroupRow } from "./types";

type PairRow = {
  key: string;
  groupCode: string;
  groupName: string;
  movementCode: string;
  movementName: string;
};

type Props = {
  groups: MuscleGroupRow[];
  movements: LookupRowFull[];
  onLink: (groupCode: string, movementCode: string) => Promise<void>;
  onUnlink: (groupCode: string, movementCode: string) => Promise<void>;
};

function selectClass(extra = "") {
  return `rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm ${extra}`;
}

/** Which movement types each muscle group can use; pair names are on Catalog → Localizations. */
export function TaxonomyGroupMovementsPanel({ groups, movements, onLink, onUnlink }: Props) {
  const [filter, setFilter] = useState("");
  const confirm = useConfirm();
  const [groupFilter, setGroupFilter] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [linkGroup, setLinkGroup] = useState(groups[0]?.code ?? "");
  const [linkMovement, setLinkMovement] = useState("");
  const [linking, setLinking] = useState(false);

  const pairs = useMemo((): PairRow[] => {
    const rows: PairRow[] = [];
    for (const group of groups) {
      for (const x of group.group_movement_types) {
        rows.push({
          key: `${group.code}::${x.movement_type.code}`,
          groupCode: group.code,
          groupName: resolveLocalizedName(group as LocalizedLookup, "en"),
          movementCode: x.movement_type.code,
          movementName: resolveLocalizedName(x.movement_type as LocalizedLookup, "en"),
        });
      }
    }
    return rows.sort((a, b) => {
      const g = a.groupCode.localeCompare(b.groupCode);
      return g !== 0 ? g : a.movementCode.localeCompare(b.movementCode);
    });
  }, [groups]);

  const linkedForGroup = useMemo(() => {
    const set = new Set<string>();
    for (const p of pairs) {
      if (p.groupCode === linkGroup) set.add(p.movementCode);
    }
    return set;
  }, [pairs, linkGroup]);

  const availableMovements = useMemo(
    () =>
      movements
        .filter((m) => m.active !== false && !linkedForGroup.has(m.code))
        .sort((a, b) => a.code.localeCompare(b.code)),
    [movements, linkedForGroup],
  );

  const q = filter.trim().toLowerCase();
  const filtered = pairs.filter((p) => {
    if (groupFilter && p.groupCode !== groupFilter) return false;
    if (!q) return true;
    return (
      p.groupCode.toLowerCase().includes(q) ||
      p.movementCode.toLowerCase().includes(q) ||
      p.groupName.toLowerCase().includes(q) ||
      p.movementName.toLowerCase().includes(q)
    );
  });

  async function unlinkRow(row: PairRow) {
    const unlink = await confirm({
      title: `Unlink ${row.groupCode} + ${row.movementCode}?`,
      description: "Custom names for this pair will be removed.",
      confirmLabel: "Unlink",
      variant: "danger",
    });
    if (!unlink) return;
    setBusyKey(row.key);
    try {
      await onUnlink(row.groupCode, row.movementCode);
    } finally {
      setBusyKey(null);
    }
  }

  async function linkPair() {
    if (!linkGroup || !linkMovement) return;
    setLinking(true);
    try {
      await onLink(linkGroup, linkMovement);
      setLinkMovement("");
    } finally {
      setLinking(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Group movements</h2>
          <p className="text-xs text-zinc-500">
            Which movement types each muscle group can use. Pair names per language (e.g.
            Chest Press instead of Chest - Press) are on Catalog → Localizations.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-zinc-600">
            Group
            <select
              className={`${selectClass("mt-1 block min-w-[10rem]")}`}
              value={linkGroup}
              onChange={(e) => {
                setLinkGroup(e.target.value);
                setLinkMovement("");
              }}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.code}>
                  {g.code}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Movement
            <select
              className={`${selectClass("mt-1 block min-w-[12rem]")}`}
              value={linkMovement}
              onChange={(e) => setLinkMovement(e.target.value)}
            >
              <option value="">Select…</option>
              {availableMovements.map((m) => (
                <option key={m.id} value={m.code}>
                  {m.code} — {resolveLocalizedName(m as LocalizedLookup, "en")}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            disabled={!linkGroup || !linkMovement || linking}
            onClick={() => void linkPair()}
          >
            {linking ? "Linking…" : "Link"}
          </Button>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Filter group or movement…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-sm"
        />
        <select
          className={selectClass("min-w-[10rem]")}
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
        >
          <option value="">All groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.code}>
              {g.code}
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-500">
          {filtered.length} / {pairs.length} pairs
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Group</th>
              <th className="px-3 py-2 font-medium">Movement</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-zinc-500">
                  No group–movement pairs yet. Link one above.
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const busy = busyKey === row.key;
                return (
                  <tr key={row.key} className="border-b border-zinc-100 align-top">
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs">{row.groupCode}</div>
                      <div className="text-xs text-zinc-500">{row.groupName}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs">{row.movementCode}</div>
                      <div className="text-xs text-zinc-500">{row.movementName}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={busy}
                          className="h-8 px-2 text-xs"
                          onClick={() => void unlinkRow(row)}
                        >
                          Unlink
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
