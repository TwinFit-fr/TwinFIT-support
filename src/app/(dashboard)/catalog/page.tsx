"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  PlusCircle,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
} from "lucide-react";
import { Badge, Button, Card, Input, TableSkeleton } from "@/components/ui/primitives";
import { useStaffSWR } from "@/hooks/use-staff-fetch";
import { cn } from "@/lib/utils";

type CatalogExercise = {
  exo_id: number;
  display_name: string;
  taxonomy_status: string;
  primary_muscle_group?: { code: string; name?: string };
  movement_type?: { code: string; name?: string };
  equipment?: { code: string; name?: string };
};

type SortField = "exo_id" | "display_name" | "group" | "movement" | "status";
type SortDirection = "asc" | "desc";

function CatalogContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialFilter = searchParams.get("q") ?? "";
  const initialSort = (searchParams.get("sort") as SortField) ?? "exo_id";
  const initialDir = (searchParams.get("dir") as SortDirection) ?? "asc";
  const initialPage = Math.max(1, Number(searchParams.get("page") ?? 1));

  const [filter, setFilter] = useState(initialFilter);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>(initialSort);
  const [sortDir, setSortDir] = useState<SortDirection>(initialDir);
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(25);

  const { data, error, isLoading } = useStaffSWR<{
    data?: { catalog_exercises?: CatalogExercise[] };
  }>("/api/catalog/library");

  const exercises = useMemo(() => data?.data?.catalog_exercises ?? [], [data]);

  // Handle Sort Toggle
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(1);
  };

  // Filter & Sort
  const processed = useMemo(() => {
    let result = [...exercises];

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((ex) => ex.taxonomy_status === statusFilter);
    }

    // Text search
    const q = filter.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (ex) =>
          ex.display_name.toLowerCase().includes(q) ||
          String(ex.exo_id).includes(q) ||
          ex.primary_muscle_group?.code.toLowerCase().includes(q) ||
          ex.equipment?.code?.toLowerCase().includes(q) ||
          ex.movement_type?.code?.toLowerCase().includes(q),
      );
    }

    // Sort
    result.sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortField) {
        case "exo_id":
          aVal = a.exo_id;
          bVal = b.exo_id;
          break;
        case "display_name":
          aVal = a.display_name.toLowerCase();
          bVal = b.display_name.toLowerCase();
          break;
        case "group":
          aVal = a.primary_muscle_group?.code.toLowerCase() ?? "";
          bVal = b.primary_muscle_group?.code.toLowerCase() ?? "";
          break;
        case "movement":
          aVal = a.movement_type?.code.toLowerCase() ?? "";
          bVal = b.movement_type?.code.toLowerCase() ?? "";
          break;
        case "status":
          aVal = a.taxonomy_status.toLowerCase();
          bVal = b.taxonomy_status.toLowerCase();
          break;
      }

      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [exercises, filter, statusFilter, sortField, sortDir]);

  // Pagination
  const total = processed.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const from = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, total);

  const paginatedExercises = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processed.slice(start, start + pageSize);
  }, [processed, currentPage, pageSize]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
            Exercise Catalog
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {exercises.length} total system exercises registered
          </p>
        </div>
        <Link href="/catalog/compose">
          <Button className="w-full sm:w-auto">
            <PlusCircle className="h-4 w-4" /> New exercise
          </Button>
        </Link>
      </div>

      {/* Filters Bar */}
      <Card className="p-3.5">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Search by name, exo_id, muscle group, equipment..."
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
              className="pl-9 pr-8"
            />
            {filter && (
              <button
                type="button"
                onClick={() => {
                  setFilter("");
                  setPage(1);
                }}
                className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500 shrink-0">
              <Filter className="h-3.5 w-3.5" />
              <span>Status:</span>
            </div>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-zinc-500"
            >
              <option value="all">All statuses</option>
              <option value="migrated">migrated</option>
              <option value="pending">pending</option>
            </select>
          </div>
        </div>
      </Card>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
          {error.message || "Failed to load catalog"}
        </p>
      )}

      {/* Table Container */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-2xs overflow-hidden">
        {isLoading && exercises.length === 0 ? (
          <TableSkeleton rows={8} cols={6} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm divide-y divide-zinc-200">
              <thead className="bg-zinc-50/80 text-zinc-700 text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th
                    className="px-4 py-3 cursor-pointer hover:bg-zinc-100/80 transition-colors select-none"
                    onClick={() => handleSort("exo_id")}
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
                    className="px-4 py-3 cursor-pointer hover:bg-zinc-100/80 transition-colors select-none"
                    onClick={() => handleSort("display_name")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Name</span>
                      {sortField === "display_name" ? (
                        sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-zinc-400" />
                      )}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 cursor-pointer hover:bg-zinc-100/80 transition-colors select-none"
                    onClick={() => handleSort("group")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Muscle group</span>
                      {sortField === "group" ? (
                        sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-zinc-400" />
                      )}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 cursor-pointer hover:bg-zinc-100/80 transition-colors select-none"
                    onClick={() => handleSort("movement")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Movement</span>
                      {sortField === "movement" ? (
                        sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-zinc-400" />
                      )}
                    </div>
                  </th>
                  <th
                    className="px-4 py-3 cursor-pointer hover:bg-zinc-100/80 transition-colors select-none"
                    onClick={() => handleSort("status")}
                  >
                    <div className="flex items-center gap-1">
                      <span>Status</span>
                      {sortField === "status" ? (
                        sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-zinc-400" />
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white">
                {paginatedExercises.map((ex) => (
                  <tr key={ex.exo_id} className="hover:bg-zinc-50/70 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-zinc-600">
                      {ex.exo_id}
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-900">
                      {ex.display_name}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {ex.primary_muscle_group?.code ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {ex.movement_type?.code ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={cn(
                          ex.taxonomy_status === "migrated"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200",
                        )}
                      >
                        {ex.taxonomy_status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/catalog/compose?exo_id=${ex.exo_id}`}
                        className="inline-flex items-center text-xs font-semibold text-zinc-900 hover:text-zinc-600 underline"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}

                {paginatedExercises.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-sm text-zinc-500">
                      No exercises match the current search or filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50/60 px-4 py-3 text-xs text-zinc-600">
          <div className="flex items-center gap-3">
            <span>
              Showing <strong className="text-zinc-900">{from}</strong> to{" "}
              <strong className="text-zinc-900">{to}</strong> of{" "}
              <strong className="text-zinc-900">{total}</strong> exercises
            </span>
            <div className="flex items-center gap-1.5 pl-3 border-l border-zinc-200">
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded border border-zinc-300 bg-white px-1.5 py-0.5 outline-none"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2 py-1 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </Button>
            <span className="px-2 font-medium">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-2 py-1 text-xs"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CatalogPage() {
  return (
    <Suspense fallback={<TableSkeleton rows={8} cols={6} />}>
      <CatalogContent />
    </Suspense>
  );
}
