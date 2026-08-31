"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  Users,
  Dumbbell,
  FlaskConical,
  Search,
  ArrowRight,
  PlusCircle,
  Activity,
  Layers,
} from "lucide-react";
import { Card, Skeleton, Button, Input } from "@/components/ui/primitives";
import { useStaffSWR } from "@/hooks/use-staff-fetch";

type CatalogResponse = {
  data?: {
    catalog_exercises?: Array<{ exo_id: number; taxonomy_status: string }>;
  };
};

type LabStatsResponse = {
  summary?: { totalSets: number; activeWithData: number; exerciseCount: number };
  userTotals?: Array<{ userId: string | null; email: string; totalSets: number }>;
};

export default function HomePage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: catalogData, isLoading: catalogLoading } =
    useStaffSWR<CatalogResponse>("/api/catalog/library");
  const { data: labData, isLoading: labLoading } =
    useStaffSWR<LabStatsResponse>("/api/lab/stats");

  const totalExercises = catalogData?.data?.catalog_exercises?.length ?? 0;
  const pendingExercises =
    catalogData?.data?.catalog_exercises?.filter(
      (e) => e.taxonomy_status === "pending",
    ).length ?? 0;

  const totalLabSets = labData?.summary?.totalSets ?? 0;
  const activeLabExercises = labData?.summary?.activeWithData ?? 0;
  const activeCollectors = labData?.userTotals?.length ?? 0;

  function onQuickSearch(e: FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    router.push(`/support?q=${encodeURIComponent(searchQuery.trim())}`);
  }

  return (
    <div className="space-y-8">
      {/* Header with Quick Lookup Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Operations & Support Dashboard
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage user accounts, catalog exercises, and TwinFIT-Lab sensor datasets.
          </p>
        </div>

        <form onSubmit={onQuickSearch} className="flex gap-2 max-w-md w-full md:w-auto">
          <div className="relative flex-1 md:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Search user by @handle or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button type="submit">Search</Button>
        </form>
      </div>

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
            <Dumbbell className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Catalog Exercises
            </p>
            {catalogLoading ? (
              <Skeleton className="h-7 w-16 mt-1" />
            ) : (
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-zinc-900">{totalExercises}</span>
                {pendingExercises > 0 && (
                  <span className="text-xs font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                    {pendingExercises} pending
                  </span>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
            <FlaskConical className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Lab Sensor Sets
            </p>
            {labLoading ? (
              <Skeleton className="h-7 w-16 mt-1" />
            ) : (
              <p className="text-2xl font-bold text-zinc-900 mt-1">
                {totalLabSets.toLocaleString()}
              </p>
            )}
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-purple-50 text-purple-600">
            <Activity className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Lab Pool Active
            </p>
            {labLoading ? (
              <Skeleton className="h-7 w-16 mt-1" />
            ) : (
              <p className="text-2xl font-bold text-zinc-900 mt-1">
                {activeLabExercises} exercises
              </p>
            )}
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-50 text-amber-600">
            <Users className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Active Collectors
            </p>
            {labLoading ? (
              <Skeleton className="h-7 w-16 mt-1" />
            ) : (
              <p className="text-2xl font-bold text-zinc-900 mt-1">
                {activeCollectors} contributors
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Primary Section Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="p-5 flex flex-col justify-between space-y-4 hover:border-zinc-300 transition-colors">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-semibold text-zinc-900">
              <Users className="h-5 w-5 text-zinc-700" />
              <span>User Support</span>
            </div>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Look up accounts by email or @username, manage subscriptions, verify emails,
              and inspect workout history.
            </p>
          </div>
          <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
            <Link
              href="/support"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-900 hover:text-zinc-700 transition-colors"
            >
              Open support <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Card>

        <Card className="p-5 flex flex-col justify-between space-y-4 hover:border-zinc-300 transition-colors">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-semibold text-zinc-900">
              <Dumbbell className="h-5 w-5 text-zinc-700" />
              <span>Exercise Catalog</span>
            </div>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Browse system exercises, compose new exercises with biomechanical parameters,
              and maintain taxonomy tables.
            </p>
          </div>
          <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
            <Link
              href="/catalog"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-900 hover:text-zinc-700 transition-colors"
            >
              Browse catalog <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/catalog/compose"
              className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800"
            >
              <PlusCircle className="h-3.5 w-3.5" /> New
            </Link>
          </div>
        </Card>

        <Card className="p-5 flex flex-col justify-between space-y-4 hover:border-zinc-300 transition-colors">
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-semibold text-zinc-900">
              <FlaskConical className="h-5 w-5 text-zinc-700" />
              <span>TwinFIT-Lab Dataset</span>
            </div>
            <p className="text-sm text-zinc-600 leading-relaxed">
              Monitor sensor capture datasets, inspect low-pass filtered IMU trajectories,
              download raw sensor JSON and manage exercise pools.
            </p>
          </div>
          <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
            <Link
              href="/lab"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-900 hover:text-zinc-700 transition-colors"
            >
              Open Lab stats <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/lab/sets"
              className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-800"
            >
              <Layers className="h-3.5 w-3.5" /> Sets
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
