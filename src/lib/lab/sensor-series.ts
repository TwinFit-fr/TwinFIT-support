import { z } from "zod";
import { lowpassColumn, vectorNorm } from "@/lib/lab/signal-filter";

const sampleRowSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);

const sensorPayloadSchema = z.object({
  slots: z.record(z.string(), z.array(sampleRowSchema)),
});

export type SensorPayload = z.infer<typeof sensorPayloadSchema>;

export type ChartPoint = { t: number; y: number };

export type SlotChartSeries = {
  slot: string;
  slotLabel: string;
  kind: "acc" | "gyro";
  color: string;
  points: ChartPoint[];
};

export type LabSetChartData = {
  accSeries: SlotChartSeries[];
  gyroSeries: SlotChartSeries[];
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

function buildSlotSeries(
  rows: number[][],
  kind: "acc" | "gyro",
  slot: string,
  color: string,
  slotT0Ms: number,
): SlotChartSeries {
  if (!rows.length) {
    return { slot, slotLabel: slotLabel(slot), kind, color, points: [] };
  }

  const ax = lowpassColumn(rows.map((r) => r[1]));
  const ay = lowpassColumn(rows.map((r) => r[2]));
  const az = lowpassColumn(rows.map((r) => r[3]));
  const gx = lowpassColumn(rows.map((r) => r[4]));
  const gy = lowpassColumn(rows.map((r) => r[5]));
  const gz = lowpassColumn(rows.map((r) => r[6]));

  const points: ChartPoint[] = rows
    .map((row, i) => {
      const t = Math.max(0, msToSecondsRounded(row[0] - slotT0Ms));
      const y =
        kind === "acc"
          ? vectorNorm(ax[i], ay[i], az[i])
          : vectorNorm(gx[i], gy[i], gz[i]);
      return { t, y };
    })
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.y))
    .sort((a, b) => a.t - b.t);

  return { slot, slotLabel: slotLabel(slot), kind, color, points };
}

/** First timestamp in a slot — clocks differ between BLE (monotonic) and Wear (epoch). */
function slotStartMs(rows: number[][]): number {
  let min = Infinity;
  for (const row of rows) {
    min = Math.min(min, row[0]);
  }
  return Number.isFinite(min) ? min : 0;
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

export function parseSensorPayload(raw: unknown): SensorPayload {
  return sensorPayloadSchema.parse(raw);
}

export function buildLabSetChartData(payload: SensorPayload): LabSetChartData {
  const slotKeys = orderedSlotKeys(payload.slots);
  const accSeries: SlotChartSeries[] = [];
  const gyroSeries: SlotChartSeries[] = [];

  slotKeys.forEach((slot, index) => {
    const rows = payload.slots[slot] ?? [];
    const slotT0Ms = slotStartMs(rows);
    const accColor = SLOT_COLORS.acc[index] ?? SLOT_COLORS.acc[0];
    const gyroColor = SLOT_COLORS.gyro[index] ?? SLOT_COLORS.gyro[0];
    accSeries.push(buildSlotSeries(rows, "acc", slot, accColor, slotT0Ms));
    gyroSeries.push(buildSlotSeries(rows, "gyro", slot, gyroColor, slotT0Ms));
  });

  return { accSeries, gyroSeries };
}
