/**
 * Which chips of a one-line row are shown: as many as fit whole, in order, with room kept for
 * the "more" control when some are left out. No chip is ever cut: one that does not fit entirely
 * is left out. Pure (widths in, indexes out), so the row component only measures and renders.
 */
export function fitChips({
  widths,
  available,
  gap,
  moreWidth,
  pinned = null,
}: {
  /** Natural width of every chip, in row order (px). */
  widths: readonly number[];
  /** Width of the row (px). */
  available: number;
  /** Space between two chips (px). */
  gap: number;
  /** Width of the "more" control, shown only when chips are left out (px). */
  moreWidth: number;
  /** A chip that must stay in view (the selected one), wherever it is in the order. */
  pinned?: number | null;
}): number[] {
  const all = widths.map((_, index) => index);
  const total = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, widths.length - 1);
  if (total <= available) return all;

  // The first chip (the "all" choice) and the pinned one are shown whatever the room.
  const keep = new Set<number>(widths.length ? [0] : []);
  if (pinned !== null && pinned >= 0 && pinned < widths.length) keep.add(pinned);
  let used = moreWidth;
  for (const index of keep) used += widths[index] + gap;
  for (const index of all) {
    if (keep.has(index)) continue;
    if (used + widths[index] + gap > available) break;
    used += widths[index] + gap;
    keep.add(index);
  }
  return all.filter((index) => keep.has(index));
}
