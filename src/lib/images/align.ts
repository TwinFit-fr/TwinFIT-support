import sharp, { type Sharp } from "sharp";

/** Every frame is shifted so the lowest drawn pixel (feet / shadow) sits at this height ratio. */
export const FEET_BASELINE = 0.95;

const ALPHA_THRESHOLD = 24;
const COLOR_THRESHOLD = 40;
const MIN_ROW_PIXELS = 3;
const MIN_SHIFT_PX = 2;

export type ImageFormat = "png" | "webp" | "jpeg";

export type Rgba = {
  data: Buffer;
  width: number;
  height: number;
  /** Background sampled from the top-left pixel. */
  bg: [number, number, number, number];
  transparentBg: boolean;
  isContent: (x: number, y: number) => boolean;
};

export async function readRgba(input: Buffer): Promise<Rgba> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bg: Rgba["bg"] = [data[0], data[1], data[2], data[3]];
  const transparentBg = bg[3] < 128;
  const { width, height } = info;
  const isContent = (x: number, y: number) => {
    const o = (y * width + x) * 4;
    if (transparentBg) return data[o + 3] > ALPHA_THRESHOLD;
    return (
      Math.abs(data[o] - bg[0]) + Math.abs(data[o + 1] - bg[1]) + Math.abs(data[o + 2] - bg[2]) >
      COLOR_THRESHOLD
    );
  };
  return { data, width, height, bg, transparentBg, isContent };
}

export function backgroundFill(img: Pick<Rgba, "bg" | "transparentBg">) {
  return img.transparentBg
    ? { r: 0, g: 0, b: 0, alpha: 0 }
    : { r: img.bg[0], g: img.bg[1], b: img.bg[2], alpha: 1 };
}

export function encode(
  pipeline: Sharp,
  format: ImageFormat,
  quality: number,
  bg: Rgba["bg"],
): Promise<Buffer> {
  if (format === "jpeg") {
    return pipeline
      .flatten({ background: { r: bg[0], g: bg[1], b: bg[2] } })
      .jpeg({ quality: Math.max(1, quality) })
      .toBuffer();
  }
  if (format === "webp") {
    return pipeline.webp(quality >= 100 ? { lossless: true } : { quality }).toBuffer();
  }
  return pipeline.png().toBuffer();
}

export type AlignResult = { bytes: Buffer; shiftPx: number };

/**
 * Vertically translates the image so the feet land on a fixed baseline, without scaling.
 * The shift is capped so content touching the top (raised arms, equipment) is never cropped.
 */
export async function alignFeetBaseline(
  input: Buffer,
  format: ImageFormat,
  quality: number,
  /** Re-encode even when no shift is needed (input is an intermediate format). */
  alwaysEncode = false,
): Promise<AlignResult> {
  const img = await readRgba(input);
  const { data, width, height } = img;

  let top = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width && count < MIN_ROW_PIXELS; x++) {
      if (img.isContent(x, y)) count++;
    }
    if (count >= MIN_ROW_PIXELS) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  let shift = bottom < 0 ? 0 : Math.round(height * FEET_BASELINE) - 1 - bottom;
  if (shift < 0) shift = Math.max(shift, -top);
  if (Math.abs(shift) < MIN_SHIFT_PX) {
    if (!alwaysEncode) return { bytes: input, shiftPx: 0 };
    shift = 0;
  }

  const rowBytes = width * 4;
  const output = Buffer.alloc(data.length);
  if (!img.transparentBg) {
    for (let i = 0; i < output.length; i += 4) {
      output[i] = img.bg[0];
      output[i + 1] = img.bg[1];
      output[i + 2] = img.bg[2];
      output[i + 3] = 255;
    }
  }
  for (let y = 0; y < height; y++) {
    const target = y + shift;
    if (target < 0 || target >= height) continue;
    data.copy(output, target * rowBytes, y * rowBytes, (y + 1) * rowBytes);
  }

  const bytes = await encode(
    sharp(output, { raw: { width, height, channels: 4 } }),
    format,
    quality,
    img.bg,
  );
  return { bytes, shiftPx: shift };
}
