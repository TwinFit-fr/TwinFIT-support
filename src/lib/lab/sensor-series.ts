import { z } from "zod";
import { lowpassColumn, vectorNorm } from "@/lib/lab/signal-filter";

/** Normative Lab Storage sample layout (`schema_version: 1`). */
export const SAMPLE_LAYOUT_V1 = [
  "tsMs",
  "ax",
  "ay",
  "az",
  "gx",
  "gy",
  "gz",
  "roll",
  "pitch",
  "yaw",
  "qw",
  "qx",
  "qy",
  "qz",
  "mx",
  "my",
  "mz",
] as const;

export const SAMPLE_COLUMN_COUNT_V1 = SAMPLE_LAYOUT_V1.length;

export const SAMPLE_INDEX = {
  tsMs: 0,
  ax: 1,
  ay: 2,
  az: 3,
  gx: 4,
  gy: 5,
  gz: 6,
  roll: 7,
  pitch: 8,
  yaw: 9,
  qw: 10,
  qx: 11,
  qy: 12,
  qz: 13,
  mx: 14,
  my: 15,
  mz: 16,
} as const;

/** Lab may encode missing channels as JSON null or non-standard NaN literals. */
const sampleValueSchema = z.preprocess((value) => {
  if (value === null || value === undefined || value === "NaN" || value === "nan") {
    return Number.NaN;
  }
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return value;
}, // z.number() rejects NaN; missing channels must stay as Number.NaN for plotting.
z.custom<number>(
  (value) => typeof value === "number",
  { message: "Expected number (finite or NaN for missing channel)" },
));

const sampleRowSchema = z
  .array(sampleValueSchema)
  .length(SAMPLE_COLUMN_COUNT_V1, {
    message: `Each sample must have ${SAMPLE_COLUMN_COUNT_V1} values (Lab schema v1)`,
  });

/** BLE-only applied WitMotion settings. orientation / axis_algorithm are derived labels. */
const witmotionConfigSchema = z.object({
  rate_reg: z.string().optional(),
  install_orientation_reg: z.string().optional(),
  axis6_reg: z.string().optional(),
  content_reg_0x96: z.string().optional(),
  orientation: z.string().optional(),
  axis_algorithm: z.string().optional(),
});

/**
 * Wear-only runtime snapshot. Fields may be omitted when unknown
 * (e.g. orientation_fusion) — do not invent BLE install-orientation here.
 */
const wearConfigSchema = z.object({
  sensors: z.array(z.string()).optional(),
  magnetic_field_available: z.boolean().optional(),
  requested_sample_rate_hz: z.number().optional(),
  orientation_fusion: z.string().optional(),
});

const slotConfigSchema = z.object({
  transport: z.enum(["ble", "wear"]),
  device_id: z.string(),
  display_name: z.string(),
  mac_address: z.string().optional(),
  wear_node_id: z.string().optional(),
  witmotion: witmotionConfigSchema.optional(),
  wear: wearConfigSchema.optional(),
});

const workWindowSchema = z.object({
  started_at_ms: z.number().optional(),
  ended_at_ms: z.number().optional(),
  started_at_elapsed_ms: z.number().optional(),
  ended_at_elapsed_ms: z.number().optional(),
});

const groundTruthSchema = z.object({
  catalog_exo_id: z.number().int(),
  rep_count: z.number().int(),
  weight_kg: z.number(),
});

/** Global capture config — no orientation / axis_algorithm (those are per-slot / transport-specific). */
const configSchema = z.object({
  timebase: z.literal("phone_elapsed_realtime_ms"),
  wear_clock_offset_ms: z.record(z.string(), z.number()).default({}),
  target_sample_rate_hz: z.number(),
  measured_sample_rate_hz: z.record(z.string(), z.number()).default({}),
  prep_seconds: z.number().int(),
  work_window: workWindowSchema.default({}),
  slots: z.record(z.string(), slotConfigSchema).default({}),
});

const labSetPayloadSchema = z.object({
  schema_version: z.literal(1),
  sample_layout: z
    .array(z.string())
    .refine(
      (layout) =>
        layout.length === SAMPLE_LAYOUT_V1.length &&
        SAMPLE_LAYOUT_V1.every((name, i) => layout[i] === name),
      { message: "sample_layout must match Lab schema v1" },
    ),
  ground_truth: groundTruthSchema,
  config: configSchema,
  slots: z.record(z.string(), z.array(sampleRowSchema)),
});

export type LabSetPayloadV1 = z.infer<typeof labSetPayloadSchema>;
export type LabSetGroundTruth = z.infer<typeof groundTruthSchema>;
export type LabSetCaptureConfig = z.infer<typeof configSchema>;
export type LabSetSlotConfig = z.infer<typeof slotConfigSchema>;

/** @deprecated Prefer LabSetPayloadV1 — kept as alias for chart helpers. */
export type SensorPayload = LabSetPayloadV1;

