import type { Box } from "./mask.ts";

/** The part of a frame that must not move between Start, Mid and End. */
export type AnchorKind =
  /** Feet on the floor: the lowest band of the drawing. */
  | "floor"
  /** Bench, machine or step plus whatever rests on the floor: a deeper lowest band. */
  | "support"
  /** Pull-up or parallel bar the athlete hangs from or presses on: the highest band. */
  | "bar"
  /** Everything moves (or unknown): align the whole silhouette. */
  | "whole";

export type ExerciseMeta = {
  supportCode?: string | null;
  positionCode?: string | null;
  equipmentCode?: string | null;
};

const BAR_SUPPORTS = new Set(["PULL_UP_BAR", "PARALLEL_BAR"]);
const FLOOR_SUPPORTS = new Set(["BENCH", "HYPEREXTENSION_BENCH", "STEP"]);
const LYING = new Set(["SUPINE", "PRONE", "INCLINE", "DECLINE"]);
const MACHINES = new Set(["MACHINE", "SMITH_MACHINE", "LEG_PRESS_MACHINE", "CABLE", "BICYCLE", "LANDMINE"]);

/** Which region anchors the exercise, from its catalog taxonomy. */
export function anchorFor(meta: ExerciseMeta): AnchorKind {
  const support = meta.supportCode?.toUpperCase() ?? "";
  const position = meta.positionCode?.toUpperCase() ?? "";
  const equipment = meta.equipmentCode?.toUpperCase() ?? "";
  if (BAR_SUPPORTS.has(support)) return "bar";
  if (FLOOR_SUPPORTS.has(support) || LYING.has(position) || MACHINES.has(equipment)) {
    return "support";
  }
  return "floor";
}

/** Share of the drawing's height each anchor band takes. */
const BAND: Record<Exclude<AnchorKind, "whole">, number> = { floor: 0.2, support: 0.3, bar: 0.12 };

/** The anchor window inside the Start drawing's bounding box, padded sideways by `pad` px. */
export function anchorWindow(kind: AnchorKind, box: Box, size: number, pad = 4): Box {
  const clamp = (v: number) => Math.max(0, Math.min(size - 1, v));
  const x0 = clamp(box.x0 - pad), x1 = clamp(box.x1 + pad);
  if (kind === "whole") return { x0, x1, y0: clamp(box.y0 - pad), y1: clamp(box.y1 + pad) };
  const h = Math.max(4, Math.round((box.y1 - box.y0 + 1) * BAND[kind]));
  return kind === "bar"
    ? { x0, x1, y0: clamp(box.y0 - pad), y1: clamp(box.y0 + h) }
    : { x0, x1, y0: clamp(box.y1 - h), y1: clamp(box.y1 + pad) };
}
