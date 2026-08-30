/** Butterworth low-pass 50 Hz / 10 Hz / order 4 — matches workout-sdk ButterworthLowPassCoefficients. */
export const BUTTERWORTH_B_50HZ_10HZ_ORDER4 = [
  0.04658290663644364,
  0.18633162654577456,
  0.2794974398186618,
  0.18633162654577456,
  0.04658290663644364,
];

export const BUTTERWORTH_A_50HZ_10HZ_ORDER4 = [
  1.0,
  -0.7820951980233378,
  0.6799785269162995,
  -0.1826756977530324,
  0.03011887504316925,
];

function reverseInPlace(arr: number[]): void {
  for (let i = 0, j = arr.length - 1; i < j; i++, j--) {
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
}

function padOddExtension(x: number[], padLen: number): number[] {
  const n = x.length;
  const out = new Array<number>(n + 2 * padLen);
  for (let i = 0; i < padLen; i++) {
    out[i] = 2 * x[0] - x[padLen - i];
  }
  for (let i = 0; i < n; i++) {
    out[padLen + i] = x[i];
  }
  for (let i = 0; i < padLen; i++) {
    out[padLen + n + i] = 2 * x[n - 1] - x[n - 2 - i];
  }
  return out;
}

/** Direct Form I IIR — port of workout-sdk ZeroPhaseIirFilter.lfilter. */
export function lfilter(b: number[], a: number[], x: number[]): number[] {
  const nb = b.length;
  const na = a.length;
  const y = new Array<number>(x.length);
  const xv = new Array<number>(nb).fill(0);
  const yv = new Array<number>(na).fill(0);

  for (let n = 0; n < x.length; n++) {
    for (let k = nb - 1; k > 0; k--) xv[k] = xv[k - 1];
    xv[0] = x[n];

    let acc = 0;
    for (let k = 0; k < nb; k++) acc += b[k] * xv[k];
    for (let j = 1; j < na; j++) acc -= a[j] * yv[j - 1];
    if (Math.abs(a[0] - 1.0) > 1e-12) acc /= a[0];

    for (let j = na - 1; j > 0; j--) yv[j] = yv[j - 1];
    yv[0] = acc;
    y[n] = acc;
  }
  return y;
}

function filtfiltPadded(signal: number[], b: number[], a: number[], padLen: number): number[] {
  const padded = padOddExtension(signal, padLen);
  const forward = lfilter(b, a, padded);
  reverseInPlace(forward);
  const backward = lfilter(b, a, forward);
  reverseInPlace(backward);
  return backward.slice(padLen, backward.length - padLen);
}

/**
 * SciPy filtfilt default padding — port of ZeroPhaseIirFilter.filtfiltScipyDefaultPadding.
 * Returns a copy without filtering when the signal is too short.
 */
export function filtfiltScipyDefaultPadding(
  signal: number[],
  b: number[] = BUTTERWORTH_B_50HZ_10HZ_ORDER4,
  a: number[] = BUTTERWORTH_A_50HZ_10HZ_ORDER4,
): number[] {
  if (signal.length === 0) return [];
  const padLen = 3 * (Math.max(b.length, a.length) - 1);
  if (signal.length <= padLen) return [...signal];
  return filtfiltPadded(signal, b, a, padLen);
}

export function lowpassColumn(values: number[]): number[] {
  return filtfiltScipyDefaultPadding(values);
}

export function vectorNorm(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}
