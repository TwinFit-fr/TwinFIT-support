"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  LocalizationTable,
  type LocalizationRowItem,
} from "@/components/catalog/localizations/localization-table";
import type { LookupRowFull, TaxonomyData, TaxonomyTabId } from "@/components/catalog/taxonomy/types";
import { LOCALIZED_TAXONOMY_TABLES, TAXONOMY_TABS } from "@/components/catalog/taxonomy/types";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import {
  CATALOG_LOCALES,
  emptyLocaleLabels,
  resolveLocalizedName,
  type CatalogLocale,
  type LocalizationRow,
  type LocalizedLookup,
} from "@/lib/catalog/locales";

type LookupTab = Exclude<TaxonomyTabId, "anatomy" | "group_movements">;
type LocalizationTabId = LookupTab | "group_movements";

/** Translated taxonomies, anatomy first; group movement pair names right after movements. */
const TAB_ORDER: LocalizationTabId[] = [
  "catalog_body_regions",
  "catalog_muscle_groups",
  "catalog_muscles",
  "catalog_movement_types",
  "group_movements",
  "catalog_equipment",
  "catalog_support_equipment",
  "catalog_load_modalities",
];

const TABS = TAB_ORDER.filter(
  (id) => id === "group_movements" || LOCALIZED_TAXONOMY_TABLES.has(id),
).map((id) => ({ id, label: TAXONOMY_TABS.find((t) => t.id === id)?.label ?? id }));

function labelsOf(rows: LocalizationRow[] | undefined): Record<CatalogLocale, string> {
  const labels = emptyLocaleLabels();
  for (const row of rows ?? []) {
    if (row.locale in labels && row.display_name) labels[row.locale as CatalogLocale] = row.display_name;
  }
  return labels;
}

/** A lookup entry: English is required (it is the canonical name); others fall back to it. */
function lookupRows(rows: LookupRowFull[]): LocalizationRowItem[] {
  return rows.map((row) => {
    const labels = labelsOf(row.localizations);
    const english = labels.en || row.name || row.code;
    return {
      key: row.id,
      code: row.code,
      inactive: row.active === false,
      labels: { ...labels, en: labels.en || english },
      placeholders: { en: "Required", es: english, fr: english },
    };
  });
}

/** A group + movement pair: every locale is optional and falls back to "Group - Movement". */
function pairRows(data: TaxonomyData): LocalizationRowItem[] {
  return data.catalog_muscle_groups
    .flatMap((group) =>
      group.group_movement_types.map((pair) => {
        const placeholders = emptyLocaleLabels();
        for (const loc of CATALOG_LOCALES) {
          placeholders[loc] = `${resolveLocalizedName(group as LocalizedLookup, loc)} - ${resolveLocalizedName(pair.movement_type as LocalizedLookup, loc)}`;
        }
        return {
          key: `${group.code}::${pair.movement_type.code}`,
          code: `${group.code} + ${pair.movement_type.code}`,
          context: placeholders.en,
          labels: labelsOf(pair.localizations),
          placeholders,
        };
      }),
    )
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Catalog translations: the labels of every translated taxonomy in each catalog language,
 * apart from Taxonomy (codes, structure and the English name).
 */
export default function CatalogLocalizationsPage() {
  const staffFetch = useStaffFetch();
  const [tab, setTab] = useState<LocalizationTabId>(TABS[0].id);
  const [message, setMessage] = useState<string | null>(null);
  const { data: response, error, isLoading, mutate } = useStaffSWR<{ data: TaxonomyData }>(
    "/api/catalog/taxonomy",
  );
  const data = response?.data ?? null;

  const rows = useMemo(() => {
    if (!data) return [];
    if (tab === "group_movements") return pairRows(data);
    return lookupRows(data[tab] as LookupRowFull[]);
  }, [data, tab]);

  async function save(row: LocalizationRowItem, labels: Record<CatalogLocale, string>) {
    setMessage(null);
    const body =
      tab === "group_movements"
        ? {
            kind: "group_movement_labels",
            muscle_group_code: row.key.split("::")[0],
            movement_type_code: row.key.split("::")[1],
            labels,
          }
        : { kind: "update", table: tab, id: row.key, labels };
    try {
      await staffFetch("/api/catalog/taxonomy", { method: "POST", body: JSON.stringify(body) });
      setMessage(`Saved ${row.code}`);
      await mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : `Could not save ${row.code}`);
      throw err;
    }
  }

  const label = TABS.find((t) => t.id === tab)?.label ?? tab;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Localizations</h1>
        <p className="mt-1 text-sm text-zinc-500">
          The catalog labels in every language. Codes, structure and English names live on{" "}
          <Link href="/catalog/taxonomy" className="underline">
            Catalog → Taxonomy
          </Link>
          ; the English label is the entry&apos;s name. An empty language falls back to English.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === t.id ? "bg-zinc-900 text-white" : "border border-zinc-300 hover:bg-zinc-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-zinc-500">Loading…</p>}
      {(message ?? error?.message) && (
        <p className="text-sm text-zinc-700">{message ?? error?.message}</p>
      )}

      {data && (
        <LocalizationTable
          // Drafts belong to one taxonomy.
          key={tab}
          title={label}
          hint={
            tab === "group_movements"
              ? "custom pair names (e.g. Chest Press); empty → Group - Movement"
              : "EN is the name; ES / FR fall back to it"
          }
          rows={rows}
          requiredLocales={tab === "group_movements" ? [] : ["en"]}
          onSave={save}
        />
      )}
    </div>
  );
}
