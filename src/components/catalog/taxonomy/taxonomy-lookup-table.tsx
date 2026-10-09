"use client";

import { useMemo, useState } from "react";
import { Button, Card, Input } from "@/components/ui/primitives";
import {
  CATALOG_LOCALES,
  emptyLocaleLabels,
  resolveLocalizedName,
  type CatalogLocale,
} from "@/lib/catalog/locales";
import type { MuscleMapChoices } from "@/lib/images/types";
import { MapChoicesEditor, mapChoicesOf } from "./taxonomy-map-choices";
import type { LookupRowFull, TaxonomyTabId } from "./types";
import {
  DESCRIBED_TAXONOMY_TABLES,
  LOCALIZED_TAXONOMY_TABLES,
  MAP_CHOICE_TABLES,
  TAXONOMY_TABS,
} from "./types";

type DraftFields = {
  name: string;
  description: string;
  sort_order: number;
  active: boolean;
  labels: Record<CatalogLocale, string>;
  body_region_code: string;
  map: MuscleMapChoices;
};

/** Fields only some tables have: a group's region; the muscle maps of regions, groups, muscles. */
export type LookupExtraFields = {
  body_region_code?: string;
  map?: MuscleMapChoices;
};

type TaxonomyLookupTableProps = {
  table: TaxonomyTabId;
  rows: LookupRowFull[];
  /** Body regions, for the region column of muscle groups. */
  regions: LookupRowFull[];
  onAdd: (
    code: string,
    name: string,
    labels?: Record<CatalogLocale, string>,
    extra?: LookupExtraFields,
  ) => Promise<void>;
  onSave: (
    id: string,
    fields: {
      name: string;
      sort_order: number;
      active: boolean;
      description?: string | null;
      labels?: Record<CatalogLocale, string>;
    } & LookupExtraFields,
  ) => Promise<void>;
};

const TABLE_HINTS: Partial<Record<TaxonomyTabId, string>> = {
  catalog_equipment: "load implement (NONE = bodyweight)",
  catalog_support_equipment:
    "station / auxiliary (not the load); optional description feeds image-generation prompts",
  catalog_grips: "optional description feeds image-generation prompts",
  catalog_muscles:
    "maps: views × crops to draw, card map (inherit = home group's); optional description feeds muscle-map prompts",
  catalog_muscle_groups:
    "every group belongs to one region; maps: views × crops to draw, card map (inherit = region's); optional description feeds muscle-map prompts",
  catalog_body_regions:
    "app catalog carousel; maps: views × crops to draw and the card map; optional description feeds muscle-map prompts",
};

