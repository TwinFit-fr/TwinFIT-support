export function imageDisplayUrl(imageUrl: string | null | undefined): string | null {
  return imageUrl || null;
}

export function storageFileUrl(fileId: string | null | undefined): string | null {
  if (!fileId) return null;
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
  const region = process.env.NEXT_PUBLIC_NHOST_REGION;
  return `https://${subdomain}.storage.${region}.nhost.run/v1/files/${fileId}`;
}

/** Resized preview served by Nhost Storage image transformation. */
export function imageThumbUrl(imageUrl: string | null | undefined, width: number): string | null {
  if (!imageUrl) return null;
  const separator = imageUrl.includes("?") ? "&" : "?";
  return `${imageUrl}${separator}w=${width}&q=70`;
}

export function statusLabel(status: string): string {
  switch (status) {
    case "complete":
      return "Complete";
    case "partial":
      return "Partial";
    case "inactive_only":
      return "Inactive";
    default:
      return "No image";
  }
}

/** One loop of the sequence; it restarts at the first entry (0→1→2→1 then 0 again). */
export function gifPlaybackOrder(positions: number[]): number[] {
  const set = new Set(positions);
  if (set.has(0) && set.has(1) && set.has(2)) {
    return [0, 1, 2, 1];
  }
  return [...set].sort((a, b) => a - b);
}

/** Every loop lasts the same, whether it has 2 or 3 frames. */
export const LOOP_MS = 1800;

/** Hold time per step: extremes pause, the mid pose passes quickly (600/300/600/300). */
export function frameHoldMs(order: number[], index: number): number {
  if (order.length === 4) return order[index] === 1 ? LOOP_MS / 6 : LOOP_MS / 3;
  return LOOP_MS / Math.max(order.length, 1);
}
