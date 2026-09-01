"use client";

import { useCallback, useEffect, useState } from "react";
import { TaxonomyAnatomyPanel } from "@/components/catalog/taxonomy/taxonomy-anatomy-panel";
import { TaxonomyLookupTable } from "@/components/catalog/taxonomy/taxonomy-lookup-table";
import { TaxonomySubnav } from "@/components/catalog/taxonomy/taxonomy-subnav";
import type { LookupRowFull, TaxonomyData, TaxonomyTabId } from "@/components/catalog/taxonomy/types";
import { useStaffFetch } from "@/hooks/use-staff-fetch";

const LOOKUP_TABLES: TaxonomyTabId[] = [
  "catalog_movement_types",
  "catalog_equipment",
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
  const [data, setData] = useState<TaxonomyData | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = (await staffFetch("/api/catalog/taxonomy")) as { data: TaxonomyData };
      setData(res.data);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load taxonomy");
    } finally {
      setLoading(false);
    }
  }, [staffFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addEntry(table: string, code: string, name: string) {
    setMessage(null);
    try {
      await staffFetch("/api/catalog/taxonomy", {
        method: "POST",
        body: JSON.stringify({ table, code, name }),
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
    fields: { name: string; sort_order: number; active: boolean },
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

      <TaxonomySubnav active={tab} onChange={setTab} />

      {loading && <p className="text-sm text-zinc-500">Loading taxonomy…</p>}
      {message && <p className="text-sm text-zinc-700">{message}</p>}

      {data && tab === "anatomy" && (
        <TaxonomyAnatomyPanel
          groups={data.catalog_muscle_groups}
          muscles={data.catalog_muscles}
          movements={data.catalog_movement_types}
          onAddGroup={(code) =>
            addEntry("catalog_muscle_groups", code, code.replace(/_/g, " "))
          }
          onApplyRelations={applyRelations}
          onAddPoolEntry={async (kind, code) => {
            const table =
              kind === "muscle" ? "catalog_muscles" : "catalog_movement_types";
            await addEntry(table, code, code.replace(/_/g, " "));
          }}
        />
      )}

      {data && LOOKUP_TABLES.includes(tab) && (
        <TaxonomyLookupTable
          table={tab}
          rows={lookupRows}
          onAdd={(code, name) => addEntry(tab, code, name)}
          onSave={(id, fields) => saveRow(tab, id, fields)}
        />
      )}
    </div>
  );
}
