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
import { Badge, Button } from "@/components/ui/primitives";
import type { LabSetRow } from "@/lib/lab/queries";
import {
  buildLabSetChartData,
  buildLabSetPayloadSummary,
  maxSeriesTimeSeconds,
  mergeSeriesBySampleIndex,
  parseSensorPayload,
  type LabSetChartData,
  type LabSetPayloadSummary,
  type LabSetSlotConfig,
  type SlotChartSeries,
} from "@/lib/lab/sensor-series";

type LabSetViewerDialogProps = {
  open: boolean;
  setRow: LabSetRow | null;
  accessToken: string | null;
  onClose: () => void;
};

type ChartTab = "acc" | "gyro" | "euler" | "mag";

const CHART_TABS: { id: ChartTab; title: string; yLabel: string; unit: string }[] = [
  { id: "acc", title: "Acceleration", yLabel: "|a|", unit: "g" },
  { id: "gyro", title: "Gyroscope", yLabel: "|ω|", unit: "°/s" },
  { id: "euler", title: "Euler", yLabel: "|θ|", unit: "°" },
  { id: "mag", title: "Magnetometer", yLabel: "|B|", unit: "µT" },
];

function durationSeconds(startedAt: string, endedAt: string): string {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "—";
  return `${Math.round((end - start) / 1000)}s`;
}

function formatTs(value: string | number | null | undefined): string {
  if (value == null) return "—";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatHz(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)} Hz`;
}

function formatSeconds(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)} s`;
}

function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm text-zinc-900">{value}</dd>
    </div>
  );
}

function SectionCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-zinc-800">{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function SlotDeviceDetails({ config }: { config: LabSetSlotConfig | undefined }) {
  if (!config) {
    return <p className="text-xs text-zinc-500">No device config in payload.</p>;
  }

  const wit = config.witmotion;
  const wear = config.wear;
  const witRegs = wit
    ? (
        [
          wit.rate_reg != null ? `rate ${wit.rate_reg}` : null,
          wit.install_orientation_reg != null ? `orient ${wit.install_orientation_reg}` : null,
          wit.axis6_reg != null ? `axis6 ${wit.axis6_reg}` : null,
          wit.content_reg_0x96 != null ? `content ${wit.content_reg_0x96}` : null,
        ] as const
      ).filter((v): v is string => v != null)
    : [];

  return (
    <div className="space-y-2 text-xs text-zinc-700">
      <div className="flex flex-wrap gap-1.5">
        <Badge className="font-mono uppercase">{config.transport}</Badge>
        <Badge>{config.display_name}</Badge>
        {wit?.orientation && <Badge>{wit.orientation}</Badge>}
        {wit?.axis_algorithm && <Badge>{wit.axis_algorithm}</Badge>}
        {wear?.orientation_fusion && <Badge>{wear.orientation_fusion}</Badge>}
      </div>
      <dl className="grid gap-1.5 sm:grid-cols-2">
        <MetaItem label="Device ID" value={<span className="font-mono text-xs">{config.device_id}</span>} />
        {config.mac_address && (
          <MetaItem
            label="MAC"
            value={<span className="font-mono text-xs">{config.mac_address}</span>}
          />
        )}
        {config.wear_node_id && (
          <MetaItem
            label="Wear node"
            value={<span className="font-mono text-xs">{config.wear_node_id}</span>}
          />
        )}
      </dl>
      {wit && (witRegs.length > 0 || wit.orientation || wit.axis_algorithm) && (
        <div className="rounded-md bg-zinc-50 px-2.5 py-2">
          <p className="mb-1 font-medium text-zinc-800">WitMotion</p>
          {(wit.orientation || wit.axis_algorithm) && (
            <p className="mb-1 text-zinc-600">
              {[wit.orientation, wit.axis_algorithm].filter(Boolean).join(" · ")}
            </p>
          )}
          {witRegs.length > 0 && (
            <div className="grid grid-cols-2 gap-1 font-mono text-[11px] text-zinc-600">
              {witRegs.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </div>
          )}
        </div>
      )}
      {wear &&
        (wear.sensors != null ||
          wear.magnetic_field_available != null ||
          wear.orientation_fusion != null ||
          wear.requested_sample_rate_hz != null) && (
          <div className="rounded-md bg-zinc-50 px-2.5 py-2">
            <p className="mb-1 font-medium text-zinc-800">Wear</p>
            {wear.magnetic_field_available != null && (
              <p className="text-zinc-600">
                Mag: {wear.magnetic_field_available ? "available" : "unavailable"}
              </p>
            )}
            {wear.orientation_fusion && (
              <p className="text-zinc-600">Fusion: {wear.orientation_fusion}</p>
            )}
            {wear.requested_sample_rate_hz != null && (
              <p className="text-zinc-600">Requested: {wear.requested_sample_rate_hz} Hz</p>
            )}
            {wear.sensors && wear.sensors.length > 0 && (
              <p className="mt-1 break-all font-mono text-[11px] text-zinc-500">
                {wear.sensors.join(", ")}
              </p>
            )}
          </div>
        )}
    </div>
  );
}

