import sharp from "sharp";

/** A decoded frame at analysis size: RGBA bytes plus its alpha mask (1 = drawn). */
export type Frame = {
  size: number;
  rgba: Uint8Array;
  mask: Uint8Array;
};

export type Box = { x0: number; y0: number; x1: number; y1: number };

/** Alpha above this counts as drawn (soft edges and halos below it do not). */
export const ALPHA_ON = 128;

/** Decodes any image to a square `size` frame, keeping its aspect inside a transparent canvas. */
export async function loadFrame(input: Buffer | Uint8Array, size = 256): Promise<Frame> {
  const data = await sharp(input)
    .ensureAlpha()
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer();
  return frameFromRgba(new Uint8Array(data), size);
}

export function frameFromRgba(rgba: Uint8Array, size: number): Frame {
  const mask = new Uint8Array(size * size);
  for (let i = 0; i < mask.length; i++) mask[i] = rgba[i * 4 + 3] >= ALPHA_ON ? 1 : 0;
  return { size, rgba, mask };
}

/** Bounding box of the drawn pixels, or null for an empty mask. */
export function bbox(mask: Uint8Array, size: number): Box | null {
  let x0 = size, y0 = size, x1 = -1, y1 = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!mask[y * size + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

export function area(mask: Uint8Array): number {
  let n = 0;
  for (const v of mask) n += v;
  return n;
}

/** Intersection over union of two masks inside `win` (whole frame when omitted). */
export function iou(a: Uint8Array, b: Uint8Array, size: number, win?: Box): number {
  const w = win ?? { x0: 0, y0: 0, x1: size - 1, y1: size - 1 };
  let inter = 0, union = 0;
  for (let y = w.y0; y <= w.y1; y++) {
    for (let x = w.x0; x <= w.x1; x++) {
      const i = y * size + x;
      inter += a[i] & b[i];
      union += a[i] | b[i];
    }
  }
  return union === 0 ? 1 : inter / union;
}

/**
 * Mask of `src` after scaling by `scale` about `pivot` and shifting by (dx, dy) pixels,
 * nearest-neighbour sampled into the same square canvas.
 */
export function transformMask(
  src: Uint8Array,
  size: number,
  t: { scale: number; dx: number; dy: number },
  pivot: { x: number; y: number },
): Uint8Array {
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    const sy = Math.round((y - t.dy - pivot.y) / t.scale + pivot.y);
    if (sy < 0 || sy >= size) continue;
    for (let x = 0; x < size; x++) {
      const sx = Math.round((x - t.dx - pivot.x) / t.scale + pivot.x);
      if (sx < 0 || sx >= size) continue;
      out[y * size + x] = src[sy * size + sx];
    }
  }
  return out;
}

/** IoU inside `win` of `a` and `b` transformed as in {@link transformMask}, without building the mask. */
export function iouTransformed(
  a: Uint8Array,
  b: Uint8Array,
  size: number,
  t: { scale: number; dx: number; dy: number },
  pivot: { x: number; y: number },
  win: Box,
): number {
  let inter = 0, union = 0;
  for (let y = win.y0; y <= win.y1; y++) {
    const sy = Math.round((y - t.dy - pivot.y) / t.scale + pivot.y);
    const rowOk = sy >= 0 && sy < size;
    for (let x = win.x0; x <= win.x1; x++) {
      const av = a[y * size + x];
      let bv = 0;
      if (rowOk) {
        const sx = Math.round((x - t.dx - pivot.x) / t.scale + pivot.x);
        if (sx >= 0 && sx < size) bv = b[sy * size + sx];
      }
      inter += av & bv;
      union += av | bv;
    }
  }
  return union === 0 ? 1 : inter / union;
}
