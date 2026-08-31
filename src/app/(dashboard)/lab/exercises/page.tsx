"use client";

import { useEffect, useMemo, useState } from "react";
import { PlusCircle, Search, Filter, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { Badge, Button, Card, TableSkeleton } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/ui/toast";
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
  const toast = useToast();

  const [exercises, setExercises] = useState<LabExerciseRow[]>([]);
  const [candidates, setCandidates] = useState<CatalogCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedExoId, setSelectedExoId] = useState<string>("");
  const [nameFilter, setNameFilter] = useState("");
  const [muscleGroupFilter, setMuscleGroupFilter] = useState("");
  const [equipmentFilter, setEquipmentFilter] = useState("");
  const [togglePendingRow, setTogglePendingRow] = useState<LabExerciseRow | null>(null);

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
    setActionLoading(true);
    try {
      await staffFetch("/api/lab/exercises", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "link_catalog", catalog_exo_id: Number(selectedExoId) }),
      });
      toast.success(`Exercise ${selectedExoId} added to Lab pool.`);
      setNameFilter("");
      setMuscleGroupFilter("");
      setEquipmentFilter("");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to link exercise");
    } finally {
      setActionLoading(false);
    }
  }

  async function confirmToggleActive() {
    if (!togglePendingRow) return;
    setActionLoading(true);
    try {
      await staffFetch("/api/lab/exercises", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalog_exo_id: togglePendingRow.catalog_exo_id,
          active: !togglePendingRow.active,
        }),
      });
      toast.success(
        `Exercise ${togglePendingRow.catalog_exo_id} ${
          togglePendingRow.active ? "deactivated" : "activated"
        }.`,
      );
      setTogglePendingRow(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setActionLoading(false);
    }
  }

  const sortedExercises = useMemo(
    () => [...exercises].sort((a, b) => a.catalog_exo_id - b.catalog_exo_id),
    [exercises],
  );

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={Boolean(togglePendingRow)}
        title={togglePendingRow?.active ? "Deactivate lab exercise?" : "Activate lab exercise?"}
        description={
          togglePendingRow
            ? `Change status for "${labExerciseLabel(togglePendingRow)}" (exo ${
                togglePendingRow.catalog_exo_id
              }) in the active Lab collection pool?`
            : ""
        }
        loading={actionLoading}
        confirmLabel={togglePendingRow?.active ? "Deactivate" : "Activate"}
        variant={togglePendingRow?.active ? "danger" : "default"}
        onConfirm={() => void confirmToggleActive()}
        onCancel={() => setTogglePendingRow(null)}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Lab Exercises Pool</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Define which exercises from the system catalog are enabled for TwinFIT-Lab data captures.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void reload()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Link from Catalog Card */}
      <Card className="space-y-4 p-5">
        <div>
          <h2 className="font-semibold text-zinc-900">Link from Catalog</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Select an exercise to add to the Lab collection pool.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-600">
            <span className="mb-1 block">Search</span>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="search"
                className="w-full rounded-md border border-zinc-300 bg-white pl-8 pr-3 py-2 text-sm outline-none focus:border-zinc-500"
                placeholder="Name or exo_id…"
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
              />
            </div>
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-600">
            <span className="mb-1 block">Muscle group</span>
            <select
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500"
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

          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-600">
            <span className="mb-1 block">Equipment</span>
            <select
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500"
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

        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full">
            <p className="text-xs text-zinc-500 mb-1">
              {filteredCandidates.length} of {candidates.length} candidates available
            </p>
            <select
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500"
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
          </div>

          <Button
            onClick={() => void linkCatalog()}
            disabled={!filteredCandidates.length || actionLoading}
            className="shrink-0 w-full sm:w-auto"
          >
            <PlusCircle className="h-4 w-4" />
            Add to Lab Pool
          </Button>
        </div>
      </Card>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
          {error}
        </p>
      )}

      {/* Pool Table */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-2xs overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50/80 flex items-center justify-between">
          <span className="font-semibold text-xs text-zinc-700 uppercase tracking-wider">
            Pool Exercises ({sortedExercises.length})
          </span>
        </div>

        {loading && exercises.length === 0 ? (
          <TableSkeleton rows={6} cols={5} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm divide-y divide-zinc-200">
              <thead className="bg-zinc-50/50 text-xs font-semibold uppercase text-zinc-500 tracking-wider">
                <tr>
                  <th className="px-4 py-2.5">Exercise Name</th>
                  <th className="px-4 py-2.5">exo_id</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Total Sets</th>
                  <th className="px-4 py-2.5">Sort Order</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white">
                {sortedExercises.map((row) => (
                  <tr key={row.catalog_exo_id} className="hover:bg-zinc-50/70">
                    <td className="px-4 py-3 font-medium text-zinc-900">
                      {labExerciseLabel(row)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                      {row.catalog_exo_id}
                    </td>
                    <td className="px-4 py-3">
                      {row.active ? (
                        <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 w-fit">
                          <CheckCircle2 className="h-3 w-3" /> Active
                        </Badge>
                      ) : (
                        <Badge className="bg-zinc-100 text-zinc-500 flex items-center gap-1 w-fit">
                          <XCircle className="h-3 w-3" /> Inactive
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-zinc-700">
                      {row.sets_aggregate?.aggregate?.count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 font-mono">
                      {row.sort_order}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant={row.active ? "secondary" : "default"}
                        onClick={() => setTogglePendingRow(row)}
                        className="text-xs py-1 px-2.5"
                      >
                        {row.active ? "Deactivate" : "Activate"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
