"use client";

import { useMemo, useState } from "react";
import { Button, Card, Input } from "@/components/ui/primitives";
import type { LookupRowFull, TaxonomyTabId } from "./types";
import { TAXONOMY_TABS } from "./types";

type TaxonomyLookupTableProps = {
  table: TaxonomyTabId;
  rows: LookupRowFull[];
  onAdd: (code: string, name: string) => Promise<void>;
  onSave: (
    id: string,
    fields: { name: string; sort_order: number; active: boolean },
  ) => Promise<void>;
};

export function TaxonomyLookupTable({
  table,
  rows,
  onAdd,
  onSave,
}: TaxonomyLookupTableProps) {
  const [filter, setFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [drafts, setDrafts] = useState<
    Record<string, { name: string; sort_order: number; active: boolean }>
  >({});

  const meta = TAXONOMY_TABS.find((t) => t.id === table);
  const q = filter.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          !q ||
          r.code.toLowerCase().includes(q) ||
          (r.name || "").toLowerCase().includes(q),
      ),
    [rows, q],
  );

  function getDraft(row: LookupRowFull) {
    return drafts[row.id] ?? {
      name: row.name ?? "",
      sort_order: Number(row.sort_order) || 0,
      active: row.active !== false,
    };
  }

  function setDraft(
    id: string,
    patch: Partial<{ name: string; sort_order: number; active: boolean }>,
  ) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const current = getDraft(row);
    setDrafts((prev) => ({ ...prev, [id]: { ...current, ...patch } }));
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">{meta?.label ?? table}</h3>
          <p className="text-sm text-zinc-500">
            {filtered.length} / {rows.length} items
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-[200px]"
          />
          <Button type="button" variant="secondary" onClick={() => setShowAdd(true)}>
            + Add
          </Button>
        </div>
      </div>

      {showAdd && (
        <div className="mt-4 flex flex-wrap gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <Input placeholder="CODE" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
          <Input placeholder="Name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button
            type="button"
            onClick={() => {
              void onAdd(newCode, newName || newCode).then(() => {
                setNewCode("");
                setNewName("");
                setShowAdd(false);
              });
            }}
          >
            Add entry
          </Button>
          <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>
            Cancel
          </Button>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200">
            <tr>
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Sort</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const draft = getDraft(row);
              return (
                <tr
                  key={row.id}
                  className={`border-b border-zinc-100 ${row.active === false ? "text-zinc-400" : ""}`}
                >
                  <td className="px-3 py-2 font-mono">{row.code}</td>
                  <td className="px-3 py-2">
                    <Input
                      value={draft.name}
                      onChange={(e) => setDraft(row.id, { name: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-sm"
                      value={draft.sort_order}
                      onChange={(e) =>
                        setDraft(row.id, { sort_order: Number(e.target.value) || 0 })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.active}
                        onChange={(e) => setDraft(row.id, { active: e.target.checked })}
                      />
                      <span>{draft.active ? "On" : "Off"}</span>
                    </label>
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void onSave(row.id, draft)}
                    >
                      Save
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
