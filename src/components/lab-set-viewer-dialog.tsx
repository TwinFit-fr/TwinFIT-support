"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/primitives";
import type { LabSetRow } from "@/lib/lab/queries";
import {
  buildLabSetChartData,
  parseSensorPayload,
  type LabSetChartData,
  type SlotChartSeries,
} from "@/lib/lab/sensor-series";

type LabSetViewerDialogProps = {
  open: boolean;
  setRow: LabSetRow | null;
  accessToken: string | null;
  onClose: () => void;
};

function durationSeconds(startedAt: string, endedAt: string): string {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "—";
  return `${Math.round((end - start) / 1000)}s`;
}

function mergeSeriesForChart(series: SlotChartSeries[]): Record<string, number>[] {
  const allT = new Set<number>();
  const maps = series.map((s) => {
    const map = new Map<number, number>();
    for (const p of s.points) {
      map.set(p.t, p.y);
      allT.add(p.t);
    }
    return { slot: s.slot, map };
  });
  return [...allT]
    .sort((a, b) => a - b)
    .map((t) => {
      const row: Record<string, number> = { t };
      for (const { slot, map } of maps) {
        const y = map.get(t);
        if (y !== undefined) row[slot] = y;
      }
      return row;
    });
}

function MagnitudeChart({
  title,
  series,
  yLabel,
}: {
  title: string;
  series: SlotChartSeries[];
  yLabel: string;
}) {
  const data = useMemo(() => mergeSeriesForChart(series), [series]);
  if (!series.length || data.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
        {title}: no samples
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-zinc-200 bg-white p-3">
      <h3 className="mb-2 text-sm font-medium text-zinc-700">{title}</h3>
      <div className="min-h-[220px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, "dataMax"]}
              allowDataOverflow
              tickFormatter={(v) => `${Number(v).toFixed(1)} s`}
              stroke="#71717a"
              fontSize={12}
              label={{
                value: "Time (s)",
                position: "insideBottom",
                offset: -2,
                style: { fill: "#71717a", fontSize: 11 },
              }}
            />
            <YAxis
              domain={["auto", "auto"]}
              stroke="#71717a"
              fontSize={12}
              label={{
                value: yLabel,
                angle: -90,
                position: "insideLeft",
                style: { fill: "#71717a", fontSize: 11 },
              }}
            />
            <Tooltip
              formatter={(value) =>
                typeof value === "number" ? [value.toFixed(3), ""] : ["—", ""]
              }
              labelFormatter={(label) => `t = ${Number(label).toFixed(2)} s`}
            />
            <Legend />
            {series.map((s) => (
              <Line
                key={s.slot}
                type="monotone"
                dataKey={s.slot}
                name={s.slotLabel}
                stroke={s.color}
                strokeWidth={1.5}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function LabSetViewerDialog({
  open,
  setRow,
  accessToken,
  onClose,
}: LabSetViewerDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<LabSetChartData | null>(null);

  const loadPayload = useCallback(async () => {
    if (!setRow || !accessToken) return;
    setLoading(true);
    setError(null);
    setChartData(null);
    try {
      const res = await fetch(`/api/lab/sets/${setRow.id}/file?inline=1`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Failed to load sensor data (${res.status})`);
      }
      const raw: unknown = await res.json();
      const payload = parseSensorPayload(raw);
      setChartData(buildLabSetChartData(payload));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sensor data");
    } finally {
      setLoading(false);
    }
  }, [setRow, accessToken]);

  useEffect(() => {
    if (open && setRow) {
      void loadPayload();
    } else {
      setChartData(null);
      setError(null);
    }
  }, [open, setRow, loadPayload]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !setRow) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lab-set-viewer-title"
        className="flex h-[85vh] w-[90vw] max-w-6xl flex-col rounded-xl border border-zinc-200 bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
          <div>
            <h2 id="lab-set-viewer-title" className="text-lg font-semibold">
              {setRow.custom_name}
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              {setRow.user_name} · {setRow.rep_count} reps · {setRow.weight_kg} kg ·{" "}
              {durationSeconds(setRow.started_at, setRow.ended_at)} · filtered (10 Hz LP)
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-5">
          {loading && <p className="text-sm text-zinc-500">Loading sensor data…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {chartData && !loading && !error && (
            <>
              <MagnitudeChart
                title="Acceleration magnitude"
                series={chartData.accSeries}
                yLabel="|a|"
              />
              <MagnitudeChart
                title="Gyro magnitude"
                series={chartData.gyroSeries}
                yLabel="|ω|"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
