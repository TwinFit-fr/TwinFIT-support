import sharp, { type Sharp } from "sharp";
import type { ImageFormat } from "./align";
import { isIdentityNudge, type FrameNudge } from "./nudge";

export type { FrameNudge } from "./nudge";
export { IDENTITY_NUDGE, isIdentityNudge } from "./nudge";

function parseHexColor(hex: string | null | undefined): [number, number, number] | null {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function encode(
  pipeline: Sharp,
  format: ImageFormat,
  quality: number,
  bg: [number, number, number],
  transparentBg: boolean,
): Promise<Buffer> {
  if (format === "jpeg") {
    return pipeline
      .flatten({ background: { r: bg[0], g: bg[1], b: bg[2] } })
      .jpeg({ quality: Math.max(1, quality) })
      .toBuffer();
  }
  if (format === "webp") {
    // Keep alpha when the source was transparent.
    return pipeline.webp(quality >= 100 ? { lossless: true } : { quality }).toBuffer();
  }
  if (transparentBg) {
    return pipeline.png().toBuffer();
  }
  return pipeline.png().toBuffer();
}

/**
 * Translates and scales the frame on its own canvas so the person can be
 * aligned with other frames in the GIF.
 *
 * Transparent sources keep a transparent canvas (top-left RGBA often looks
 * black with alpha 0 — using that RGB filled gaps with solid black before).
 * Opaque sources fill gaps with the sampled background, or `fallbackBg` hex.
 */
export async function repositionFrame(
  input: Buffer,
  nudge: FrameNudge,
  format: ImageFormat,
  quality: number,
  fallbackBg?: string | null,
): Promise<Buffer> {
  if (isIdentityNudge(nudge)) return input;

  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const transparentBg = data[3] < 128;
  const fallback = parseHexColor(fallbackBg);
  const bg: [number, number, number] = transparentBg
    ? (fallback ?? [data[0], data[1], data[2]])
    : [data[0], data[1], data[2]];

  const scale = Math.max(0.2, Math.min(3, nudge.scale));
  const scaledW = Math.max(1, Math.round(width * scale));
  const scaledH = Math.max(1, Math.round(height * scale));

  const scaled = await sharp(input)
    .resize({ width: scaledW, height: scaledH, fit: "fill" })
    .ensureAlpha()
    .png()
    .toBuffer();

  const left = Math.round((width - scaledW) / 2 + nudge.dx * width);
  const top = Math.round((height - scaledH) / 2 + nudge.dy * height);

  // JPEG has no alpha: always paint a solid fill. Otherwise keep transparency
  // when the source was transparent so we don't invent a black plate.
  const fillAlpha = format === "jpeg" || !transparentBg ? 255 : 0;
  const fillRgb =
    format === "jpeg" && transparentBg ? (fallback ?? [242, 228, 206]) : bg;

  const canvas = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: {
        r: fillRgb[0],
        g: fillRgb[1],
        b: fillRgb[2],
        alpha: fillAlpha,
      },
    },
  }).composite([{ input: scaled, left, top }]);

  return encode(canvas, format, quality, fillRgb, transparentBg && format !== "jpeg");
}
