import sharp from "sharp";
import type { Raster } from "./mask-ops";

/** Server-side pixel IO for masks (sharp); the mask math itself lives in `mask-ops`. */

export async function imageSize(bytes: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(bytes).metadata();
  if (!meta.width || !meta.height) throw new Error("Could not read the image size");
  return { width: meta.width, height: meta.height };
}

/**
 * RGBA pixels of an image, stretched to `size` when given (a model output of another size than
 * its base is scaled onto the base).
 */
export async function decodeRgba(
  bytes: Buffer,
  size?: { width: number; height: number },
): Promise<Raster> {
  let pipeline = sharp(bytes).ensureAlpha();
  if (size) pipeline = pipeline.resize(size.width, size.height, { fit: "fill" });
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

/** PNG of a mask: alpha is the muscle, RGB (gray) its volume shade. */
export async function encodeMaskPng(
  alpha: Uint8ClampedArray,
  shade: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Buffer> {
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < alpha.length; i++) {
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = shade[i];
    rgba[i * 4 + 3] = alpha[i];
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}
