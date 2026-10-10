/**
 * Mask extraction and adjustment on raw RGBA pixels, with no dependencies, so the browser
 * (live preview) and the server (saved file) run the same code and get the same mask.
 *
 * Pipeline: select (key color or alpha) → drop small islands and fill small holes → grow /
 * shrink → smooth → offset → soft 1 px edge → clip to the base's silhouette.
 *
 * Shading (`buildShade`): the mask file's RGB holds a volume shade, white at the core and darker
 * towards the edge, so a muscle painted with it looks rounded. Clients paint
 * `base × color × shade` (multiply) weighted by the mask alpha.
 */

export type AdjustParams = {
  /** `key`: pixels close to the key color; `alpha`: the image's own alpha (uploaded masks). */
  mode: "key" | "alpha";
  /** Max distance to the key color, in % of the RGB cube diagonal (0..100). */
  tolerance: number;
  /** Pixels to grow (> 0) or shrink (< 0) the mask by. */
  grow: number;
  /** Smoothing radius in pixels (0 = off): rounds jagged edges and closes thin gaps. */
  smooth: number;
  /** Islands and holes smaller than this % of the image area are removed (0 = off). */
  min_area: number;
  /** Shift in pixels (right / down are positive). */
  offset_x: number;
  offset_y: number;
  /** Keep the mask inside the base's silhouette (its alpha). */
  clip_to_body: boolean;
  /** How much darker the edge is than the core, in % (0 = flat). */
  volume: number;
  /** Pixels from the edge over which the shade goes from edge to core. */
  volume_depth: number;
};

export const DEFAULT_ADJUST: AdjustParams = {
  mode: "key",
  tolerance: 35,
  grow: 0,
  smooth: 2,
  min_area: 0.02,
  offset_x: 0,
  offset_y: 0,
  clip_to_body: true,
  volume: 35,
  volume_depth: 22,
};

/** Uploaded masks are taken as drawn. */
export const UPLOAD_ADJUST: AdjustParams = {
  ...DEFAULT_ADJUST,
  mode: "alpha",
  smooth: 0,
  min_area: 0,
  clip_to_body: false,
};

export const ADJUST_LIMITS = {
  tolerance: { min: 0, max: 100, step: 1 },
  grow: { min: -30, max: 30, step: 1 },
  smooth: { min: 0, max: 12, step: 1 },
  min_area: { min: 0, max: 2, step: 0.01 },
  offset_x: { min: -60, max: 60, step: 1 },
  offset_y: { min: -60, max: 60, step: 1 },
  volume: { min: 0, max: 80, step: 1 },
  volume_depth: { min: 2, max: 80, step: 1 },
} as const;

function clampNumber(raw: unknown, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** Valid adjustment params from untrusted input; missing or bad fields take the defaults. */
export function normalizeAdjust(raw: unknown, defaults: AdjustParams = DEFAULT_ADJUST): AdjustParams {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (key: keyof typeof ADJUST_LIMITS) =>
    clampNumber(input[key], defaults[key], ADJUST_LIMITS[key].min, ADJUST_LIMITS[key].max);
  return {
    mode: input.mode === "alpha" || input.mode === "key" ? input.mode : defaults.mode,
    tolerance: num("tolerance"),
    grow: Math.round(num("grow")),
    smooth: Math.round(num("smooth")),
    min_area: num("min_area"),
    offset_x: Math.round(num("offset_x")),
    offset_y: Math.round(num("offset_y")),
    clip_to_body:
      typeof input.clip_to_body === "boolean" ? input.clip_to_body : defaults.clip_to_body,
    volume: Math.round(num("volume")),
    volume_depth: Math.round(num("volume_depth")),
  };
}

/** RGBA pixels, row by row (4 bytes per pixel). */
export type Raster = {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
};

export function parseHexColor(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})/i.exec(hex.trim());
  if (!match) throw new Error(`Invalid color: ${hex}`);
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

const RGB_DIAGONAL = Math.sqrt(3 * 255 * 255);

/**
 * The mask's alpha (one byte per pixel, 0..255) from a source image of the base's size.
 * `base` (same size) is only used to clip to the body.
 */
export function buildMask(
  source: Raster,
  base: Raster | null,
  keyColor: string,
  params: AdjustParams,
): Uint8ClampedArray {
  const { width, height, data } = source;
  const n = width * height;
  let sel = new Uint8Array(n);

  if (params.mode === "alpha") {
    for (let i = 0; i < n; i++) sel[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
  } else {
    const [kr, kg, kb] = parseHexColor(keyColor);
    const limit = ((params.tolerance / 100) * RGB_DIAGONAL) ** 2;
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      if (data[p + 3] < 128) continue;
      const dr = data[p] - kr;
      const dg = data[p + 1] - kg;
      const db = data[p + 2] - kb;
      sel[i] = dr * dr + dg * dg + db * db <= limit ? 1 : 0;
    }
  }

  const minPixels = Math.round((params.min_area / 100) * n);
  if (minPixels > 0) {
    removeSmallComponents(sel, width, height, 1, minPixels);
    removeSmallComponents(sel, width, height, 0, minPixels);
  }

  if (params.grow > 0) {
    const dist = distanceTo(sel, width, height, 1);
    for (let i = 0; i < n; i++) sel[i] = dist[i] <= params.grow ? 1 : 0;
  } else if (params.grow < 0) {
    const dist = distanceTo(sel, width, height, 0);
    for (let i = 0; i < n; i++) sel[i] = dist[i] > -params.grow ? 1 : 0;
  }

  if (params.smooth > 0) {
    const soft = new Float32Array(n);
    for (let i = 0; i < n; i++) soft[i] = sel[i];
    boxBlur(soft, width, height, params.smooth);
    boxBlur(soft, width, height, params.smooth);
    for (let i = 0; i < n; i++) sel[i] = soft[i] >= 0.5 ? 1 : 0;
  }

  if (params.offset_x || params.offset_y) {
    sel = shift(sel, width, height, params.offset_x, params.offset_y);
  }

  const edge = new Float32Array(n);
  for (let i = 0; i < n; i++) edge[i] = sel[i] * 255;
  boxBlur(edge, width, height, 1);

  const alpha = new Uint8ClampedArray(n);
  const clip = params.clip_to_body && base && base.width === width && base.height === height;
  for (let i = 0; i < n; i++) {
    alpha[i] = clip ? (edge[i] * base!.data[i * 4 + 3]) / 255 : edge[i];
  }
  return alpha;
}

