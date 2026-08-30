"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Input } from "@/components/ui/primitives";
import { useStaffFetch } from "@/hooks/use-staff-fetch";

type CatalogExercise = {
  exo_id: number;
  display_name: string;
  taxonomy_status: string;
  primary_muscle_group?: { code: string };
  movement_type?: { code: string };
  equipment?: { code: string };
};

export default function CatalogPage() {
  const staffFetch = useStaffFetch();
  const [exercises, setExercises] = useState<CatalogExercise[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = (await staffFetch("/api/catalog/library")) as {
          data: { catalog_exercises: CatalogExercise[] };
        };
        setExercises(res.data.catalog_exercises ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load catalog");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [staffFetch]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return exercises;
    return exercises.filter(
      (ex) =>
        ex.display_name.toLowerCase().includes(q) ||
        String(ex.exo_id).includes(q) ||
        ex.primary_muscle_group?.code.toLowerCase().includes(q),
    );
  }, [exercises, filter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Exercise catalog</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {exercises.length} active system exercises
          </p>
        </div>
        <Link href="/catalog/compose">
          <Button>New exercise</Button>
        </Link>
      </div>

      <Card>
        <Input
          placeholder="Filter by name, exo_id, muscle group…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </Card>

      {loading && <p className="text-sm text-zinc-500">Loading catalog…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50">
            <tr>
              <th className="px-4 py-3">exo_id</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Group</th>
              <th className="px-4 py-3">Movement</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((ex) => (
              <tr key={ex.exo_id} className="border-b border-zinc-100">
                <td className="px-4 py-3 font-mono">{ex.exo_id}</td>
                <td className="px-4 py-3">{ex.display_name}</td>
                <td className="px-4 py-3">{ex.primary_muscle_group?.code ?? "—"}</td>
                <td className="px-4 py-3">{ex.movement_type?.code ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge>{ex.taxonomy_status}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/catalog/compose?exo_id=${ex.exo_id}`}
                    className="underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
