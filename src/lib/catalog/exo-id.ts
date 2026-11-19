/**
 * Next exo_id: always above the highest id ever used (active or not), never a gap. Gaps are
 * retired ids and must not be reused (a new exercise would inherit the old one's history).
 * `ids` may be every id or just the largest one.
 */
export function nextExoIdFrom(ids: number[]): number {
  let max = 0;
  for (const n of ids) if (Number.isFinite(n) && n > max) max = n;
  return Math.floor(max) + 1;
}
