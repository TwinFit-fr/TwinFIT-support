/**
 * Arrow-key movement inside a group of choices (a segmented control, the add-avatar source list):
 * the index a key moves to, wrapping at both ends, or null for a key the group does not handle.
 * Pure.
 */
export function rovingIndex(key: string, index: number, count: number, orientation: "horizontal" | "vertical" = "horizontal"): number | null {
  if (count <= 0) return null;
  const next = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
  const prev = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
  const from = index < 0 ? 0 : index;
  if (key === next) return (from + 1) % count;
  if (key === prev) return (from - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}
