import sharp from "sharp";
import type { Registration } from "./register.ts";

type Raw = { data: Uint8Array; width: number; height: number };

export async function decodeRaw(bytes: Buffer | Uint8Array): Promise<Raw> {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

/**
 * Applies a registration at full resolution: scale about the pivot, then shift (bilinear,
 * premultiplied so transparent edges do not darken). Pixels pulled from outside stay transparent.
 */
export function applyRegistrationRaw(src: Raw, reg: Pick<Registration, "scale" | "dx" | "dy" | "pivot">): Raw {
  const { width: w, height: h, data } = src;
  const out = new Uint8Array(w * h * 4);
  const px = reg.pivot.x * w, py = reg.pivot.y * h, dx = reg.dx * w, dy = reg.dy * h, s = reg.scale;
  const at = (x: number, y: number, c: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : data[(y * w + x) * 4 + c];
  for (let y = 0; y < h; y++) {
    const sy = (y - dy - py) / s + py;
    const y0 = Math.floor(sy), fy = sy - y0;
    for (let x = 0; x < w; x++) {
      const sx = (x - dx - px) / s + px;
      const x0 = Math.floor(sx), fx = sx - x0;
      const wts = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
      const pts = [[x0, y0], [x0 + 1, y0], [x0, y0 + 1], [x0 + 1, y0 + 1]];
      let a = 0, r = 0, g = 0, b = 0;
      for (let k = 0; k < 4; k++) {
        const [qx, qy] = pts[k];
        const al = at(qx, qy, 3) * wts[k];
        a += al;
        r += at(qx, qy, 0) * al;
        g += at(qx, qy, 1) * al;
        b += at(qx, qy, 2) * al;
      }
      const o = (y * w + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = Math.round(a);
    }
  }
  return { data: out, width: w, height: h };
}

/**
 * Anti-flicker: where the candidate already matches the Start closely (same alpha state and a
 * colour within `tolerance`, summed over RGB), take the Start's pixel, so static parts are
 * byte-identical between frames. It never invents content: a redrawn bench differs and is kept.
 */
export function lockStatic(start: Raw, cand: Raw, tolerance = 36): { raw: Raw; locked: number } {
  if (start.width !== cand.width || start.height !== cand.height) return { raw: cand, locked: 0 };
  const out = new Uint8Array(cand.data);
  let locked = 0;
  const n = start.width * start.height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const as = start.data[o + 3], ac = cand.data[o + 3];
    if (as < 16 && ac < 16) continue;
    if (Math.abs(as - ac) > 48) continue;
    const d =
      Math.abs(start.data[o] - cand.data[o]) +
      Math.abs(start.data[o + 1] - cand.data[o + 1]) +
      Math.abs(start.data[o + 2] - cand.data[o + 2]);
    if (d <= tolerance) {
      out[o] = start.data[o];
      out[o + 1] = start.data[o + 1];
      out[o + 2] = start.data[o + 2];
      out[o + 3] = start.data[o + 3];
      locked++;
    }
  }
  return { raw: { ...cand, data: out }, locked };
}

export async function encodeRaw(raw: Raw, format: "webp" | "png" = "webp", quality = 100): Promise<Buffer> {
  const img = sharp(Buffer.from(raw.data), { raw: { width: raw.width, height: raw.height, channels: 4 } });
  return format === "png"
    ? img.png().toBuffer()
    : img.webp(quality >= 100 ? { lossless: true } : { quality }).toBuffer();
}
