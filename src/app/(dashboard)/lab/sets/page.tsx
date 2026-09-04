"use client";

import { useAccessToken } from "@nhost/react";
import { useSearchParams, useRouter } from "next/navigation";
import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  Eye,
  Filter,
  FileSpreadsheet,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { LabSetViewerDialog } from "@/components/lab-set-viewer-dialog";
import { Button, Card, Input, TableSkeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import {
  LAB_SETS_PAGE_SIZE,
  type LabSetFilterOptions,
  type LabSetRow,
} from "@/lib/lab/queries";

type SetsResponse = {
  sets: LabSetRow[];
  total: number;
  page: number;
  pageSize: number;
};

function formatTs(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function durationSeconds(startedAt: string, endedAt: string): string {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "—";
  const seconds = Math.round((end - start) / 1000);
  return `${seconds}s`;
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utf = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf?.[1]) return decodeURIComponent(utf[1]);
  const ascii = header.match(/filename="([^"]+)"/i);
  return ascii?.[1] ?? fallback;
}

function LabSetsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const staffFetch = useStaffFetch();
  const accessToken = useAccessToken();
  const toast = useToast();

  const urlUserId = searchParams.get("user_id") ?? "";
  const urlExoId = searchParams.get("catalog_exo_id") ?? "";
  const urlFrom = searchParams.get("from") ?? "";
  const urlTo = searchParams.get("to") ?? "";
  const urlPage = Math.max(1, Number(searchParams.get("page") ?? 1));

  const [options, setOptions] = useState<LabSetFilterOptions | null>(null);
  const [data, setData] = useState<SetsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [viewingRow, setViewingRow] = useState<LabSetRow | null>(null);

  const [draftUserId, setDraftUserId] = useState(urlUserId);
  const [draftExoId, setDraftExoId] = useState(urlExoId);
  const [draftFrom, setDraftFrom] = useState(urlFrom);
  const [draftTo, setDraftTo] = useState(urlTo);

  const [appliedUserId, setAppliedUserId] = useState(urlUserId);
  const [appliedExoId, setAppliedExoId] = useState(urlExoId);
  const [appliedFrom, setAppliedFrom] = useState(urlFrom);
  const [appliedTo, setAppliedTo] = useState(urlTo);
  const [page, setPage] = useState(urlPage);

  const loadOptions = useCallback(async () => {
    try {
      const res = (await staffFetch("/api/lab/sets?options=1")) as {
        options: LabSetFilterOptions;
      };
      setOptions(res.options);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load filters");
    }
  }, [staffFetch, toast]);

  const loadSets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      if (appliedUserId) params.set("user_id", appliedUserId);
      if (appliedExoId) params.set("catalog_exo_id", appliedExoId);
      if (appliedFrom) params.set("from", appliedFrom);
      if (appliedTo) params.set("to", appliedTo);

      const res = (await staffFetch(`/api/lab/sets?${params.toString()}`)) as SetsResponse;
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sets");
    } finally {
      setLoading(false);
    }
  }, [staffFetch, page, appliedUserId, appliedExoId, appliedFrom, appliedTo]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    void loadSets();
  }, [loadSets]);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setAppliedUserId(draftUserId);
    setAppliedExoId(draftExoId);
    setAppliedFrom(draftFrom);
    setAppliedTo(draftTo);
    setPage(1);
  }

  function clearFilters() {
    setDraftUserId("");
    setDraftExoId("");
    setDraftFrom("");
    setDraftTo("");
    setAppliedUserId("");
    setAppliedExoId("");
    setAppliedFrom("");
    setAppliedTo("");
    setPage(1);
  }

  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? LAB_SETS_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const fromRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toRow = Math.min(page * pageSize, total);

  const pageLabel = useMemo(
    () => (total === 0 ? "No sets" : `${fromRow}–${toRow} of ${total} sets`),
    [fromRow, toRow, total],
  );

  async function downloadSet(row: LabSetRow) {
    if (!accessToken) return;
    setDownloadingId(row.id);
    try {
      const res = await fetch(`/api/lab/sets/${row.id}/file`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Download failed (${res.status})`);
      }
      const blob = await res.blob();
      const filename = filenameFromDisposition(
        res.headers.get("Content-Disposition"),
        `${row.custom_name.replace(/\s+/g, "_")}_${row.id}.json`,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${filename}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloadingId(null);
    }
  }

  // Export metadata of currently loaded sets as CSV
  function exportMetadataCsv() {
    if (!data?.sets.length) return;
    const headers = [
      "Set ID",
      "User",
      "Exercise Name",
      "Exo ID",
      "Reps",
      "Weight (kg)",
      "Started At",
      "Ended At",
      "Labeled At",
      "Storage Path",
    ];

    const rows = data.sets.map((s) => [
      `"${s.id}"`,
      `"${s.user_name.replace(/"/g, '""')}"`,
      `"${s.custom_name.replace(/"/g, '""')}"`,
      s.catalog_exo_id,
      s.rep_count,
      s.weight_kg,
      `"${s.started_at}"`,
      `"${s.ended_at}"`,
      `"${s.labeled_at}"`,
      `"${s.storage_path}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `twinfit_lab_sets_page_${page}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("CSV metadata exported.");
  }

  return (
    <div className="space-y-6">
      <LabSetViewerDialog
        open={viewingRow !== null}
        setRow={viewingRow}
        accessToken={accessToken}
        onClose={() => setViewingRow(null)}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Lab Sets Browser</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Browse labelled sensor captures, plot filtered IMU trajectories, and download files.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {data && data.sets.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              onClick={exportMetadataCsv}
              title="Export current page metadata to CSV"
            >
              <FileSpreadsheet className="h-4 w-4" /> Export CSV
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={() => void loadSets()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Filter Form Card */}
      <Card className="p-4">
        <form onSubmit={applyFilters} className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-600">
            <span className="mb-1 block">Contributor</span>
            <select
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500"
              value={draftUserId}
              onChange={(e) => setDraftUserId(e.target.value)}
            >
              <option value="">All contributors</option>
              {(options?.users ?? []).map((user) => (
                <option key={user.id ?? "deleted"} value={user.id ?? "deleted"}>
                  {user.user_name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-600">
            <span className="mb-1 block">Exercise</span>
            <select
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500"
              value={draftExoId}
              onChange={(e) => setDraftExoId(e.target.value)}
            >
              <option value="">All exercises</option>
              {(options?.exercises ?? []).map((ex) => (
                <option key={ex.catalog_exo_id} value={ex.catalog_exo_id}>
                  {ex.custom_name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-600">
            <span className="mb-1 block">From Date</span>
            <Input
              type="date"
              value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
            />
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-600">
            <span className="mb-1 block">To Date</span>
            <Input
              type="date"
              value={draftTo}
              onChange={(e) => setDraftTo(e.target.value)}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2 md:col-span-2 lg:col-span-4 pt-1">
            <Button type="submit">
              <Filter className="h-4 w-4" /> Apply filters
            </Button>
            <Button type="button" variant="secondary" onClick={clearFilters}>
              <X className="h-4 w-4" /> Clear
            </Button>
          </div>
        </form>
      </Card>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
          {error}
        </p>
      )}

      {/* Table Container */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-2xs overflow-hidden">
        {loading && !data ? (
          <TableSkeleton rows={8} cols={7} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm divide-y divide-zinc-200">
              <thead className="bg-zinc-50/80 text-zinc-700 text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Contributor</th>
                  <th className="px-4 py-3">Exercise</th>
                  <th className="px-4 py-3">Reps</th>
                  <th className="px-4 py-3">Weight</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Recorded At</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 bg-white">
                {(data?.sets ?? []).map((row) => (
                  <tr key={row.id} className="hover:bg-zinc-50/70">
                    <td className="px-4 py-3 font-medium text-zinc-900">{row.user_name}</td>
                    <td className="px-4 py-3 text-zinc-800">{row.custom_name}</td>
                    <td className="px-4 py-3 font-mono text-zinc-700">{row.rep_count}</td>
                    <td className="px-4 py-3 font-mono text-zinc-700">{row.weight_kg} kg</td>
                    <td className="px-4 py-3 font-mono text-zinc-600">
                      {durationSeconds(row.started_at, row.ended_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">
                      {formatTs(row.started_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={!row.storage_path}
                          onClick={() => setViewingRow(row)}
                          className="px-2.5 py-1 text-xs"
                          title="View schema v1 payload, config, and IMU plots"
                        >
                          <Eye className="h-3.5 w-3.5" /> View
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={!row.storage_path || downloadingId === row.id}
                          onClick={() => void downloadSet(row)}
                          className="px-2.5 py-1 text-xs"
                          title="Download raw sensor JSON file"
                        >
                          <Download className="h-3.5 w-3.5" />
                          {downloadingId === row.id ? "…" : "JSON"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}

                {!loading && (data?.sets.length ?? 0) === 0 && (
                  <tr>
                    <td className="px-4 py-12 text-center text-sm text-zinc-500" colSpan={7}>
                      No sets match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-50/60 px-4 py-3 text-xs text-zinc-600">
          <p>{pageLabel}</p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={loading || page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1 text-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Previous
            </Button>
            <span className="font-medium px-2">
              Page {page} of {pageCount}
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={loading || page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              className="px-2.5 py-1 text-xs"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LabSetsPage() {
  return (
    <Suspense fallback={<TableSkeleton rows={8} cols={7} />}>
      <LabSetsContent />
    </Suspense>
  );
}
