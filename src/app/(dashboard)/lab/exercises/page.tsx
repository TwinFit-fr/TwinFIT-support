"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import { labExerciseLabel, type LabExerciseRow } from "@/lib/lab/queries";

type CatalogCandidate = { exo_id: number; display_name: string };

export default function LabExercisesPage() {
  const staffFetch = useStaffFetch();
  const [exercises, setExercises] = useState<LabExerciseRow[]>([]);
  const [candidates, setCandidates] = useState<CatalogCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedExoId, setSelectedExoId] = useState<string>("");

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [exRes, candRes] = await Promise.all([
        staffFetch("/api/lab/exercises") as Promise<{ exercises: LabExerciseRow[] }>,
        staffFetch("/api/lab/exercises?candidates=1") as Promise<{ candidates: CatalogCandidate[] }>,
      ]);
      setExercises(exRes.exercises ?? []);
      setCandidates(candRes.candidates ?? []);
      if (!selectedExoId && candRes.candidates?.[0]) {
        setSelectedExoId(String(candRes.candidates[0].exo_id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffFetch]);

  async function linkCatalog() {
    if (!selectedExoId) return;
    await staffFetch("/api/lab/exercises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "link_catalog", catalog_exo_id: Number(selectedExoId) }),
    });
    await reload();
  }

  async function toggleActive(row: LabExerciseRow) {
    await staffFetch("/api/lab/exercises", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catalog_exo_id: row.catalog_exo_id, active: !row.active }),
    });
    await reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Lab exercises</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Add catalog exercises to the Lab dataset pool (e.g. exo 47 Resting for rest captures)
          </p>
        </div>
        <Link
          href="/lab"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
        >
          View stats
        </Link>
      </div>

      <Card className="space-y-3 p-4">
        <h2 className="font-medium">Link from catalog</h2>
        <p className="text-sm text-zinc-500">
          Create exercises in Catalog first, then add them to the Lab dataset here.
        </p>
        <select
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          value={selectedExoId}
          onChange={(e) => setSelectedExoId(e.target.value)}
        >
          {candidates.map((c) => (
            <option key={c.exo_id} value={c.exo_id}>
              {c.exo_id} — {c.display_name}
            </option>
          ))}
        </select>
        <Button onClick={() => void linkCatalog()} disabled={!candidates.length}>
          Add to Lab dataset
        </Button>
      </Card>

      {loading && <p className="text-sm text-zinc-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">exo_id</th>
              <th className="px-4 py-2 font-medium">Active</th>
              <th className="px-4 py-2 font-medium">Sets</th>
              <th className="px-4 py-2 font-medium">Sort</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {exercises.map((row) => (
              <tr key={row.catalog_exo_id} className="border-b border-zinc-100">
                <td className="px-4 py-2">{labExerciseLabel(row)}</td>
                <td className="px-4 py-2">{row.catalog_exo_id}</td>
                <td className="px-4 py-2">{row.active ? "yes" : "no"}</td>
                <td className="px-4 py-2">{row.sets_aggregate?.aggregate?.count ?? 0}</td>
                <td className="px-4 py-2">{row.sort_order}</td>
                <td className="px-4 py-2">
                  <Button variant="secondary" onClick={() => void toggleActive(row)}>
                    {row.active ? "Deactivate" : "Activate"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
