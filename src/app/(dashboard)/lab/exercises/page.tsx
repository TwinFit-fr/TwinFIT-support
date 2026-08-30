"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card } from "@/components/ui/primitives";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import {
  labExerciseLabel,
  type CatalogCandidate,
  type LabExerciseRow,
} from "@/lib/lab/queries";

function candidateLabel(c: CatalogCandidate): string {
  const mg = c.primary_muscle_group?.name ?? c.primary_muscle_group?.code;
  const eq = c.equipment?.name ?? c.equipment?.code;
  const meta = [mg, eq].filter(Boolean).join(" · ");
  return meta ? `${c.exo_id} — ${c.display_name} (${meta})` : `${c.exo_id} — ${c.display_name}`;
}

function matchesNameFilter(c: CatalogCandidate, nameFilter: string): boolean {
  const nameQ = nameFilter.trim().toLowerCase();
  if (!nameQ) return true;
  const haystack = [
    c.display_name,
    String(c.exo_id),
    c.primary_muscle_group?.name,
    c.primary_muscle_group?.code,
    c.equipment?.name,
    c.equipment?.code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(nameQ);
}

function filterCandidates(
  candidates: CatalogCandidate[],
  filters: { nameFilter: string; muscleGroup?: string; equipment?: string },
): CatalogCandidate[] {
  return candidates.filter((c) => {
    if (!matchesNameFilter(c, filters.nameFilter)) return false;
    if (filters.muscleGroup && c.primary_muscle_group?.code !== filters.muscleGroup) {
      return false;
    }
    if (filters.equipment && c.equipment?.code !== filters.equipment) {
      return false;
    }
    return true;
  });
}

function collectMuscleGroupOptions(list: CatalogCandidate[]) {
  const byCode = new Map<string, string>();
  for (const c of list) {
    const code = c.primary_muscle_group?.code;
    if (!code) continue;
    byCode.set(code, c.primary_muscle_group?.name ?? code);
  }
  return [...byCode.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function collectEquipmentOptions(list: CatalogCandidate[]) {
  const byCode = new Map<string, string>();
  for (const c of list) {
    const code = c.equipment?.code;
    if (!code) continue;
    byCode.set(code, c.equipment?.name ?? code);
  }
  return [...byCode.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default function LabExercisesPage() {
  const staffFetch = useStaffFetch();
  const [exercises, setExercises] = useState<LabExerciseRow[]>([]);
  const [candidates, setCandidates] = useState<CatalogCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedExoId, setSelectedExoId] = useState<string>("");
  const [nameFilter, setNameFilter] = useState("");
  const [muscleGroupFilter, setMuscleGroupFilter] = useState("");
  const [equipmentFilter, setEquipmentFilter] = useState("");

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

  const muscleGroupOptions = useMemo(
    () =>
      collectMuscleGroupOptions(
        filterCandidates(candidates, {
          nameFilter,
          equipment: equipmentFilter || undefined,
        }),
      ),
    [candidates, nameFilter, equipmentFilter],
  );

  const equipmentOptions = useMemo(
    () =>
      collectEquipmentOptions(
        filterCandidates(candidates, {
          nameFilter,
          muscleGroup: muscleGroupFilter || undefined,
        }),
      ),
    [candidates, nameFilter, muscleGroupFilter],
  );

  const filteredCandidates = useMemo(
    () =>
      filterCandidates(candidates, {
        nameFilter,
        muscleGroup: muscleGroupFilter || undefined,
        equipment: equipmentFilter || undefined,
      }),
    [candidates, nameFilter, muscleGroupFilter, equipmentFilter],
  );

  useEffect(() => {
    if (
      muscleGroupFilter &&
      !muscleGroupOptions.some((g) => g.code === muscleGroupFilter)
    ) {
      setMuscleGroupFilter("");
    }
  }, [muscleGroupFilter, muscleGroupOptions]);

  useEffect(() => {
    if (equipmentFilter && !equipmentOptions.some((eq) => eq.code === equipmentFilter)) {
      setEquipmentFilter("");
    }
  }, [equipmentFilter, equipmentOptions]);

  useEffect(() => {
    if (!filteredCandidates.length) {
      setSelectedExoId("");
      return;
    }
    const stillVisible = filteredCandidates.some((c) => String(c.exo_id) === selectedExoId);
    if (!stillVisible) {
      setSelectedExoId(String(filteredCandidates[0].exo_id));
    }
  }, [filteredCandidates, selectedExoId]);

  async function linkCatalog() {
    if (!selectedExoId) return;
    await staffFetch("/api/lab/exercises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "link_catalog", catalog_exo_id: Number(selectedExoId) }),
    });
    setNameFilter("");
    setMuscleGroupFilter("");
    setEquipmentFilter("");
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

  const sortedExercises = useMemo(
    () => [...exercises].sort((a, b) => a.catalog_exo_id - b.catalog_exo_id),
    [exercises],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Lab exercises</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Add catalog exercises to the Lab dataset pool (e.g. exo 47 Resting for rest captures)
        </p>
      </div>

      <Card className="space-y-4 p-4">
        <div>
          <h2 className="font-medium">Link from catalog</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Exercises already in the Lab pool are excluded. Sorted by exo_id (numeric).
            Muscle group and equipment filters narrow each other to valid combinations.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600">Filter by name</span>
            <input
              type="search"
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              placeholder="Name or exo_id…"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600">Muscle group</span>
            <select
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              value={muscleGroupFilter}
              onChange={(e) => setMuscleGroupFilter(e.target.value)}
            >
              <option value="">All groups</option>
              {muscleGroupOptions.map((g) => (
                <option key={g.code} value={g.code}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600">Equipment</span>
            <select
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              value={equipmentFilter}
              onChange={(e) => setEquipmentFilter(e.target.value)}
            >
              <option value="">All equipment</option>
              {equipmentOptions.map((eq) => (
                <option key={eq.code} value={eq.code}>
                  {eq.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="text-sm text-zinc-500">
          {filteredCandidates.length} of {candidates.length} available
          {candidates.length === 0 && !loading ? " (all catalog exercises are already linked)" : ""}
        </p>

        <select
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          value={selectedExoId}
          onChange={(e) => setSelectedExoId(e.target.value)}
          disabled={!filteredCandidates.length}
        >
          {filteredCandidates.map((c) => (
            <option key={c.exo_id} value={c.exo_id}>
              {candidateLabel(c)}
            </option>
          ))}
        </select>

        <Button onClick={() => void linkCatalog()} disabled={!filteredCandidates.length}>
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
            {sortedExercises.map((row) => (
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
