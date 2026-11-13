import { anchorFor, type ExerciseMeta } from "./anchors.ts";
import { area, bbox, type Frame } from "./mask.ts";
import { register, type Registration } from "./register.ts";

/** One failed check: `code` is stable (the prompt agent keys on it), `detail` is for people. */
export type Failure = { code: FailureCode; frame: number | null; detail: string };

export type FailureCode =
  | "empty_frame"
  | "reframed"
  | "anchor_mismatch"
  | "drift"
  | "scale_drift"
  | "palette_shift"
  | "logo_missing"
  | "logo_jump"
  | "border"
  | "opaque_background"
  | "set_mismatch"
  | "ghosting";

/** Thresholds; calibrated against a person's ratings before the loop uses them. */
export const THRESHOLDS = {
  /** Anchor IoU after the correction. */
  anchorIou: 0.85,
  /** Correction above which the frame counts as drifted (still fixable). */
  drift: 0.015,
  scaleDrift: 0.03,
  /** Chi-square distance between colour histograms. */
  palette: 0.25,
  /** Logo area ratio outside [1/x, x]. */
  logoRatio: 1.8,
  /** Logo centroid shift relative to the figure's width, after the correction. */
  logoShift: 0.06,
  /** Share of border pixels that are drawn. */
  border: 0.02,
  /** Share of the canvas that is opaque. */
  opaque: 0.9,
  /** Area loss of an interpolated middle frame against the mean of its ends. */
  ghosting: 0.08,
};

export type FrameReport = {
  position: number;
  registration: Registration | null;
  palette: number;
  logoArea: number;
  logoRatio: number | null;
  logoShift: number | null;
};

export type Tier1Report = {
  anchor: string;
  frames: FrameReport[];
  failures: Failure[];
  /** 0-100, 100 = no correction needed and every check passed. */
  score: number;
};

/** 4×4×4 colour histogram of the drawn pixels, normalised. */
function histogram(f: Frame): Float64Array {
  const h = new Float64Array(64);
  let n = 0;
  for (let i = 0; i < f.mask.length; i++) {
    if (!f.mask[i]) continue;
    const r = f.rgba[i * 4] >> 6, g = f.rgba[i * 4 + 1] >> 6, b = f.rgba[i * 4 + 2] >> 6;
    h[(r << 4) | (g << 2) | b]++;
    n++;
  }
  if (n) for (let i = 0; i < 64; i++) h[i] /= n;
  return h;
}

export function chiSquare(a: Float64Array, b: Float64Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    const s = a[i] + b[i];
    if (s > 0) d += ((a[i] - b[i]) ** 2) / s;
  }
  return d / 2;
}

/** The brand's cyan: high saturation, hue around 170-195°. */
function isCyan(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max < 120 || max - min < 60) return false;
  if (r >= g || r >= b) return false;
  const hue = g >= b ? 60 * ((b - r) / (max - min)) + 120 : 60 * ((r - g) / (max - min)) + 240;
  return hue >= 165 && hue <= 200;
}

/** Cyan pixels in the upper half of the figure (the chest logo), with their centroid. */
export function logoStats(f: Frame): { area: number; cx: number; cy: number } {
  const box = bbox(f.mask, f.size);
  if (!box) return { area: 0, cx: 0, cy: 0 };
  const yMax = box.y0 + Math.round((box.y1 - box.y0) * 0.6);
  let n = 0, sx = 0, sy = 0;
  for (let y = box.y0; y <= yMax; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const i = y * f.size + x;
      if (!f.mask[i]) continue;
      if (isCyan(f.rgba[i * 4], f.rgba[i * 4 + 1], f.rgba[i * 4 + 2])) {
        n++;
        sx += x;
        sy += y;
      }
    }
  }
  return n ? { area: n, cx: sx / n, cy: sy / n } : { area: 0, cx: 0, cy: 0 };
}

function borderShare(f: Frame): number {
  const { size, rgba } = f;
  let on = 0, total = 0;
  for (let k = 0; k < size; k++) {
    for (const [x, y] of [[k, 0], [k, size - 1], [0, k], [size - 1, k]]) {
      total++;
      if (rgba[(y * size + x) * 4 + 3] > 24) on++;
    }
  }
  return on / total;
}