export type ChartPoint = { t: number; y: number };

export type SlotChartSeries = {
  slot: string;
  slotLabel: string;
  kind: "acc" | "gyro" | "euler" | "mag";
  color: string;
  points: ChartPoint[];
};

export type LabSetChartData = {
  accSeries: SlotChartSeries[];
  gyroSeries: SlotChartSeries[];
  eulerSeries: SlotChartSeries[];
  magSeries: SlotChartSeries[];
};

export type SlotSampleStats = {
  slot: string;
  sampleCount: number;
  durationSeconds: number | null;
  measuredHz: number | null;
  transport: string | null;
  deviceLabel: string | null;
};

export type LabSetPayloadSummary = {
  schemaVersion: 1;
  groundTruth: LabSetGroundTruth;
  config: LabSetCaptureConfig;
  slotStats: SlotSampleStats[];
  totalSamples: number;
};

/** One row per sample index — Recharts needs a shared `data` array on LineChart. */
export type MergedChartRow = { t: number } & Record<string, number | undefined>;

export function mergeSeriesBySampleIndex(series: SlotChartSeries[]): MergedChartRow[] {
  if (!series.length) return [];

  const maxLen = Math.max(...series.map((s) => s.points.length));
  const rows: MergedChartRow[] = [];

  for (let i = 0; i < maxLen; i++) {
    let t: number | null = null;
    const row: MergedChartRow = { t: 0 };

    for (const s of series) {
      const p = s.points[i];
      if (p == null || !Number.isFinite(p.y)) continue;
      row[s.slot] = p.y;
      t = t == null ? p.t : Math.min(t, p.t);
    }

    if (t != null) {
      row.t = t;
      rows.push(row);
    }
  }

  return rows;
}

const SLOT_ORDER = ["left_wrist", "left_ankle"] as const;

const SLOT_COLORS = {
  acc: ["#fca5a5", "#93c5fd"],
  gyro: ["#b91c1c", "#1d4ed8"],
  euler: ["#c2410c", "#0369a1"],
  mag: ["#a16207", "#5b21b6"],
} as const;

function slotLabel(slot: string): string {
  return slot.replace(/_/g, " ");
}

/** Milliseconds → seconds, rounded to 2 decimal places. */
export function msToSecondsRounded(ms: number): number {
  return Math.round((ms / 1000) * 100) / 100;
}

function orderedSlotKeys(slots: Record<string, unknown[]>): string[] {
  const keys = Object.keys(slots).filter((k) => (slots[k]?.length ?? 0) > 0);
  const ordered: string[] = [];
  for (const preferred of SLOT_ORDER) {
    if (keys.includes(preferred)) ordered.push(preferred);
  }
  for (const key of keys.sort()) {
    if (!ordered.includes(key)) ordered.push(key);
  }
  return ordered;
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function columnOrNaN(rows: number[][], index: number): number[] {
  return rows.map((r) => {
    const v = r[index];
    return typeof v === "number" ? v : Number.NaN;
  });
}

function lowpassFinite(values: number[]): number[] {
  if (!values.some((v) => Number.isFinite(v))) {
    return values.map(() => Number.NaN);
  }
  // Replace gaps with nearest finite so filtfilt stays stable; restore NaN after.
  const filled = [...values];
  let last = filled.find((v) => Number.isFinite(v)) ?? 0;
  for (let i = 0; i < filled.length; i++) {
    if (Number.isFinite(filled[i])) last = filled[i];
    else filled[i] = last;
  }
  const filtered = lowpassColumn(filled);
  return filtered.map((v, i) => (Number.isFinite(values[i]) ? v : Number.NaN));
}

function buildSlotSeries(
  rows: number[][],
  kind: SlotChartSeries["kind"],
  slot: string,
  color: string,
  slotT0Ms: number,
): SlotChartSeries {
  if (!rows.length) {
    return { slot, slotLabel: slotLabel(slot), kind, color, points: [] };
  }

  let x: number[];
  let y: number[];
  let z: number[];

  switch (kind) {
    case "acc":
      x = lowpassFinite(columnOrNaN(rows, SAMPLE_INDEX.ax));
      y = lowpassFinite(columnOrNaN(rows, SAMPLE_INDEX.ay));
      z = lowpassFinite(columnOrNaN(rows, SAMPLE_INDEX.az));
      break;
    case "gyro":
      x = lowpassFinite(columnOrNaN(rows, SAMPLE_INDEX.gx));
      y = lowpassFinite(columnOrNaN(rows, SAMPLE_INDEX.gy));
      z = lowpassFinite(columnOrNaN(rows, SAMPLE_INDEX.gz));
      break;
    case "euler":
      x = lowpassFinite(columnOrNaN(rows, SAMPLE_INDEX.roll));
      y = lowpassFinite(columnOrNaN(rows, SAMPLE_INDEX.pitch));
      z = lowpassFinite(columnOrNaN(rows, SAMPLE_INDEX.yaw));
      break;
    case "mag":
      x = lowpassFinite(columnOrNaN(rows, SAMPLE_INDEX.mx));
      y = lowpassFinite(columnOrNaN(rows, SAMPLE_INDEX.my));
      z = lowpassFinite(columnOrNaN(rows, SAMPLE_INDEX.mz));
      break;
  }

  const points: ChartPoint[] = rows
    .map((row, i) => {
      const t = Math.max(0, msToSecondsRounded(row[SAMPLE_INDEX.tsMs] - slotT0Ms));
      const xi = x[i];
      const yi = y[i];
      const zi = z[i];
      if (!Number.isFinite(xi) || !Number.isFinite(yi) || !Number.isFinite(zi)) {
        return { t, y: Number.NaN };
      }
      return { t, y: vectorNorm(xi, yi, zi) };
    })
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.y))
    .sort((a, b) => a.t - b.t);

  return { slot, slotLabel: slotLabel(slot), kind, color, points };
}

