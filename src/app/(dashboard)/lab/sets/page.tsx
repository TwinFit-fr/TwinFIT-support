"use client";

import { useAccessToken } from "@nhost/react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { LabSetViewerDialog } from "@/components/lab-set-viewer-dialog";
import { Button, Card, Input } from "@/components/ui/primitives";
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
  return date.toLocaleString(undefined, {
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

export default function LabSetsPage() {
  const staffFetch = useStaffFetch();
  const accessToken = useAccessToken();
  const [options, setOptions] = useState<LabSetFilterOptions | null>(null);
  const [data, setData] = useState<SetsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [viewingRow, setViewingRow] = useState<LabSetRow | null>(null);

  const [draftUserId, setDraftUserId] = useState("");
  const [draftExoId, setDraftExoId] = useState("");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");

  const [appliedUserId, setAppliedUserId] = useState("");
  const [appliedExoId, setAppliedExoId] = useState("");
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");
  const [page, setPage] = useState(1);

  const loadOptions = useCallback(async () => {
    const res = (await staffFetch("/api/lab/sets?options=1")) as {
      options: LabSetFilterOptions;
    };
    setOptions(res.options);
  }, [staffFetch]);

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
    void loadOptions().catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load filters");
    });
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
    () => (total === 0 ? "No sets" : `${fromRow}–${toRow} of ${total}`),
    [fromRow, toRow, total],
  );

  async function downloadSet(row: LabSetRow) {
    if (!accessToken) return;
    setDownloadingId(row.id);
    setDownloadError(null);
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
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <LabSetViewerDialog
        open={viewingRow !== null}
        setRow={viewingRow}
        accessToken={accessToken}
        onClose={() => setViewingRow(null)}
      />
      <div>
        <h1 className="text-2xl font-semibold">Lab sets</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Latest labelled captures from Nhost. Filters always query the server (not the current page).
        </p>
      </div>

      <Card>
        <form onSubmit={applyFilters} className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600">User</span>
            <select
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
              value={draftUserId}
              onChange={(e) => setDraftUserId(e.target.value)}
            >
              <option value="">All users</option>
              {(options?.users ?? []).map((user) => (
                <option key={user.id ?? "deleted"} value={user.id ?? "deleted"}>
                  {user.user_name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600">Exercise</span>
            <select
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
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
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600">From</span>
            <Input
              type="date"
              value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600">To</span>
            <Input
              type="date"
              value={draftTo}
              onChange={(e) => setDraftTo(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap items-end gap-2 md:col-span-2 lg:col-span-4">
            <Button type="submit">Apply filters</Button>
            <Button type="button" variant="secondary" onClick={clearFilters}>
              Clear
            </Button>
          </div>
        </form>
      </Card>

      {loading && <p className="text-sm text-zinc-500">Loading sets…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {downloadError && <p className="text-sm text-red-600">{downloadError}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">{pageLabel}</p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={loading || page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-zinc-600">
            Page {page} of {pageCount}
          </span>
          <Button
            type="button"
            variant="secondary"
            disabled={loading || page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50">
            <tr>
              <th className="px-4 py-2 font-medium">User</th>
              <th className="px-4 py-2 font-medium">Exercise</th>
              <th className="px-4 py-2 font-medium">Reps</th>
              <th className="px-4 py-2 font-medium">Weight</th>
              <th className="px-4 py-2 font-medium">Duration</th>
              <th className="px-4 py-2 font-medium">Started</th>
              <th className="px-4 py-2 font-medium">Ended</th>
              <th className="px-4 py-2 font-medium">Labeled</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {(data?.sets ?? []).map((row) => (
              <tr key={row.id} className="border-b border-zinc-100">
                <td className="px-4 py-2">{row.user_name}</td>
                <td className="px-4 py-2">{row.custom_name}</td>
                <td className="px-4 py-2 tabular-nums">{row.rep_count}</td>
                <td className="px-4 py-2 tabular-nums">{row.weight_kg} kg</td>
                <td className="px-4 py-2 tabular-nums">
                  {durationSeconds(row.started_at, row.ended_at)}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-zinc-600">
                  {formatTs(row.started_at)}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-zinc-600">
                  {formatTs(row.ended_at)}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-zinc-600">
                  {formatTs(row.labeled_at)}
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!row.storage_path}
                      onClick={() => setViewingRow(row)}
                    >
                      View data
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!row.storage_path || downloadingId === row.id}
                      onClick={() => void downloadSet(row)}
                    >
                      {downloadingId === row.id ? "Downloading…" : "Download data"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && (data?.sets.length ?? 0) === 0 && (
              <tr>
                <td className="px-4 py-6 text-zinc-500" colSpan={9}>
                  No sets match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
