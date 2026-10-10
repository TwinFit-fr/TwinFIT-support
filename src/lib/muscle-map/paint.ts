import type { Raster } from "./mask-ops";

/**
 * Browser-side pixels: load a Storage file into RGBA (through the same-origin file proxy, so
 * the canvas is never tainted) and tint masks over a base.
 */

/** RGBA of a Storage image, stretched to `size` when given (as the server does). */
export async function loadRaster(
  fileId: string,
  token: string,
  size?: { width: number; height: number },
): Promise<Raster> {
  const res = await fetch(`/api/images/files/${fileId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Could not load the image (${res.status})`);
  const bitmap = await createImageBitmap(await res.blob());
  const width = size?.width ?? bitmap.width;
  const height = size?.height ?? bitmap.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return { data: ctx.getImageData(0, 0, width, height).data, width, height };
}

/** `#RRGGBB[AA]` → r, g, b and alpha (0..1). */
export function parsePaintColor(hex: string): [number, number, number, number] {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex.trim());
  if (!match) return [229, 57, 53, 1];
  const rgb = parseInt(match[1], 16);
  const alpha = match[2] ? parseInt(match[2], 16) / 255 : 1;
  return [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255, alpha];
}

/**
 * Blends `color` over `pixels` (RGBA, in place) where the mask is: tint = mask alpha × color
 * alpha. Pixels the base leaves transparent take the tint as they are.
 */
export function tintInPlace(
  pixels: Uint8ClampedArray,
  mask: ArrayLike<number>,
  color: string,
) {
  const [r, g, b, a] = parsePaintColor(color);
  for (let i = 0; i < mask.length; i++) {
    const t = (mask[i] / 255) * a;
    if (t <= 0) continue;
    const p = i * 4;
    const under = pixels[p + 3] / 255;
    const out = t + under * (1 - t);
    pixels[p] = (r * t + pixels[p] * under * (1 - t)) / out;
    pixels[p + 1] = (g * t + pixels[p + 1] * under * (1 - t)) / out;
    pixels[p + 2] = (b * t + pixels[p + 2] * under * (1 - t)) / out;
    pixels[p + 3] = out * 255;
  }
}

/** Draws RGBA pixels onto a canvas, resizing the canvas to them. */
export function drawPixels(
  canvas: HTMLCanvasElement,
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
}

/** Margin around the painted masks when cropping a preview (fraction of the base side). */
export const CROP_MARGIN = 0.04;

/** Union of the painted masks' boxes plus a margin, inside the image; null when none. */
export function cropRect(
  rects: Array<{ x: number; y: number; w: number; h: number } | null>,
  margin = CROP_MARGIN,
): { x: number; y: number; w: number; h: number } | null {
  const boxes = rects.filter((r): r is NonNullable<typeof r> => r !== null);
  if (boxes.length === 0) return null;
  const x0 = Math.max(0, Math.min(...boxes.map((r) => r.x)) - margin);
  const y0 = Math.max(0, Math.min(...boxes.map((r) => r.y)) - margin);
  const x1 = Math.min(1, Math.max(...boxes.map((r) => r.x + r.w)) + margin);
  const y1 = Math.min(1, Math.max(...boxes.map((r) => r.y + r.h)) + margin);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
