"use client";

import { useMemo, useState } from "react";
import { Button, Card, Input } from "@/components/ui/primitives";
import { CLOSED_LOOKUP_TABLES, NO_STAFF_INSERT_TABLES } from "@/lib/catalog/closed-lookups";
import { resolveLocalizedName } from "@/lib/catalog/locales";
import type { LookupRowFull, TaxonomyTabId } from "./types";
import {
  DESCRIBED_TAXONOMY_TABLES,
  LOCALIZED_TAXONOMY_TABLES,
  TAXONOMY_TABS,
} from "./types";

type DraftFields = {
  name: string;
  description: string;
  sort_order: number;
  active: boolean;
  body_region_code: string;
};

/** Fields only some tables have: a group's region. */
export type LookupExtraFields = {
  body_region_code?: string;
};

type TaxonomyLookupTableProps = {
  table: TaxonomyTabId;
  rows: LookupRowFull[];
  /** Body regions, for the region column of muscle groups. */
  regions: LookupRowFull[];
  onAdd: (code: string, name: string, extra?: LookupExtraFields) => Promise<void>;
  onSave: (
    id: string,
    fields: {
      /** Only tables without translations: a translated name is its English label. */
      name?: string;
      sort_order: number;
      /** Left out for closed lists (their codes are written in SQL and the app). */
      active?: boolean;
      description?: string | null;
    } & LookupExtraFields,
  ) => Promise<void>;
};

const TABLE_HINTS: Partial<Record<TaxonomyTabId, string>> = {
  catalog_equipment:
    "load implement (NONE = bodyweight); optional description feeds equipment image prompts",
  catalog_support_equipment:
    "station / auxiliary (not the load); optional description feeds image-generation prompts",
  catalog_grips: "optional description feeds image-generation prompts",
  catalog_muscles: "optional description feeds muscle-map mask prompts",
  catalog_muscle_groups:
    "every group belongs to one region; kind (major / accessory / cardio) is set by backend migration, a new group is accessory; optional description feeds muscle-map prompts",
  catalog_body_regions:
    "app catalog carousel; optional description feeds muscle-map prompts",
  catalog_movement_types:
    "the main joint action, always read with its group (pair); new codes are UPPER_SNAKE (no spaces or -); the description is its operational definition",
  catalog_strength_patterns:
    "Strength Focus Fit patterns; labels name the Focus Fit strength units in the app",
};

/** What the description of a row is for, as the field's placeholder. */
const DESCRIPTION_PLACEHOLDERS: Partial<Record<TaxonomyTabId, string>> = {
  catalog_movement_types: "Operational definition: which joint action, which exercises",
  catalog_strength_patterns: "What the pattern covers",
};

/** Kind of a muscle group, read-only (a migration sets it; see DATABASE_CONTRACT "Muscle group kinds"). */
const KIND_STYLES: Record<string, string> = {
  major: "border-blue-300 bg-blue-50 text-blue-800",
  accessory: "border-zinc-300 bg-zinc-50 text-zinc-700",
  cardio: "border-amber-300 bg-amber-50 text-amber-800",
};

export function GroupKindBadge({ kind }: { kind?: string | null }) {
  if (!kind) return null;
  return (
    <span
      title="Set by backend migration: major = dose group (Focus Fit, radar), accessory = set credits only, cardio = endurance minutes"
      className={`inline-block rounded border px-1.5 py-0.5 text-[11px] font-medium ${KIND_STYLES[kind] ?? KIND_STYLES.accessory}`}
    >
      {kind}
    </span>
  );
}

