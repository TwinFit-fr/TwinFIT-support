/**
 * Small rotation maths for reading angles back from bones (pose-from-bones.ts): a rotation split
 * into its swing and its twist about an axis, rotation vectors, and a Levenberg-Marquardt fit of a
 * few angles to a few rotations. Degrees throughout. No scene.
 */

import * as THREE from "three";

const DEG = 180 / Math.PI;

const wrap = (deg: number) => {
  let d = ((deg + 180) % 360 + 360) % 360 - 180;
  if (d === -180) d = 180;
  return d;
};

/** q = swing · twist, the twist about the unit `axis`; the twist's angle in degrees (-180, 180]. */
export function swingTwist(q: THREE.Quaternion, axis: THREE.Vector3): { swing: THREE.Quaternion; twist: number } {
  const d = q.x * axis.x + q.y * axis.y + q.z * axis.z;
  const tw = new THREE.Quaternion(axis.x * d, axis.y * d, axis.z * d, q.w);
  if (tw.lengthSq() < 1e-12) return { swing: q.clone(), twist: 180 };
  tw.normalize();
  const twist = wrap(2 * Math.atan2(d, q.w) * DEG);
  return { swing: q.clone().multiply(tw.invert()), twist };
}

/** A rotation as a rotation vector, degrees (shortest way round). */
export function rotationVector(q: THREE.Quaternion): [number, number, number] {
  const s = q.w < 0 ? -1 : 1;
  const w = Math.min(1, s * q.w);
  const half = Math.acos(w);
  const sin = Math.sin(half);
  const k = sin < 1e-9 ? 2 * DEG : (2 * half * DEG) / sin;
  return [s * q.x * k, s * q.y * k, s * q.z * k];
}

/** Angle between two rotations, degrees. */
export function angleBetween(a: THREE.Quaternion, b: THREE.Quaternion): number {
  const dot = Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w));
  return 2 * Math.acos(dot) * DEG;
}

/** Solve the small square system A x = b (Gaussian elimination with pivoting). */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k += 1) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/**
 * Levenberg-Marquardt over a few angles (degrees) so that the rotations `model` gives match
 * `targets`. Small problems only (up to six angles, a handful of bones): finite differences.
 */
export function fit(x0: number[], model: (x: number[]) => THREE.Quaternion[], targets: THREE.Quaternion[]): number[] {
  return fitResidual(x0, (x) => model(x).flatMap((q, i) => rotationVector(targets[i].clone().invert().multiply(q))));
}

/** Levenberg-Marquardt on any residual vector (degrees). */
export function fitResidual(x0: number[], residual: (x: number[]) => number[]): number[] {
  const cost = (r: number[]) => r.reduce((s, v) => s + v * v, 0);
  let x = [...x0];
  let r = residual(x);
  let c = cost(r);
  let lambda = 1e-3;
  for (let iter = 0; iter < 30 && c > 1e-10; iter += 1) {
    const h = 1e-3;
    const J = x.map((_, j) => {
      const xp = [...x];
      xp[j] += h;
      const rp = residual(xp);
      return rp.map((v, i) => (v - r[i]) / h);
    });
    const n = x.length;
    const JTJ = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => J[a].reduce((s, v, i) => s + v * J[b][i], 0)));
    const JTr = Array.from({ length: n }, (_, a) => J[a].reduce((s, v, i) => s + v * r[i], 0));
    let improved = false;
    for (let tries = 0; tries < 8; tries += 1) {
      const A = JTJ.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-9 : v)));
      const step = solve(A, JTr.map((v) => -v));
      if (!step) break;
      const xn = x.map((v, i) => v + step[i]);
      const rn = residual(xn);
      const cn = cost(rn);
      if (cn < c) {
        x = xn;
        r = rn;
        const gain = c - cn;
        c = cn;
        lambda = Math.max(1e-7, lambda / 4);
        improved = true;
        if (Math.max(...step.map(Math.abs)) < 1e-6 || gain < 1e-12) iter = Infinity;
        break;
      }
      lambda *= 8;
    }
    if (!improved) break;
  }
  return x;
}
