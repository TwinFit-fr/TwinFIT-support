import { REVIEW_STATUSES } from "./types.ts";
import type { ExerciseImage, ReviewStatus, SequenceState } from "./types.ts";

/** The fields of a frame that decide whether the app shows it. */
export type PublishableImage = Pick<
  ExerciseImage,
  "id" | "active" | "position" | "review_status" | "drawing_id" | "start_drawing_id"
>;

/** Positions a sequence needs: Start and End, plus Mid unless the exercise uses two frames. */
export function requiredPositions(twoFrames: boolean): number[] {
  return twoFrames ? [0, 2] : [0, 1, 2];
}

/** The active frame of each position (at most one per position, as the database guarantees). */
export function activeByPosition<T extends Pick<ExerciseImage, "active" | "position">>(
  images: T[],
): Map<number, T> {
  const map = new Map<number, T>();
  for (const image of images) {
    if (image.active && image.position != null) map.set(image.position, image);
  }
  return map;
}

/**
 * Mirrors `images.published_frames` for the frames of ONE (style, exercise, subject): every frame
 * the exercise uses is active and approved, and each Mid / End was drawn on the active Start.
 * The style being published is not checked here.
 */
export function isSequencePublished(images: PublishableImage[], twoFrames: boolean): boolean {
  const active = activeByPosition(images);
  const start = active.get(0);
  if (!start || start.review_status !== "approved") return false;
  return requiredPositions(twoFrames).every((position) => {
    const frame = active.get(position);
    if (!frame || frame.review_status !== "approved") return false;
    return position === 0 || frame.start_drawing_id === start.drawing_id;
  });
}

/** Published, or active frames the app does not show, or nothing active. */
export function sequenceState(images: PublishableImage[], twoFrames: boolean): SequenceState {
  if (!images.some((image) => image.active && image.position != null)) return "empty";
  return isSequencePublished(images, twoFrames) ? "published" : "unpublished";
}

/** Frames per review status. */
export function reviewCounts(
  images: Pick<ExerciseImage, "review_status">[],
): Record<ReviewStatus, number> {
  const counts = Object.fromEntries(REVIEW_STATUSES.map((status) => [status, 0])) as Record<
    ReviewStatus,
    number
  >;
  for (const image of images) counts[image.review_status] += 1;
  return counts;
}

/** A Mid / End drawn on a Start other than `start` (the database rejects it); false when unknown. */
export function drawnOnAnotherStart(
  frame: Pick<ExerciseImage, "start_drawing_id">,
  start: Pick<ExerciseImage, "drawing_id">,
): boolean {
  return frame.start_drawing_id != null && frame.start_drawing_id !== start.drawing_id;
}