export function TaxonomyLookupTable({
  table,
  rows,
  regions,
  onAdd,
  onSave,
}: TaxonomyLookupTableProps) {
  const isLocalized = LOCALIZED_TAXONOMY_TABLES.has(table);
  const hasDescription = DESCRIBED_TAXONOMY_TABLES.has(table);
  const isClosed = CLOSED_LOOKUP_TABLES.has(table);
  /** Staff cannot add values (closed lists, grips, variations, positions: backend migrations). */
  const canAdd = !NO_STAFF_INSERT_TABLES.has(table);
  const hasRegion = table === "catalog_muscle_groups";
  const hasKind = table === "catalog_muscle_groups";
  const hasHome = table === "catalog_muscles";
  const isMovement = table === "catalog_movement_types";
  const [showInactive, setShowInactive] = useState(false);
  const inactiveCount = rows.filter((r) => r.active === false).length;
  const regionCodeOf = (id: string | undefined) => regions.find((r) => r.id === id)?.code ?? "";
  const [filter, setFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const emptyExtra = (): Required<LookupExtraFields> => ({
    body_region_code: "",
  });
  const [newExtra, setNewExtra] = useState<Required<LookupExtraFields>>(emptyExtra);
  const [drafts, setDrafts] = useState<Record<string, DraftFields>>({});

  const meta = TAXONOMY_TABS.find((t) => t.id === table);
  const q = filter.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (!showInactive && r.active === false) return false;
        if (!q) return true;
        if (r.code.toLowerCase().includes(q)) return true;
        if ((r.name || "").toLowerCase().includes(q)) return true;
        if ((r.description || "").toLowerCase().includes(q)) return true;
        return (r.localizations ?? []).some((loc) =>
          (loc.display_name || "").toLowerCase().includes(q),
        );
      }),
    [rows, q, showInactive],
  );

  function getDraft(row: LookupRowFull): DraftFields {
    return (
      drafts[row.id] ?? {
        // The canonical name is the English label (the row name when it has none).
        name: resolveLocalizedName(row, "en"),
        description: row.description ?? "",
        sort_order: Number(row.sort_order) || 0,
        active: row.active !== false,
        body_region_code: regionCodeOf(row.body_region_id),
      }
    );
  }

  function setDraft(id: string, patch: Partial<DraftFields>) {
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
            {TABLE_HINTS[table] && ` · ${TABLE_HINTS[table]}`}
            {isClosed && " · closed list: new values only by backend migration, always active"}
            {!isClosed && !canAdd && " · new values only by backend migration"}
            {" · a value in use cannot be deactivated"}
            {isLocalized && " · names in every language on Catalog → Localizations"}
            {hasDescription &&
              (DESCRIPTION_PLACEHOLDERS[table]
                ? " · description is staff only"
                : " · description is internal (image prompts)")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-[200px]"
          />
          {inactiveCount > 0 && (
            <label className="flex items-center gap-1 text-xs text-zinc-600">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Show inactive ({inactiveCount})
            </label>
          )}
          {canAdd && (
            <Button type="button" variant="secondary" onClick={() => setShowAdd(true)}>
              + Add
            </Button>
          )}
        </div>
      </div>

      {showAdd && canAdd && (
        <div className="mt-4 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <Input
            placeholder={isMovement ? "CODE (UPPER_SNAKE: upper case, digits, _)" : "CODE (upper case, digits, _; no spaces)"}
            value={newCode}
            onChange={(e) =>
              setNewCode(e.target.value.toUpperCase().replace(isMovement ? /[\s-]+/g : /\s+/g, "_"))
            }
          />
          {/* A translated entry gets a Title Case name from its code; edit it on Localizations. */}
          {!isLocalized && (
            <Input
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          )}
          {hasRegion && (
            <RegionSelect
              regions={regions}
              value={newExtra.body_region_code}
              onChange={(code) => setNewExtra({ ...newExtra, body_region_code: code })}
            />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={hasRegion && !newExtra.body_region_code}
              onClick={() => {
                // Empty name: the server derives a Title Case label from the code.
                void onAdd(newCode, isLocalized ? "" : newName.trim(), {
                  ...(hasRegion ? { body_region_code: newExtra.body_region_code } : {}),
                }).then(() => {
                  setNewCode("");
                  setNewName("");
                  setNewExtra(emptyExtra());
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
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200">
            <tr>
              <th className="px-3 py-2">Code</th>
              {!isLocalized && <th className="px-3 py-2">Name</th>}
              {hasRegion && <th className="px-3 py-2">Region</th>}
              {hasKind && <th className="px-3 py-2">Kind</th>}
              {hasHome && <th className="px-3 py-2">Home group</th>}
              {hasDescription && <th className="px-3 py-2">Description</th>}
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
                  <td className="px-3 py-2 font-mono align-top">{row.code}</td>
                  {!isLocalized && (
                    <td className="px-3 py-2 align-top">
                      <Input
                        value={draft.name}
                        onChange={(e) => setDraft(row.id, { name: e.target.value })}
                      />
                    </td>
                  )}
                  {hasRegion && (
                    <td className="px-3 py-2 align-top">
                      <RegionSelect
                        regions={regions}
                        value={draft.body_region_code}
                        onChange={(code) => setDraft(row.id, { body_region_code: code })}
                      />
                    </td>
                  )}
                  {hasKind && (
                    <td className="px-3 py-2 align-top">
                      <GroupKindBadge kind={row.kind} />
                    </td>
                  )}
                  {hasHome && (
                    <td className="px-3 py-2 align-top text-xs">
                      <span className="font-mono">{row.home_muscle_group?.code ?? "—"}</span>
                      {row.is_anatomical === false && (
                        <span className="block text-zinc-500" title="Not a muscle: kept out of the muscle map and the pickers">
                          not anatomical
                        </span>
                      )}
                    </td>
                  )}
                  {hasDescription && (
                    <td className="px-3 py-2 align-top">
                      <textarea
                        className="min-h-[4.5rem] w-72 rounded-md border border-zinc-300 px-2 py-1 text-sm"
                        value={draft.description}
                        placeholder={
                          DESCRIPTION_PLACEHOLDERS[table] ?? "Optional — how this looks for image prompts"
                        }
                        onChange={(e) => setDraft(row.id, { description: e.target.value })}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2 align-top">
                    <input
                      type="number"
                      className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-sm"
                      value={draft.sort_order}
                      onChange={(e) =>
                        setDraft(row.id, { sort_order: Number(e.target.value) || 0 })
                      }
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    {isClosed ? (
                      <span title="Closed list: changed only by a backend migration">
                        {draft.active ? "On" : "Off"}
                      </span>
                    ) : (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={draft.active}
                          onChange={(e) => setDraft(row.id, { active: e.target.checked })}
                        />
                        <span>{draft.active ? "On" : "Off"}</span>
                      </label>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        void onSave(row.id, {
                          name: isLocalized ? undefined : draft.name,
                          sort_order: draft.sort_order,
                          ...(isClosed ? {} : { active: draft.active }),
                          description: hasDescription ? draft.description : undefined,
                          ...(hasRegion ? { body_region_code: draft.body_region_code } : {}),
                        })
                      }
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

const selectClass = "rounded-md border border-zinc-300 px-2 py-1.5 text-sm";

/** A muscle group's body region (required: every group belongs to one). */
export function RegionSelect({
  regions,
  value,
  onChange,
}: {
  regions: LookupRowFull[];
  value: string;
  onChange: (code: string) => void;
}) {
  return (
    <select
      className={selectClass}
      value={value}
      aria-label="Body region"
      onChange={(e) => onChange(e.target.value)}
    >
      {!value && <option value="">Region…</option>}
      {regions.map((region) => (
        <option key={region.id} value={region.code}>
          {region.code}
        </option>
      ))}
    </select>
  );
}
