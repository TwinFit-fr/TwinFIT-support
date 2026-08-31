"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  Users,
  FlaskConical,
  Activity,
  Layers,
} from "lucide-react";
import { Badge, Button, Card, Input, TableSkeleton, StatCardSkeleton } from "@/components/ui/primitives";
import { useStaffSWR } from "@/hooks/use-staff-fetch";
import { labExerciseLabel, type LabGlobalStatRow, type LabUserStatRow } from "@/lib/lab/queries";

type StatsResponse = {
  summary: { totalSets: number; activeWithData: number; exerciseCount: number };
  globalStats: LabGlobalStatRow[];
  userStats: LabUserStatRow[];
  userTotals: { userId: string | null; email: string; totalSets: number }[];
};

type GlobalSortField = "exercise" | "exo_id" | "in_pool" | "active" | "total_sets";
type SortDirection = "asc" | "desc";

export default function LabStatsPage() {
  const [tab, setTab] = useState<"global" | "users">("global");
  const [filter, setFilter] = useState("");
  const [sortField, setSortField] = useState<GlobalSortField>("total_sets");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const { data, error, isLoading } = useStaffSWR<StatsResponse>("/api/lab/stats");

  function exerciseName(row: LabGlobalStatRow | LabUserStatRow): string {
    if ("labExercise" in row && row.labExercise) return labExerciseLabel(row.labExercise);
    if ("catalogExercise" in row && row.catalogExercise) {
      return row.catalogExercise.display_name;
    }
    return `exo ${row.catalog_exo_id}`;
  }

  const handleGlobalSort = (field: GlobalSortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const filteredGlobalStats = useMemo(() => {
    if (!data?.globalStats) return [];
    let list = [...data.globalStats];

    const q = filter.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (row) =>
          exerciseName(row).toLowerCase().includes(q) ||
          String(row.catalog_exo_id).includes(q),
      );
    }

    list.sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortField) {
        case "exercise":
          aVal = exerciseName(a).toLowerCase();
          bVal = exerciseName(b).toLowerCase();
          break;
        case "exo_id":
          aVal = a.catalog_exo_id;
          bVal = b.catalog_exo_id;
          break;
        case "in_pool":
          aVal = a.labExercise ? 1 : 0;
          bVal = b.labExercise ? 1 : 0;
          break;
        case "active":
          aVal = a.labExercise?.active ? 1 : 0;
          bVal = b.labExercise?.active ? 1 : 0;
          break;
        case "total_sets":
          aVal = Number(a.total_sets);
          bVal = Number(b.total_sets);
          break;
      }

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [data?.globalStats, filter, sortField, sortDir]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Lab Dataset Stats</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Global and per-collector set counts from schema <code className="text-xs font-mono">lab</code>
        </p>
      </div>

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-3">
        {isLoading && !data ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          data && (
            <>
              <Card className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs uppercase font-medium tracking-wider text-zinc-500">
                    Total Lab Sets
                  </p>
                  <p className="text-2xl font-bold text-zinc-900 mt-0.5">
                    {data.summary.totalSets.toLocaleString()}
                  </p>
                </div>
              </Card>

              <Card className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-blue-50 text-blue-600">
                  <FlaskConical className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs uppercase font-medium tracking-wider text-zinc-500">
                    Exercises with Data
                  </p>
                  <p className="text-2xl font-bold text-zinc-900 mt-0.5">
                    {data.summary.exerciseCount}
                  </p>
                </div>
              </Card>

              <Card className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-purple-50 text-purple-600">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs uppercase font-medium tracking-wider text-zinc-500">
                    Active in Pool w/ Data
                  </p>
                  <p className="text-2xl font-bold text-zinc-900 mt-0.5">
                    {data.summary.activeWithData}
                  </p>
                </div>
              </Card>
            </>
          )
        )}
      </div>

      {/* Controls & Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex gap-1.5 p-1 rounded-lg bg-zinc-200/60 w-fit">
          <button
            type="button"
            onClick={() => setTab("global")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === "global"
                ? "bg-white text-zinc-900 shadow-2xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Global by exercise ({data?.globalStats?.length ?? 0})
          </button>
          <button
            type="button"
            onClick={() => setTab("users")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === "users"
                ? "bg-white text-zinc-900 shadow-2xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            By contributor ({data?.userTotals?.length ?? 0})
          </button>
        </div>

        {tab === "global" && (
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
            <Input
              placeholder="Filter exercises..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-8 text-xs py-1.5"
            />
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
          {error.message || "Failed to load stats"}
        </p>
      )}

      {/* Global Stats Table */}
      {tab === "global" && (
        <div className="rounded-xl border border-zinc-200 bg-white shadow-2xs overflow-hidden">
          {isLoading && !data ? (
            <TableSkeleton rows={6} cols={5} />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm divide-y divide-zinc-200">
                <thead className="bg-zinc-50/80 text-zinc-700 text-xs font-semibold uppercase tracking-wider">
                  <tr>
                    <th
                      className="px-4 py-3 cursor-pointer hover:bg-zinc-100 select-none"
                      onClick={() => handleGlobalSort("exercise")}
                    >
                      <div className="flex items-center gap-1">
                        <span>Exercise</span>
                        {sortField === "exercise" ? (
                          sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-zinc-400" />
                        )}
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 cursor-pointer hover:bg-zinc-100 select-none"
                      onClick={() => handleGlobalSort("exo_id")}
                    >
                      <div className="flex items-center gap-1">
                        <span>exo_id</span>
                        {sortField === "exo_id" ? (
                          sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-zinc-400" />
                        )}
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 cursor-pointer hover:bg-zinc-100 select-none"
                      onClick={() => handleGlobalSort("in_pool")}
                    >
                      <div className="flex items-center gap-1">
                        <span>In pool</span>
                        {sortField === "in_pool" ? (
                          sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-zinc-400" />
                        )}
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 cursor-pointer hover:bg-zinc-100 select-none"
                      onClick={() => handleGlobalSort("active")}
                    >
                      <div className="flex items-center gap-1">
                        <span>Active</span>
                        {sortField === "active" ? (
                          sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-zinc-400" />
                        )}
                      </div>
                    </th>
                    <th
                      className="px-4 py-3 cursor-pointer hover:bg-zinc-100 select-none text-right"
                      onClick={() => handleGlobalSort("total_sets")}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Total sets</span>
                        {sortField === "total_sets" ? (
                          sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 text-zinc-400" />
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {filteredGlobalStats.map((row) => (
                    <tr key={row.catalog_exo_id} className="hover:bg-zinc-50/70">
                      <td className="px-4 py-2.5 font-medium text-zinc-900">
                        {exerciseName(row)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">
                        {row.catalog_exo_id}
                      </td>
                      <td className="px-4 py-2.5">
                        {row.labExercise ? (
                          <Badge className="bg-blue-50 text-blue-700 border border-blue-200">
                            Pool
                          </Badge>
                        ) : (
                          <Badge className="bg-zinc-100 text-zinc-500">Unlinked</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {row.labExercise?.active ? (
                          <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Active
                          </Badge>
                        ) : (
                          <Badge className="bg-zinc-100 text-zinc-500">Inactive</Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-bold font-mono text-right text-zinc-900">
                        {row.total_sets.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* User Stats Tab */}
      {tab === "users" && data && (
        <div className="space-y-6">
          <div className="rounded-xl border border-zinc-200 bg-white shadow-2xs overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50/70 font-semibold text-xs text-zinc-700 uppercase tracking-wider">
              Contributors Overview
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm divide-y divide-zinc-200">
                <thead className="bg-zinc-50/50 text-xs font-semibold uppercase text-zinc-500 tracking-wider">
                  <tr>
                    <th className="px-4 py-2.5">Contributor</th>
                    <th className="px-4 py-2.5 text-right">Total Sets Uploaded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {data.userTotals.map((row, i) => (
                    <tr key={row.userId ?? i} className="hover:bg-zinc-50/70">
                      <td className="px-4 py-2.5 font-medium text-zinc-900">{row.email}</td>
                      <td className="px-4 py-2.5 font-bold font-mono text-right text-zinc-900">
                        {row.totalSets.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
