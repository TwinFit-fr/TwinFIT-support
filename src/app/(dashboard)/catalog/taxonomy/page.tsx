"use client";

import { useState } from "react";
import { TaxonomyAnatomyPanel } from "@/components/catalog/taxonomy/taxonomy-anatomy-panel";
import { TaxonomyLookupTable } from "@/components/catalog/taxonomy/taxonomy-lookup-table";
import { TaxonomySubnav } from "@/components/catalog/taxonomy/taxonomy-subnav";
import type { LookupRowFull, TaxonomyData, TaxonomyTabId } from "@/components/catalog/taxonomy/types";
import { CATALOG_LOCALES, type CatalogLocale } from "@/lib/catalog/locales";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";

const LOOKUP_TABLES: TaxonomyTabId[] = [
  "catalog_movement_types",
  "catalog_equipment",
  "catalog_support_equipment",
  "catalog_variations",
  "catalog_positions",
  "catalog_grips",
  "catalog_load_modalities",
  "catalog_logging_modes",
  "catalog_muscles",
  "catalog_muscle_groups",
];

export default function CatalogTaxonomyPage() {
  const staffFetch = useStaffFetch();
  const [tab, setTab] = useState<TaxonomyTabId>("anatomy");
  const {
    data: response,
    error: loadError,
    isLoading: loading,
    mutate,
  } = useStaffSWR<{ data: TaxonomyData }>("/api/catalog/taxonomy");
  const data = response?.data ?? null;
  const [message, setMessage] = useState<string | null>(null);
  const [locale, setLocale] = useState<CatalogLocale>("en");
  const shownMessage =
    message ?? (loadError ? loadError.message || "Failed to load taxonomy" : null);

  async function load() {
    await mutate();
  }

  async function addEntry(
    table: string,
    code: string,
    name: string,
    labels?: Record<CatalogLocale, string>,
  ) {
    setMessage(null);
    try {
      await staffFetch("/api/catalog/taxonomy", {
        method: "POST",
        body: JSON.stringify({
          table,
          code,
          name,
          ...(labels ? { labels } : {}),
        }),
      });
      setMessage(`Added ${code}`);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Add entry failed");
    }
  }

  async function saveRow(
    table: string,
    id: string,
    fields: {
      name: string;
      sort_order: number;
      active: boolean;
      labels?: Record<CatalogLocale, string>;
    },
  ) {
    setMessage(null);
    try {
      await staffFetch("/api/catalog/taxonomy", {
        method: "POST",
        body: JSON.stringify({
          kind: "update",
          table,
          id,
          name: fields.name,
          sort_order: fields.sort_order,
          active: fields.active,
          ...(fields.labels ? { labels: fields.labels } : {}),
        }),
      });
      setMessage("Saved");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function postRelation(
    muscleGroupCode: string,
    relationKind: "muscle" | "movement",
    code: string,
    action: "link" | "unlink",
    role?: string,
  ) {
    setMessage(null);
    try {
      await staffFetch("/api/catalog/taxonomy", {
        method: "POST",
        body: JSON.stringify({
          kind: "relation",
          relationKind,
          action,
          muscle_group_code: muscleGroupCode,
          code,
          ...(action === "link" && relationKind === "muscle" ? { role: role || "target" } : {}),
        }),
      });
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Relation update failed");
    }
  }

  async function applyRelations(
    muscleGroupCode: string,
    relationKind: "muscle" | "movement",
    items: Array<{ code: string; linked: boolean; currentRole?: string }>,
    linkRole?: string,
  ) {
    setMessage(null);
    try {
      for (const item of items) {
        if (!item.linked) {
          await postRelation(muscleGroupCode, relationKind, item.code, "link", linkRole);
        } else if (
          relationKind === "muscle" &&
          item.currentRole &&
          item.currentRole !== linkRole
        ) {
          await postRelation(muscleGroupCode, relationKind, item.code, "link", linkRole);
        } else {
          await postRelation(muscleGroupCode, relationKind, item.code, "unlink");
        }
      }
      setMessage("Saved");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    }
  }

  const lookupRows: LookupRowFull[] =
    data && LOOKUP_TABLES.includes(tab)
      ? (data[tab as keyof TaxonomyData] as LookupRowFull[])
      : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Taxonomy</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Add entry creates a new lookup code. In Anatomy, select pool items and click Save
          (or Cancel to clear selection). Use table tabs to edit names and sort order.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <TaxonomySubnav active={tab} onChange={setTab} />
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium text-zinc-700">Labels</span>
          <select
            className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
            value={locale}
            onChange={(e) => setLocale(e.target.value as CatalogLocale)}
          >
            {CATALOG_LOCALES.map((loc) => (
              <option key={loc} value={loc}>
                {loc.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && <p className="text-sm text-zinc-500">Loading taxonomy…</p>}
      {shownMessage && <p className="text-sm text-zinc-700">{shownMessage}</p>}

      {data && tab === "anatomy" && (
        <TaxonomyAnatomyPanel
          locale={locale}
          groups={data.catalog_muscle_groups}
          muscles={data.catalog_muscles}
          movements={data.catalog_movement_types}
          onAddGroup={(code) =>
            addEntry("catalog_muscle_groups", code, "")
          }
          onApplyRelations={applyRelations}
          onAddPoolEntry={async (kind, code) => {
            const table =
              kind === "muscle" ? "catalog_muscles" : "catalog_movement_types";
            await addEntry(table, code, "");
          }}
        />
      )}

      {data && LOOKUP_TABLES.includes(tab) && (
        <TaxonomyLookupTable
          table={tab}
          rows={lookupRows}
          onAdd={(code, name, labels) => addEntry(tab, code, name, labels)}
          onSave={(id, fields) => saveRow(tab, id, fields)}
        />
      )}
    </div>
  );
}
