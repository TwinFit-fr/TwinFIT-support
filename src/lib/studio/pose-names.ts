/**
 * Pose names in the clip file. The editor keeps one name per pose (moved, duplicated and removed
 * together with its pose), so what is written is exactly the editor's list; a clip with no names
 * writes none, so names from an older version of the clip cannot come back. Pure.
 */

/** The names to write for `count` poses: trimmed, one per pose, or null when there is none. */
export function clipLabels(labels: readonly (string | null | undefined)[] | null | undefined, count: number): string[] | null {
  if (!labels || count <= 0) return null;
  const out = Array.from({ length: count }, (_, i) => (typeof labels[i] === "string" ? labels[i]!.trim() : ""));
  return out.some(Boolean) ? out : null;
}

/** The names a clip file holds for its `count` poses (null when it has none, or not one per pose). */
export function labelsFromClip(meta: Record<string, unknown> | null | undefined, count: number): string[] | null {
  const given = meta?.labels;
  if (!Array.isArray(given) || given.length !== count || !given.every((l) => typeof l === "string")) return null;
  return clipLabels(given as string[], count);
}
