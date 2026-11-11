import type { PointId } from "./pose-points.ts";

/**
 * Which body point a pointer means, on screen. The points' hit areas are circles of at least
 * `HIT_MIN_PX`; where two of them overlap (a hand by the head, the knees of a far-away body) the
 * point whose centre is nearest wins, so every point stays grabbable at any zoom: press on its dot
 * and you get it. Dots shrink when the points crowd together so they never merge into one blob.
 */

export type XY = { x: number; y: number };
export type ScreenPoints = Partial<Record<PointId, XY>>;

/** Hit circle diameter, CSS pixels: never under 24 (WCAG 2.5.8), larger when the point has room. */
export const HIT_MIN_PX = 24;
export const HIT_MAX_PX = 32;

/** Ties (two centres equally near) go to the point people grab most: hands and feet first. */
const PRIORITY: Record<PointId, number> = {
  left_hand: 0,
  right_hand: 0,
  left_foot: 1,
  right_foot: 1,
  head: 2,
  hips: 2,
  left_elbow: 3,
  right_elbow: 3,
  left_knee: 3,
  right_knee: 3,
  chest: 4,
};

/**
 * The point under `at`: the one with the nearest centre among those whose hit circle contains it
 * (`radius` of each point, default half of `HIT_MAX_PX`), or null on empty space.
 */
export function pickPoint(points: ScreenPoints, at: XY, radius: (id: PointId) => number = () => HIT_MAX_PX / 2): PointId | null {
  let best: PointId | null = null;
  let bestD = Infinity;
  for (const [id, p] of Object.entries(points) as [PointId, XY][]) {
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    if (d > radius(id)) continue;
    if (d < bestD - 0.5 || (Math.abs(d - bestD) <= 0.5 && best !== null && PRIORITY[id] < PRIORITY[best])) {
      best = id;
      bestD = d;
    }
  }
  return best;
}

/** Distance from each point to its nearest neighbour on screen, CSS pixels (Infinity when alone). */
export function neighbourGaps(points: ScreenPoints): Partial<Record<PointId, number>> {
  const entries = Object.entries(points) as [PointId, XY][];
  const out: Partial<Record<PointId, number>> = {};
  for (const [id] of entries) out[id] = Infinity;
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const [a, pa] = entries[i];
      const [b, pb] = entries[j];
      const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
      if (d < out[a]!) out[a] = d;
      if (d < out[b]!) out[b] = d;
    }
  }
  return out;
}

/** Hit circle diameter for a point with this gap to its nearest neighbour: as large as fits, within 24..32 px. */
export function hitSize(gap: number): number {
  return Math.round(Math.min(HIT_MAX_PX, Math.max(HIT_MIN_PX, gap)));
}

/** Scale of a point's dot (1 = full size, 12 px): it shrinks when crowded, down to 0.55, so neighbours stay apart. */
export function dotScale(gap: number): number {
  const s = (gap * 0.5) / 12;
  return Math.round(Math.min(1, Math.max(0.55, s)) * 20) / 20;
}

/** Arrow-key nudge sizes on screen, CSS pixels: a step always shows, whatever the zoom. */
export const NUDGE_PX = { fine: 4, coarse: 20 } as const;
/** ...and never more than this in the world (a very close camera), never less than 2 mm (metres). */
export const NUDGE_LIMIT_M = { min: 0.002, max: 0.05 } as const;

/** World length of a nudge for a point drawn at `metresPerPixel`. */
export function nudgeMetres(metresPerPixel: number, coarse: boolean): number {
  const px = coarse ? NUDGE_PX.coarse : NUDGE_PX.fine;
  const max = coarse ? NUDGE_LIMIT_M.max * 5 : NUDGE_LIMIT_M.max;
  return Math.min(max, Math.max(NUDGE_LIMIT_M.min, px * metresPerPixel));
}

/**
 * Whether the next nudge starts from the previous nudge's aim (true) or from where the point is:
 * from the aim while the body keeps up with it on screen (a step the body only part-reached does
 * not shrink the next one), else from the point (one held at a limit does not pile up steps).
 */
export function nudgeKeepsAim(now: XY, aim: XY | null, stepPx: number): boolean {
  return aim !== null && Math.hypot(aim.x - now.x, aim.y - now.y) <= stepPx * 1.5;
}

/** A dragged point this far from the pointer (CSS pixels) is at the limit of what the body can do: the stage then shows how far the pointer is. */
export const OUT_OF_REACH_PX = 10;