function MagnitudeChart({
  title,
  series,
  yLabel,
  unit,
}: {
  title: string;
  series: SlotChartSeries[];
  yLabel: string;
  unit: string;
}) {
  const chartRows = useMemo(() => mergeSeriesBySampleIndex(series), [series]);
  const maxT = useMemo(() => maxSeriesTimeSeconds(series), [series]);
  const totalPoints = useMemo(
    () => series.reduce((sum, s) => sum + s.points.length, 0),
    [series],
  );

  if (!series.length || totalPoints === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
        {title}: no finite samples for this channel
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col rounded-lg border border-zinc-200 bg-white p-3">
      <h3 className="mb-2 text-sm font-medium text-zinc-700">
        {title}
        <span className="ml-2 font-normal text-zinc-500">
          ({totalPoints.toLocaleString()} pts · {unit} · 10 Hz LP)
        </span>
      </h3>
      <div className="h-[280px] w-full shrink-0">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart
            data={chartRows}
            margin={{ top: 4, right: 12, left: 4, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
            <XAxis
              type="number"
              dataKey="t"
              domain={[0, maxT > 0 ? maxT : "auto"]}
              allowDataOverflow
              tickFormatter={(v) => `${Number(v).toFixed(2)} s`}
              stroke="#71717a"
              fontSize={12}
              label={{
                value: "Time (s)",
                position: "insideBottom",
                offset: -8,
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
              formatter={(value, name) =>
                typeof value === "number"
                  ? [`${value.toFixed(3)} ${unit}`, String(name)]
                  : ["—", String(name)]
              }
              labelFormatter={(label) => `t = ${Number(label).toFixed(2)} s`}
            />
            <Legend />
            {series.map((s) => (
              <Line
                key={s.slot}
                type="linear"
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

function seriesForTab(chartData: LabSetChartData, tab: ChartTab): SlotChartSeries[] {
  switch (tab) {
    case "acc":
      return chartData.accSeries;
    case "gyro":
      return chartData.gyroSeries;
    case "euler":
      return chartData.eulerSeries;
    case "mag":
      return chartData.magSeries;
  }
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
  const [summary, setSummary] = useState<LabSetPayloadSummary | null>(null);
  const [chartTab, setChartTab] = useState<ChartTab>("acc");

  const loadPayload = useCallback(async () => {
    if (!setRow || !accessToken) return;
    setLoading(true);
    setError(null);
    setChartData(null);
    setSummary(null);
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
      setSummary(buildLabSetPayloadSummary(payload));
      setChartData(buildLabSetChartData(payload));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sensor data");
    } finally {
      setLoading(false);
    }
  }, [setRow, accessToken]);

  useEffect(() => {
    if (open && setRow) {
      setChartTab("acc");
      void loadPayload();
    } else {
      setChartData(null);
      setSummary(null);
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

  const activeChart = CHART_TABS.find((t) => t.id === chartTab) ?? CHART_TABS[0];
  const workWindow = summary?.config.work_window;
  const wearOffsets = summary
    ? Object.entries(summary.config.wear_clock_offset_ms)
    : [];

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
        className="flex h-[90vh] w-[94vw] max-w-7xl flex-col rounded-xl border border-zinc-200 bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="lab-set-viewer-title" className="truncate text-lg font-semibold">
                {setRow.custom_name}
              </h2>
              <Badge className="font-mono">exo {setRow.catalog_exo_id}</Badge>
              {summary && <Badge className="font-mono">schema v{summary.schemaVersion}</Badge>}
            </div>
            <p className="mt-1 text-sm text-zinc-600">
              {setRow.user_name} · {setRow.rep_count} reps · {setRow.weight_kg} kg ·{" "}
              {durationSeconds(setRow.started_at, setRow.ended_at)} DB window ·{" "}
              <span className="font-mono text-xs text-zinc-500">{setRow.id}</span>
            </p>
            <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-400">
              {setRow.storage_path}
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {loading && <p className="text-sm text-zinc-500">Loading schema v1 payload…</p>}
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          {summary && !loading && !error && (
            <>
              <div className="grid gap-4 lg:grid-cols-3">
                <SectionCard title="Ground truth (JSON)">
                  <dl className="grid grid-cols-2 gap-3">
                    <MetaItem
                      label="Catalog exo"
                      value={
                        <span className="font-mono">{summary.groundTruth.catalog_exo_id}</span>
                      }
                    />
                    <MetaItem label="Reps" value={summary.groundTruth.rep_count} />
                    <MetaItem
                      label="Weight"
                      value={`${summary.groundTruth.weight_kg} kg`}
                    />
                    <MetaItem
                      label="DB match"
                      value={
                        summary.groundTruth.catalog_exo_id === setRow.catalog_exo_id &&
                        summary.groundTruth.rep_count === setRow.rep_count &&
                        summary.groundTruth.weight_kg === setRow.weight_kg
                          ? "OK"
                          : "Mismatch"
                      }
                    />
                  </dl>
                </SectionCard>

                <SectionCard title="Capture config">
                  <dl className="grid grid-cols-2 gap-3">
                    <MetaItem label="Timebase" value={summary.config.timebase} />
                    <MetaItem
                      label="Target rate"
                      value={formatHz(summary.config.target_sample_rate_hz)}
                    />
                    <MetaItem label="Prep" value={`${summary.config.prep_seconds}s`} />
                    <MetaItem
                      label="Total samples"
                      value={summary.totalSamples.toLocaleString()}
                    />
                  </dl>
                  <p className="mt-3 text-[11px] text-zinc-500">
                    Orientation / axis fusion live on each slot (BLE WitMotion or Wear), not globally.
                  </p>
                </SectionCard>

                <SectionCard title="Work window">
                  <dl className="grid gap-3">
                    <MetaItem
                      label="Started (wall)"
                      value={formatTs(workWindow?.started_at_ms)}
                    />
                    <MetaItem
                      label="Ended (wall)"
                      value={formatTs(workWindow?.ended_at_ms)}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <MetaItem
                        label="Started (elapsed)"
                        value={
                          workWindow?.started_at_elapsed_ms != null
                            ? `${workWindow.started_at_elapsed_ms} ms`
                            : "—"
                        }
                      />
                      <MetaItem
                        label="Ended (elapsed)"
                        value={
                          workWindow?.ended_at_elapsed_ms != null
                            ? `${workWindow.ended_at_elapsed_ms} ms`
                            : "—"
                        }
                      />
                    </div>
                    <MetaItem label="DB started" value={formatTs(setRow.started_at)} />
                    <MetaItem label="DB labeled" value={formatTs(setRow.labeled_at)} />
                  </dl>
                </SectionCard>
              </div>

              {wearOffsets.length > 0 && (
                <SectionCard title="Wear clock offsets">
                  <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {wearOffsets.map(([slot, offset]) => (
                      <MetaItem
                        key={slot}
                        label={slot.replace(/_/g, " ")}
                        value={<span className="font-mono">{offset} ms</span>}
                      />
                    ))}
                  </dl>
                </SectionCard>
              )}

              <SectionCard
                title="Slots"
                action={
                  <span className="text-xs text-zinc-500">
                    {summary.slotStats.length} active
                  </span>
                }
              >
                {summary.slotStats.length === 0 ? (
                  <p className="text-sm text-zinc-500">No samples in any slot.</p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {summary.slotStats.map((slot) => (
                      <div
                        key={slot.slot}
                        className="rounded-lg border border-zinc-100 bg-zinc-50/80 p-3"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold capitalize text-zinc-900">
                            {slot.slot.replace(/_/g, " ")}
                          </p>
                          <Badge className="font-mono">
                            {slot.sampleCount.toLocaleString()} samples
                          </Badge>
                        </div>
                        <dl className="mb-3 grid grid-cols-2 gap-2">
                          <MetaItem label="Duration" value={formatSeconds(slot.durationSeconds)} />
                          <MetaItem label="Measured" value={formatHz(slot.measuredHz)} />
                        </dl>
                        <SlotDeviceDetails config={summary.config.slots[slot.slot]} />
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              {chartData && (
                <SectionCard title="IMU trajectories">
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {CHART_TABS.map((tab) => {
                      const count = seriesForTab(chartData, tab.id).reduce(
                        (sum, s) => sum + s.points.length,
                        0,
                      );
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setChartTab(tab.id)}
                          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                            chartTab === tab.id
                              ? "bg-zinc-900 text-white"
                              : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                          }`}
                        >
                          {tab.title}
                          <span className="ml-1.5 opacity-70">{count.toLocaleString()}</span>
                        </button>
                      );
                    })}
                  </div>
                  <MagnitudeChart
                    title={activeChart.title}
                    series={seriesForTab(chartData, chartTab)}
                    yLabel={activeChart.yLabel}
                    unit={activeChart.unit}
                  />
                </SectionCard>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