function labelsFromRow(row: LookupRowFull): Record<CatalogLocale, string> {
  const labels = emptyLocaleLabels();
  for (const loc of row.localizations ?? []) {
    const key = loc.locale as CatalogLocale;
    if (key in labels && loc.display_name) {
      labels[key] = loc.display_name;
    }
  }
  if (!labels.en) labels.en = row.name ?? row.code;
  return labels;
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
  const hasRegion = table === "catalog_muscle_groups";
  const hasMap = MAP_CHOICE_TABLES.has(table);
  // Groups and muscles may inherit the card map; a region has its own.
  const inheritable = table !== "catalog_body_regions";
  const regionCodeOf = (id: string | undefined) => regions.find((r) => r.id === id)?.code ?? "";
  const [filter, setFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newLabels, setNewLabels] = useState(emptyLocaleLabels());
  const emptyExtra = (): Required<LookupExtraFields> => ({
    body_region_code: "",
    map: mapChoicesOf({}, inheritable),
  });
  const [newExtra, setNewExtra] = useState<Required<LookupExtraFields>>(emptyExtra);
  const [drafts, setDrafts] = useState<Record<string, DraftFields>>({});

  const meta = TAXONOMY_TABS.find((t) => t.id === table);
  const q = filter.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (!q) return true;
        if (r.code.toLowerCase().includes(q)) return true;
        if ((r.name || "").toLowerCase().includes(q)) return true;
        if ((r.description || "").toLowerCase().includes(q)) return true;
        return (r.localizations ?? []).some((loc) =>
          (loc.display_name || "").toLowerCase().includes(q),
        );
      }),
    [rows, q],
  );

  function getDraft(row: LookupRowFull): DraftFields {
    const labels = labelsFromRow(row);
    return (
      drafts[row.id] ?? {
        name: labels.en,
        description: row.description ?? "",
        sort_order: Number(row.sort_order) || 0,
        active: row.active !== false,
        labels,
        body_region_code: regionCodeOf(row.body_region_id),
        map: mapChoicesOf(row, inheritable),
      }
    );
  }

  function setDraft(id: string, patch: Partial<DraftFields>) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const current = getDraft(row);
    setDrafts((prev) => ({ ...prev, [id]: { ...current, ...patch } }));
  }

  function setDraftLabel(id: string, locale: CatalogLocale, value: string) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const current = getDraft(row);
    const labels = { ...current.labels, [locale]: value };
    setDraft(id, {
      labels,
      name: locale === "en" ? value : current.name,
    });
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-medium">{meta?.label ?? table}</h3>
          <p className="text-sm text-zinc-500">
            {filtered.length} / {rows.length} items
            {TABLE_HINTS[table] && ` · ${TABLE_HINTS[table]}`}
            {isLocalized && " · edit EN / ES / FR labels"}
            {hasDescription && " · description is internal (image prompts)"}
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
        <div className="mt-4 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
          <Input placeholder="CODE" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
          {isLocalized ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {CATALOG_LOCALES.map((loc) => (
                <label key={loc} className="text-xs">
                  <span className="mb-1 block font-medium uppercase">{loc}</span>
                  <Input
                    placeholder={loc === "en" ? "Required" : "Optional"}
                    value={newLabels[loc]}
                    onChange={(e) =>
                      setNewLabels((prev) => ({ ...prev, [loc]: e.target.value }))
                    }
                  />
                </label>
              ))}
            </div>
          ) : (
            <Input
              placeholder="Name"
              value={newLabels.en}
              onChange={(e) => setNewLabels({ ...newLabels, en: e.target.value })}
            />
          )}
          {hasRegion && (
            <RegionSelect
              regions={regions}
              value={newExtra.body_region_code}
              onChange={(code) => setNewExtra({ ...newExtra, body_region_code: code })}
            />
          )}
          {hasMap && (
            <MapChoicesEditor
              value={newExtra.map}
              inheritable={inheritable}
              onChange={(map) => setNewExtra({ ...newExtra, map })}
            />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={hasRegion && !newExtra.body_region_code}
              onClick={() => {
                // Empty name: the server derives a Title Case label from the code.
                const enName = newLabels.en.trim();
                void onAdd(
                  newCode,
                  enName,
                  isLocalized ? { ...newLabels, en: enName } : undefined,
                  {
                    ...(hasRegion ? { body_region_code: newExtra.body_region_code } : {}),
                    ...(hasMap ? { map: newExtra.map } : {}),
                  },
                ).then(() => {
                  setNewCode("");
                  setNewLabels(emptyLocaleLabels());
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
              {isLocalized ? (
                CATALOG_LOCALES.map((loc) => (
                  <th key={loc} className="px-3 py-2 uppercase">
                    {loc}
                  </th>
                ))
              ) : (
                <th className="px-3 py-2">Name</th>
              )}
              {hasRegion && <th className="px-3 py-2">Region</th>}
              {hasMap && <th className="px-3 py-2">Muscle maps</th>}
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
                  {isLocalized ? (
                    CATALOG_LOCALES.map((loc) => (
                      <td key={loc} className="px-3 py-2 align-top">
                        <Input
                          value={draft.labels[loc]}
                          placeholder={resolveLocalizedName(row, loc)}
                          onChange={(e) => setDraftLabel(row.id, loc, e.target.value)}
                        />
                      </td>
                    ))
                  ) : (
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
                  {hasMap && (
                    <td className="px-3 py-2 align-top">
                      <MapChoicesEditor
                        value={draft.map}
                        inheritable={inheritable}
                        onChange={(map) => setDraft(row.id, { map })}
                      />
                    </td>
                  )}
                  {hasDescription && (
                    <td className="px-3 py-2 align-top">
                      <textarea
                        className="min-h-[4.5rem] w-72 rounded-md border border-zinc-300 px-2 py-1 text-sm"
                        value={draft.description}
                        placeholder="Optional — how this looks for image prompts"
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
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={draft.active}
                        onChange={(e) => setDraft(row.id, { active: e.target.checked })}
                      />
                      <span>{draft.active ? "On" : "Off"}</span>
                    </label>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        void onSave(row.id, {
                          name: draft.labels.en || draft.name,
                          sort_order: draft.sort_order,
                          active: draft.active,
                          description: hasDescription ? draft.description : undefined,
                          labels: isLocalized ? draft.labels : undefined,
                          ...(hasRegion ? { body_region_code: draft.body_region_code } : {}),
                          ...(hasMap ? { map: draft.map } : {}),
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
