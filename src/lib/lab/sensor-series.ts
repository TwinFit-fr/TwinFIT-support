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

const SLOT_ORDER = ["left_wrist", "left_ankle"] as const;

const SLOT_COLORS = {
  acc: ["#fca5a5", "#93c5fd"],
  gyro: ["#b91c1c", "#1d4ed8"],
} as const;

function slotLabel(slot: string): string {
  return slot.replace(/_/g, " ");
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
  globalT0Ms: number,
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

  const points: ChartPoint[] = rows.map((row, i) => {
    const t = Math.max(0, (row[0] - globalT0Ms) / 1000);
    const y =
      kind === "acc"
        ? vectorNorm(ax[i], ay[i], az[i])
        : vectorNorm(gx[i], gy[i], gz[i]);
    return { t, y };
  });

  return { slot, slotLabel: slotLabel(slot), kind, color, points };
}

function globalStartMs(slots: Record<string, number[][]>): number {
  let min = Infinity;
  for (const rows of Object.values(slots)) {
    for (const row of rows) {
      min = Math.min(min, row[0]);
    }
  }
  return Number.isFinite(min) ? min : 0;
}

export function parseSensorPayload(raw: unknown): SensorPayload {
  return sensorPayloadSchema.parse(raw);
}

export function buildLabSetChartData(payload: SensorPayload): LabSetChartData {
  const slotKeys = orderedSlotKeys(payload.slots);
  const t0Ms = globalStartMs(payload.slots);
  const accSeries: SlotChartSeries[] = [];
  const gyroSeries: SlotChartSeries[] = [];

  slotKeys.forEach((slot, index) => {
    const rows = payload.slots[slot] ?? [];
    const accColor = SLOT_COLORS.acc[index] ?? SLOT_COLORS.acc[0];
    const gyroColor = SLOT_COLORS.gyro[index] ?? SLOT_COLORS.gyro[0];
    accSeries.push(buildSlotSeries(rows, "acc", slot, accColor, t0Ms));
    gyroSeries.push(buildSlotSeries(rows, "gyro", slot, gyroColor, t0Ms));
  });

  return { accSeries, gyroSeries };
}
