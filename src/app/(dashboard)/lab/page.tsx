"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/primitives";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import { labExerciseLabel, type LabGlobalStatRow, type LabUserStatRow } from "@/lib/lab/queries";

type StatsResponse = {
  summary: { totalSets: number; activeWithData: number; exerciseCount: number };
  globalStats: LabGlobalStatRow[];
  userStats: LabUserStatRow[];
  userTotals: { userId: string; email: string; totalSets: number }[];
};

export default function LabStatsPage() {
  const staffFetch = useStaffFetch();
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"global" | "users">("global");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = (await staffFetch("/api/lab/stats")) as StatsResponse & { ok?: boolean };
        setData(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stats");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [staffFetch]);

  function exerciseName(row: LabGlobalStatRow | LabUserStatRow): string {
    if ("labExercise" in row && row.labExercise) return labExerciseLabel(row.labExercise);
    if ("catalogExercise" in row && row.catalogExercise) {
      return row.catalogExercise.display_name;
    }
    return `exo ${row.catalog_exo_id}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Lab dataset stats</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Global and per-collector set counts from schema <code className="text-xs">lab</code>
          </p>
        </div>
        <Link
          href="/lab/exercises"
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
        >
          Manage exercises
        </Link>
      </div>

      {data && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs uppercase text-zinc-500">Total sets</p>
            <p className="text-2xl font-semibold">{data.summary.totalSets}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase text-zinc-500">Exercises with data</p>
            <p className="text-2xl font-semibold">{data.summary.exerciseCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase text-zinc-500">Active w/ data</p>
            <p className="text-2xl font-semibold">{data.summary.activeWithData}</p>
          </Card>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("global")}
          className={`rounded-md px-3 py-1.5 text-sm ${tab === "global" ? "bg-zinc-900 text-white" : "border border-zinc-300"}`}
        >
          Global by exercise
        </button>
        <button
          type="button"
          onClick={() => setTab("users")}
          className={`rounded-md px-3 py-1.5 text-sm ${tab === "users" ? "bg-zinc-900 text-white" : "border border-zinc-300"}`}
        >
          By user
        </button>
      </div>

      {loading && <p className="text-sm text-zinc-500">Loading stats…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {data && tab === "global" && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50">
              <tr>
                <th className="px-4 py-2 font-medium">Exercise</th>
                <th className="px-4 py-2 font-medium">exo_id</th>
                <th className="px-4 py-2 font-medium">In pool</th>
                <th className="px-4 py-2 font-medium">Active</th>
                <th className="px-4 py-2 font-medium">Total sets</th>
              </tr>
            </thead>
            <tbody>
              {data.globalStats.map((row) => (
                <tr key={row.catalog_exo_id} className="border-b border-zinc-100">
                  <td className="px-4 py-2">{exerciseName(row)}</td>
                  <td className="px-4 py-2">{row.catalog_exo_id}</td>
                  <td className="px-4 py-2">{row.labExercise ? "yes" : "no"}</td>
                  <td className="px-4 py-2">{row.labExercise?.active ? "yes" : "no"}</td>
                  <td className="px-4 py-2 font-medium">{row.total_sets}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && tab === "users" && (
        <div className="space-y-6">
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50">
                <tr>
                  <th className="px-4 py-2 font-medium">User</th>
                  <th className="px-4 py-2 font-medium">Total sets</th>
                </tr>
              </thead>
              <tbody>
                {data.userTotals.map((row) => (
                  <tr key={row.userId} className="border-b border-zinc-100">
                    <td className="px-4 py-2">{row.email}</td>
                    <td className="px-4 py-2 font-medium">{row.totalSets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50">
                <tr>
                  <th className="px-4 py-2 font-medium">User</th>
                  <th className="px-4 py-2 font-medium">Exercise</th>
                  <th className="px-4 py-2 font-medium">Sets</th>
                </tr>
              </thead>
              <tbody>
                {data.userStats.map((row) => (
                  <tr
                    key={`${row.user_id ?? "deleted"}-${row.catalog_exo_id}`}
                    className="border-b border-zinc-100"
                  >
                    <td className="px-4 py-2">
                      {row.user?.email ?? (row.user_id ? row.user_id : "Deleted account")}
                    </td>
                    <td className="px-4 py-2">{exerciseName(row)}</td>
                    <td className="px-4 py-2 font-medium">{row.set_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
