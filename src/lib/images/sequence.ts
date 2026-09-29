import sharp from "sharp";
import {
  FEET_BASELINE,
  alignFeetBaseline,
  backgroundFill,
  readRgba,
  type ImageFormat,
  type Rgba,
} from "./align";
import { SPLIT_FAILED } from "./types";

/** Columns with at most this many drawn pixels count as empty gutter. */
const GUTTER_MAX_PIXELS = 1;
/** Horizontal breathing room around the widest figure, as a ratio of its width. */
const SIDE_MARGIN = 0.08;
/** Minimum empty space kept above the tallest figure, as a ratio of the frame height. */
const TOP_MARGIN = 0.04;

export class SplitError extends Error {
  constructor(detail: string) {
    super(`${SPLIT_FAILED}: ${detail}`);
  }
}

const COUNT_WORDS = ["", "ONE", "TWO", "THREE"];
const POSITION_WORDS = ["start", "mid", "end"];

/** Instruction block appended to the prompt when several positions are drawn in one strip. */
export function sequenceDirective(positions: number[]): string {
  const n = positions.length;
  const panels = positions
    .map((position, i) => `PANEL ${i + 1} = ${POSITION_WORDS[position]} position`)
    .join(", ");
  const share = n === 2 ? "half" : "third";
  return `LAYOUT OVERRIDE — ${COUNT_WORDS[n]} POSES IN ONE IMAGE: ignore any instruction about a single character or a single frame. This image is one horizontal strip showing the SAME character ${COUNT_WORDS[n]} times side by side, left to right: ${panels}, as described below. All figures share the same camera, the same scale and the same ground line, each centered in its own ${share} of the image with clear empty space between figures. Figures and equipment must never overlap or touch each other. No dividers, no borders, no labels, no numbers.`;
}

function columnCounts(img: Rgba): number[] {
  const counts = new Array<number>(img.width).fill(0);
  for (let x = 0; x < img.width; x++) {
    for (let y = 0; y < img.height; y++) if (img.isContent(x, y)) counts[x]++;
  }
  return counts;
}

/** Centre of the widest empty run within [from, to), preferring runs near `target`. */
function findGutter(counts: number[], from: number, to: number, target: number): number | null {
  let best: { center: number; length: number } | null = null;
  let runStart = -1;
  for (let x = from; x <= to; x++) {
    const empty = x < to && counts[x] <= GUTTER_MAX_PIXELS;
    if (empty && runStart < 0) runStart = x;
    if (!empty && runStart >= 0) {
      const length = x - runStart;
      const center = Math.round((runStart + x - 1) / 2);
      if (
        !best ||
        length > best.length ||
        (length === best.length && Math.abs(center - target) < Math.abs(best.center - target))
      ) {
        best = { center, length };
      }
      runStart = -1;
    }
  }
  return best?.center ?? null;
}

function contentBox(img: Rgba, counts: number[], x0: number, x1: number) {
  let left = -1;
  let right = -1;
  for (let x = x0; x < x1; x++) {
    if (counts[x] > GUTTER_MAX_PIXELS) {
      if (left < 0) left = x;
      right = x;
    }
  }
  if (left < 0) return null;
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = left; x <= right; x++) {
      if (img.isContent(x, y)) {
        if (top < 0) top = y;
        bottom = y;
        break;
      }
    }
  }
  return { left, width: right - left + 1, top, height: bottom - top + 1 };
}

/**
 * Splits a strip into `panels` poses and returns them as frames of `frameSize` ("WxH").
 * All frames share one canvas scale, so relative figure sizes from the strip are preserved.
 */
export async function splitSequence(
  strip: Buffer,
  panels: number,
  frameSize: string,
  format: ImageFormat,
  quality: number,
): Promise<{ frames: { bytes: Buffer; shiftPx: number }[]; cuts: number[] }> {
  const img = await readRgba(strip);
  const counts = columnCounts(img);
  const window = Math.round(img.width / 8);

  const cuts: number[] = [];
  for (let i = 1; i < panels; i++) {
    const target = Math.round((img.width * i) / panels);
    const cut = findGutter(counts, target - window, target + window, target);
    if (cut == null) throw new SplitError(`no empty gap near panel boundary ${i}`);
    cuts.push(cut);
  }
  const bounds = [0, ...cuts, img.width];
  const boxes = bounds.slice(0, panels).map((x0, i) => contentBox(img, counts, x0, bounds[i + 1]));
  if (boxes.some((b) => !b)) throw new SplitError("a panel is empty");

  const [outW, outH] = frameSize.split("x").map(Number);
  const ratio = outW / outH;
  const panelBoxes = boxes as NonNullable<(typeof boxes)[number]>[];
  // One canvas for all three: wide enough for the widest pose and tall enough for the tallest
  // (feet on the baseline, headroom above), so every frame keeps the strip's common scale.
  const widest = Math.max(...panelBoxes.map((b) => b.width));
  const tallest = Math.max(...panelBoxes.map((b) => b.height));
  const canvasH = Math.max(
    img.height,
    Math.ceil(tallest / (FEET_BASELINE - TOP_MARGIN)),
    Math.ceil((widest * (1 + 2 * SIDE_MARGIN)) / ratio),
  );
  const canvasW = Math.round(canvasH * ratio);
  const baseline = Math.round(canvasH * FEET_BASELINE);
  const rawStrip = sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } });

  const frames = [];
  for (const box of panelBoxes) {
    const panel = await rawStrip
      .clone()
      .extract({ left: box.left, top: box.top, width: box.width, height: box.height })
      .png()
      .toBuffer();
    const composed = await sharp({
      create: { width: canvasW, height: canvasH, channels: 4, background: backgroundFill(img) },
    })
      .composite([
        {
          input: panel,
          left: Math.round((canvasW - box.width) / 2),
          top: baseline - box.height,
        },
      ])
      .png()
      .toBuffer();
    const resized = await sharp(composed).resize(outW, outH).png().toBuffer();
    frames.push(await alignFeetBaseline(resized, format, quality, true));
  }
  return { frames, cuts };
}
