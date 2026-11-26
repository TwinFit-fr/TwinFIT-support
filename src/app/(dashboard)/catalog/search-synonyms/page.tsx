"use client";

import { useState } from "react";
import { SearchSynonymsEditor } from "@/components/catalog/search-synonyms/search-synonyms-editor";
import { useToast } from "@/components/ui/toast";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import type { SearchSynonymRow, SearchSynonymsData } from "@/lib/catalog/search-synonyms";

/**
 * Catalog → Search synonyms: the words people type in the app and Coach search, per locale, and
 * the filter or exercise each one stands for (`catalog.search_synonyms`, backend 2.12.0).
 */
export default function CatalogSearchSynonymsPage() {
  const staffFetch = useStaffFetch();
  const toast = useToast();
  const [message, setMessage] = useState<string | null>(null);
  const { data: response, error, isLoading, mutate } = useStaffSWR<{ data: SearchSynonymsData }>(
    "/api/catalog/search-synonyms",
  );
  const data = response?.data ?? null;

  async function post(body: Record<string, unknown>) {
    return (await staffFetch("/api/catalog/search-synonyms", {
      method: "POST",
      body: JSON.stringify(body),
    })) as { added?: SearchSynonymRow[]; existing?: SearchSynonymRow[]; deleted?: number };
  }

  async function add(input: { locale: string; phrase: string; kind: string; codes: string[] }) {
    setMessage(null);
    try {
      const result = await post({ action: "add", ...input });
      const added = result.added?.length ?? 0;
      const existing = result.existing?.length ?? 0;
      setMessage(
        `"${input.phrase}" (${input.locale.toUpperCase()}): added ${added} row${added === 1 ? "" : "s"}` +
          (existing ? `, ${existing} already there` : ""),
      );
      await mutate();
      return true;
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not add the phrase");
      return false;
    }
  }

  async function remove(row: SearchSynonymRow) {
    setMessage(null);
    try {
      await post({ action: "delete", ...row });
      await mutate();
      toast.success(`Deleted "${row.phrase}" (${row.locale.toUpperCase()}) → ${row.kind} ${row.code}`, undefined, {
        label: "Undo",
        onClick: () => {
          void add({ locale: row.locale, phrase: row.phrase, kind: row.kind, codes: [row.code] });
        },
      });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not delete the row");
    }
  }

  const shownMessage = message ?? (error ? error.message || "Failed to load search synonyms" : null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Search synonyms</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Words people type when they search the catalog, per locale, and what each one stands for:
          another name of an exercise (an alias, read by the app and the Coach) or a filter (a muscle
          group, a muscle, equipment, a movement…, read by the Coach). A phrase can stand for several
          codes, e.g. &ldquo;legs&rdquo; for five muscle groups.
        </p>
      </div>
      {isLoading && !data && <p className="text-sm text-zinc-500">Loading search synonyms…</p>}
      {shownMessage && <p className="text-sm text-zinc-700">{shownMessage}</p>}
      {data && <SearchSynonymsEditor data={data} onAdd={add} onDelete={remove} />}
    </div>
  );
}
