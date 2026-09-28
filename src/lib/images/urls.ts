export function imageDisplayUrl(imageUrl: string | null | undefined): string | null {
  return imageUrl || null;
}

export function statusLabel(status: string): string {
  switch (status) {
    case "complete":
      return "3 frames";
    case "partial":
      return "Partial";
    case "inactive_only":
      return "Inactive";
    default:
      return "No image";
  }
}

/** Playback order for a 0→1→2→1→0 style GIF. */
export function gifPlaybackOrder(positions: number[]): number[] {
  const set = new Set(positions);
  if (set.has(0) && set.has(1) && set.has(2)) {
    return [0, 1, 2, 1, 0];
  }
  return [...positions].sort((a, b) => a - b);
}
