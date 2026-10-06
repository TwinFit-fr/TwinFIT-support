import type { MuscleMapTargetKind, MuscleMapTargetRef } from "./types";

const MAP_KIND_SEGMENT: Record<MuscleMapTargetKind, string> = {
  muscle_group: "group",
  muscle: "muscle",
};

/** The page of one muscle or group's maps: /images/muscle-maps/group/<id> or …/muscle/<id>. */
export function muscleMapPath(ref: MuscleMapTargetRef): string {
  return `/images/muscle-maps/${MAP_KIND_SEGMENT[ref.kind]}/${ref.id}`;
}

/** The target kind of a muscle map page segment, or null when it is not one. */
export function muscleMapKindOf(segment: string): MuscleMapTargetKind | null {
  const entry = Object.entries(MAP_KIND_SEGMENT).find(([, value]) => value === segment);
  return entry ? (entry[0] as MuscleMapTargetKind) : null;
}

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
