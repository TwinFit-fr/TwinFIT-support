import sharp from "sharp";

/** Every frame is shifted so the lowest drawn pixel (feet / shadow) sits at this height ratio. */
export const FEET_BASELINE = 0.95;

const ALPHA_THRESHOLD = 24;
const COLOR_THRESHOLD = 40;
const MIN_ROW_PIXELS = 3;
const MIN_SHIFT_PX = 2;

type Format = "png" | "webp" | "jpeg";

export type AlignResult = { bytes: Buffer; shiftPx: number };

/**
 * Vertically translates the image so the feet land on a fixed baseline, without scaling.
 * Background is detected from the top-left pixel (transparent or flat color); the shift
 * is capped so content touching the top (raised arms, equipment) is never cropped.
 */
export async function alignFeetBaseline(
  input: Buffer,
  format: Format,
  quality: number,
): Promise<AlignResult> {
  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const bg = [data[0], data[1], data[2], data[3]];
  const transparentBg = bg[3] < 128;

  const isContent = (offset: number) => {
    if (transparentBg) return data[offset + 3] > ALPHA_THRESHOLD;
    const distance =
      Math.abs(data[offset] - bg[0]) +
      Math.abs(data[offset + 1] - bg[1]) +
      Math.abs(data[offset + 2] - bg[2]);
    return distance > COLOR_THRESHOLD;
  };

  let top = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width && count < MIN_ROW_PIXELS; x++) {
      if (isContent((y * width + x) * 4)) count++;
    }
    if (count >= MIN_ROW_PIXELS) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  if (bottom < 0) return { bytes: input, shiftPx: 0 };

  let shift = Math.round(height * FEET_BASELINE) - 1 - bottom;
  if (shift < 0) shift = Math.max(shift, -top);
  if (Math.abs(shift) < MIN_SHIFT_PX) return { bytes: input, shiftPx: 0 };

  const rowBytes = width * 4;
  const output = Buffer.alloc(data.length);
  if (!transparentBg) {
    for (let i = 0; i < output.length; i += 4) {
      output[i] = bg[0];
      output[i + 1] = bg[1];
      output[i + 2] = bg[2];
      output[i + 3] = 255;
    }
  }
  for (let y = 0; y < height; y++) {
    const target = y + shift;
    if (target < 0 || target >= height) continue;
    data.copy(output, target * rowBytes, y * rowBytes, (y + 1) * rowBytes);
  }

  let pipeline = sharp(output, { raw: { width, height, channels: 4 } });
  if (format === "jpeg") {
    pipeline = pipeline
      .flatten({ background: { r: bg[0], g: bg[1], b: bg[2] } })
      .jpeg({ quality: Math.max(1, quality) });
  } else if (format === "webp") {
    pipeline = pipeline.webp(quality >= 100 ? { lossless: true } : { quality });
  } else {
    pipeline = pipeline.png();
  }
  return { bytes: await pipeline.toBuffer(), shiftPx: shift };
}