/**
 * The volume shade of a mask (one byte per pixel): 255 at the core, down to
 * `255 × (1 − volume)` at the edge, eased over `volume_depth` pixels.
 */
export function buildShade(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  params: Pick<AdjustParams, "volume" | "volume_depth">,
): Uint8ClampedArray {
  const n = width * height;
  const shade = new Uint8ClampedArray(n).fill(255);
  if (params.volume <= 0) return shade;
  const inside = new Uint8Array(n);
  for (let i = 0; i < n; i++) inside[i] = alpha[i] >= 128 ? 1 : 0;
  const depth = distanceTo(inside, width, height, 0);
  const strength = params.volume / 100;
  for (let i = 0; i < n; i++) {
    if (alpha[i] === 0) continue;
    const t = Math.min(1, depth[i] / params.volume_depth);
    const eased = t * t * (3 - 2 * t);
    shade[i] = 255 * (1 - strength * (1 - eased));
  }
  return shade;
}

/** Normalized bounding box of the visible part of a mask; null when it is empty. */
export function rectOf(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
  threshold = 8,
): { x: number; y: number; w: number; h: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (alpha[row + x] <= threshold) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  const round = (v: number) => Math.round(v * 10000) / 10000;
  return {
    x: round(minX / width),
    y: round(minY / height),
    w: round((maxX - minX + 1) / width),
    h: round((maxY - minY + 1) / height),
  };
}

/**
 * Removes 4-connected components of `value` smaller than `minPixels` (flips them). For holes
 * (`value` 0), components touching the border are background and are kept.
 */
function removeSmallComponents(
  sel: Uint8Array,
  width: number,
  height: number,
  value: 0 | 1,
  minPixels: number,
) {
  const n = width * height;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  const component: number[] = [];
  for (let start = 0; start < n; start++) {
    if (seen[start] || sel[start] !== value) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    component.length = 0;
    let touchesBorder = false;
    while (top > 0) {
      const i = stack[--top];
      component.push(i);
      const x = i % width;
      const y = (i - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;
      for (let k = 0; k < 4; k++) {
        const j =
          k === 0
            ? x > 0 ? i - 1 : -1
            : k === 1
              ? x < width - 1 ? i + 1 : -1
              : k === 2
                ? y > 0 ? i - width : -1
                : y < height - 1 ? i + width : -1;
        if (j >= 0 && !seen[j] && sel[j] === value) {
          seen[j] = 1;
          stack[top++] = j;
        }
      }
    }
    if (component.length >= minPixels) continue;
    if (value === 0 && touchesBorder) continue;
    for (const i of component) sel[i] = value === 1 ? 0 : 1;
  }
}

/** Approximate Euclidean distance (chamfer 3-4) from each pixel to the nearest `value` pixel. */
function distanceTo(sel: Uint8Array, width: number, height: number, value: 0 | 1): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(width * height);
  for (let i = 0; i < d.length; i++) d[i] = sel[i] === value ? 0 : INF;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 3);
      if (y > 0) {
        v = Math.min(v, d[i - width] + 3);
        if (x > 0) v = Math.min(v, d[i - width - 1] + 4);
        if (x < width - 1) v = Math.min(v, d[i - width + 1] + 4);
      }
      d[i] = v;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      let v = d[i];
      if (x < width - 1) v = Math.min(v, d[i + 1] + 3);
      if (y < height - 1) {
        v = Math.min(v, d[i + width] + 3);
        if (x < width - 1) v = Math.min(v, d[i + width + 1] + 4);
        if (x > 0) v = Math.min(v, d[i + width - 1] + 4);
      }
      d[i] = v;
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= 3;
  return d;
}

/** In-place box blur of radius `r` (horizontal then vertical, edges clamped). */
function boxBlur(values: Float32Array, width: number, height: number, r: number) {
  const size = 2 * r + 1;
  const line = new Float32Array(Math.max(width, height));
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += values[row + Math.min(width - 1, Math.max(0, k))];
    for (let x = 0; x < width; x++) {
      line[x] = sum / size;
      sum += values[row + Math.min(width - 1, x + r + 1)] - values[row + Math.max(0, x - r)];
    }
    for (let x = 0; x < width; x++) values[row + x] = line[x];
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += values[Math.min(height - 1, Math.max(0, k)) * width + x];
    for (let y = 0; y < height; y++) {
      line[y] = sum / size;
      sum +=
        values[Math.min(height - 1, y + r + 1) * width + x] -
        values[Math.max(0, y - r) * width + x];
    }
    for (let y = 0; y < height; y++) values[y * width + x] = line[y];
  }
}

function shift(sel: Uint8Array, width: number, height: number, dx: number, dy: number) {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const sy = y - dy;
    if (sy < 0 || sy >= height) continue;
    for (let x = 0; x < width; x++) {
      const sx = x - dx;
      if (sx >= 0 && sx < width) out[y * width + x] = sel[sy * width + sx];
    }
  }
  return out;
}
