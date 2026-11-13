import { anchorWindow, type AnchorKind } from "./anchors.ts";
import { bbox, iou, iouTransformed, transformMask, type Box, type Frame } from "./mask.ts";

/** Scale and shift that bring a frame onto the Start; shifts are fractions of the frame side. */
export type Registration = {
  anchor: AnchorKind;
  scale: number;
  dx: number;
  dy: number;
  /** Pivot of the scale, as fractions of the side (the anchor's bottom or top centre). */
  pivot: { x: number; y: number };
  /** Anchor IoU before and after the correction. */
  iouBefore: number;
  iouAfter: number;
  /** The best fit sits on the edge of the search range: a re-framed frame, not a small drift. */
  atLimit: boolean;
  window: Box;
};

export const LIMITS = { scale: 0.08, shift: 0.06 };

function search(
  start: Uint8Array,
  cand: Uint8Array,
  size: number,
  win: Box,
  pivot: { x: number; y: number },
  scales: number[],
  shifts: number[],
  base = { scale: 1, dx: 0, dy: 0 },
) {
  let best = { ...base, score: -1 };
  for (const ds of scales) {
    for (const ox of shifts) {
      for (const oy of shifts) {
        const t = { scale: base.scale + ds, dx: base.dx + ox, dy: base.dy + oy };
        const score = iouTransformed(start, cand, size, t, pivot, win);
        // Ties go to the smaller correction.
        const tie = score === best.score && Math.abs(t.scale - 1) + Math.abs(t.dx) + Math.abs(t.dy) <
          Math.abs(best.scale - 1) + Math.abs(best.dx) + Math.abs(best.dy);
        if (score > best.score || tie) best = { ...t, score };
      }
    }
  }
  return best;
}

const range = (max: number, step: number) => {
  const out: number[] = [];
  for (let v = -max; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e4) / 1e4);
  return out;
};

/**
 * Finds the scale and shift that best overlay `cand` on `start` inside the start's anchor window
 * (coarse grid, then a fine one around the best point).
 */
export function register(start: Frame, cand: Frame, anchor: AnchorKind): Registration | null {
  const { size } = start;
  const box = bbox(start.mask, size);
  if (!box || !bbox(cand.mask, size)) return null;
  const win = anchorWindow(anchor, box, size);
  const pivotPx = {
    x: (win.x0 + win.x1) / 2,
    y: anchor === "bar" ? win.y0 : anchor === "whole" ? (win.y0 + win.y1) / 2 : win.y1,
  };
  const maxShift = Math.round(LIMITS.shift * size);
  const coarseStep = Math.max(1, Math.round(size / 128));
  const coarse = search(
    start.mask, cand.mask, size, win, pivotPx,
    range(LIMITS.scale, 0.02), range(maxShift, coarseStep),
  );
  const fine = search(
    start.mask, cand.mask, size, win, pivotPx,
    range(0.015, 0.005), range(coarseStep, 1), coarse,
  );
  const iouBefore = iou(start.mask, cand.mask, size, win);
  // Keep the identity unless the correction really improves the fit.
  const useFit = fine.score > iouBefore + 0.005;
  const t = useFit ? fine : { scale: 1, dx: 0, dy: 0, score: iouBefore };
  const atLimit =
    useFit &&
    (Math.abs(t.scale - 1) >= LIMITS.scale - 0.006 ||
      Math.abs(t.dx) >= maxShift - 1 ||
      Math.abs(t.dy) >= maxShift - 1);
  return {
    anchor,
    scale: Math.round(t.scale * 1000) / 1000,
    dx: Math.round((t.dx / size) * 1e4) / 1e4,
    dy: Math.round((t.dy / size) * 1e4) / 1e4,
    pivot: { x: pivotPx.x / size, y: pivotPx.y / size },
    iouBefore: Math.round(iouBefore * 1000) / 1000,
    iouAfter: Math.round(t.score * 1000) / 1000,
    atLimit,
    window: win,
  };
}

/** Applies a registration to a frame's mask (for metrics after the correction). */
export function applyToMask(frame: Frame, reg: Registration): Uint8Array {
  const { size } = frame;
  return transformMask(
    frame.mask,
    size,
    { scale: reg.scale, dx: reg.dx * size, dy: reg.dy * size },
    { x: reg.pivot.x * size, y: reg.pivot.y * size },
  );
}
