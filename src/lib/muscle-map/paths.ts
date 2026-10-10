import type { MapView } from "./types";

/** Storage names in bucket `exercise-images`, all under `muscle-map/`. */

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/webp": "webp",
  "image/jpeg": "jpg",
};

export function extensionOf(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] ?? "png";
}

export function baseFileName(view: MapView, mimeType: string): string {
  return `muscle-map/base/${view}/${Date.now()}.${extensionOf(mimeType)}`;
}

/** The model output (or uploaded image) a mask is extracted from. */
export function sourceFileName(view: MapView, muscleCode: string, mimeType: string): string {
  return `muscle-map/source/${view}/${muscleCode}/${Date.now()}.${extensionOf(mimeType)}`;
}

/** Final masks are always PNG (alpha = muscle). */
export function maskFileName(view: MapView, muscleCode: string): string {
  return `muscle-map/mask/${view}/${muscleCode}/${Date.now()}.png`;
}