/** First timestamp in a slot — shared phone elapsedRealtime timebase in v1. */
function slotStartMs(rows: number[][]): number {
  let min = Infinity;
  for (const row of rows) {
    const ts = row[SAMPLE_INDEX.tsMs];
    if (Number.isFinite(ts)) min = Math.min(min, ts);
  }
  return Number.isFinite(min) ? min : 0;
}

function slotDurationSeconds(rows: number[][]): number | null {
  if (rows.length < 2) return rows.length === 1 ? 0 : null;
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    const ts = row[SAMPLE_INDEX.tsMs];
    if (!Number.isFinite(ts)) continue;
    min = Math.min(min, ts);
    max = Math.max(max, ts);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return null;
  return msToSecondsRounded(max - min);
}

export function maxSeriesTimeSeconds(series: SlotChartSeries[]): number {
  let max = 0;
  for (const s of series) {
    for (const p of s.points) {
      if (p.t > max) max = p.t;
    }
  }
  return max;
}

export function parseSensorPayload(raw: unknown): LabSetPayloadV1 {
  const result = labSetPayloadSchema.safeParse(raw);
  if (result.success) return result.data;

  const first = result.error.issues[0];
  const path = first?.path?.length ? first.path.join(".") : "payload";
  const detail = first?.message ?? "invalid";
  throw new Error(`Invalid Lab schema v1 (${path}: ${detail})`);
}

export function buildLabSetPayloadSummary(payload: LabSetPayloadV1): LabSetPayloadSummary {
  const slotKeys = orderedSlotKeys(payload.slots);
  const slotStats: SlotSampleStats[] = slotKeys.map((slot) => {
    const rows = payload.slots[slot] ?? [];
    const slotCfg = payload.config.slots[slot];
    return {
      slot,
      sampleCount: rows.length,
      durationSeconds: slotDurationSeconds(rows),
      measuredHz: finiteOrNull(payload.config.measured_sample_rate_hz[slot] ?? Number.NaN),
      transport: slotCfg?.transport ?? null,
      deviceLabel: slotCfg?.display_name ?? null,
    };
  });

  return {
    schemaVersion: 1,
    groundTruth: payload.ground_truth,
    config: payload.config,
    slotStats,
    totalSamples: slotStats.reduce((sum, s) => sum + s.sampleCount, 0),
  };
}

export function buildLabSetChartData(payload: LabSetPayloadV1): LabSetChartData {
  const slotKeys = orderedSlotKeys(payload.slots);
  const accSeries: SlotChartSeries[] = [];
  const gyroSeries: SlotChartSeries[] = [];
  const eulerSeries: SlotChartSeries[] = [];
  const magSeries: SlotChartSeries[] = [];

  slotKeys.forEach((slot, index) => {
    const rows = payload.slots[slot] ?? [];
    const slotT0Ms = slotStartMs(rows);
    accSeries.push(
      buildSlotSeries(rows, "acc", slot, SLOT_COLORS.acc[index] ?? SLOT_COLORS.acc[0], slotT0Ms),
    );
    gyroSeries.push(
      buildSlotSeries(rows, "gyro", slot, SLOT_COLORS.gyro[index] ?? SLOT_COLORS.gyro[0], slotT0Ms),
    );
    eulerSeries.push(
      buildSlotSeries(
        rows,
        "euler",
        slot,
        SLOT_COLORS.euler[index] ?? SLOT_COLORS.euler[0],
        slotT0Ms,
      ),
    );
    magSeries.push(
      buildSlotSeries(rows, "mag", slot, SLOT_COLORS.mag[index] ?? SLOT_COLORS.mag[0], slotT0Ms),
    );
  });

  return { accSeries, gyroSeries, eulerSeries, magSeries };
}