function opaqueShare(f: Frame): number {
  let n = 0;
  for (let i = 0; i < f.mask.length; i++) if (f.rgba[i * 4 + 3] > 250) n++;
  return n / f.mask.length;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Free checks of a set: every frame against the Start (index 0), after registering it on the
 * exercise's anchor. `frames[i]` is the frame at `positions[i]`.
 */
export function tier1(
  frames: Frame[],
  positions: number[],
  meta: ExerciseMeta,
  opts: { setMismatch?: boolean } = {},
): Tier1Report {
  const anchor = anchorFor(meta);
  const failures: Failure[] = [];
  const start = frames[0];
  const startHist = histogram(start);
  const startLogo = logoStats(start);
  const startBox = bbox(start.mask, start.size);
  const reports: FrameReport[] = [];
  let penalty = 0;

  frames.forEach((f, idx) => {
    const position = positions[idx];
    if (!bbox(f.mask, f.size)) {
      failures.push({ code: "empty_frame", frame: position, detail: "nothing drawn" });
      penalty += 100;
      return;
    }
    if (borderShare(f) > THRESHOLDS.border) {
      failures.push({ code: "border", frame: position, detail: "drawing touches the canvas edge" });
      penalty += 10;
    }
    if (opaqueShare(f) > THRESHOLDS.opaque) {
      failures.push({ code: "opaque_background", frame: position, detail: "background is not transparent" });
      penalty += 30;
    }
    const logo = logoStats(f);
    if (idx === 0) {
      if (logo.area === 0) {
        failures.push({ code: "logo_missing", frame: position, detail: "no cyan logo on the chest" });
        penalty += 10;
      }
      reports.push({ position, registration: null, palette: 0, logoArea: logo.area, logoRatio: null, logoShift: null });
      return;
    }

    const reg = register(start, f, anchor);
    const palette = chiSquare(startHist, histogram(f));
    let logoRatio: number | null = null;
    let logoShift: number | null = null;
    // Geometry only counts where the anchor fits cleanly after the correction: when body parts move
    // through the anchor band (lunges, push-ups, barbell plates) the fit is not a measure of drift.
    if (reg) {
      const clean = reg.iouAfter >= THRESHOLDS.anchorIou;
      if (!clean) {
        failures.push({ code: "anchor_mismatch", frame: position, detail: `${anchor} region overlaps only ${reg.iouAfter} after correction (moving parts or changed equipment: check by eye)` });
        penalty += 5;
      } else if (reg.atLimit) {
        failures.push({ code: "reframed", frame: position, detail: `needs scale ${reg.scale}, shift ${reg.dx}/${reg.dy}: beyond the fixable range` });
        penalty += 40;
      } else {
        const moved = Math.max(Math.abs(reg.dx), Math.abs(reg.dy));
        if (moved > THRESHOLDS.drift) {
          failures.push({ code: "drift", frame: position, detail: `anchor moved ${r3(reg.dx)}/${r3(reg.dy)} of the side (fixable)` });
          penalty += Math.min(15, moved * 400);
        }
        if (Math.abs(reg.scale - 1) > THRESHOLDS.scaleDrift) {
          failures.push({ code: "scale_drift", frame: position, detail: `scale off by ${r3(reg.scale - 1)} (fixable)` });
          penalty += Math.min(15, Math.abs(reg.scale - 1) * 300);
        }
      }
    }
    if (palette > THRESHOLDS.palette) {
      failures.push({ code: "palette_shift", frame: position, detail: `colour distance ${r3(palette)}` });
      penalty += 15;
    }
    if (startLogo.area && logo.area) {
      logoRatio = logo.area / startLogo.area;
      // Logo centroid after the same correction as the frame.
      if (reg && startBox) {
        const s = start.size, px = reg.pivot.x * s, py = reg.pivot.y * s;
        const cx = (logo.cx - px) * reg.scale + px + reg.dx * s;
        const cy = (logo.cy - py) * reg.scale + py + reg.dy * s;
        logoShift = Math.hypot(cx - startLogo.cx, cy - startLogo.cy) / (startBox.x1 - startBox.x0 + 1);
      }
      if (logoRatio > THRESHOLDS.logoRatio || logoRatio < 1 / THRESHOLDS.logoRatio) {
        failures.push({ code: "logo_jump", frame: position, detail: `logo size x${r3(logoRatio)}` });
        penalty += 8;
      }
    } else if (startLogo.area && !logo.area) {
      failures.push({ code: "logo_missing", frame: position, detail: "logo lost" });
      penalty += 8;
    }
    reports.push({
      position,
      registration: reg,
      palette: r3(palette),
      logoArea: logo.area,
      logoRatio: logoRatio === null ? null : r3(logoRatio),
      logoShift: logoShift === null ? null : r3(logoShift),
    });
  });

  if (opts.setMismatch) {
    failures.push({ code: "set_mismatch", frame: null, detail: "a frame was made from another Start" });
    penalty += 25;
  }
  return { anchor, frames: reports, failures, score: Math.max(0, Math.round(100 - penalty)) };
}

/** Area loss of an interpolated middle frame against the mean of its two ends (limbs that vanish). */
export function ghostingLoss(a: Frame, mid: Frame, b: Frame): number {
  const ends = (area(a.mask) + area(b.mask)) / 2;
  return ends ? r3(Math.max(0, 1 - area(mid.mask) / ends)) : 0;
}
