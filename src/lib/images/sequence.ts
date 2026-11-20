import { activeByPosition, drawnOnAnotherStart, isSequencePublished } from "./publication.ts";
import type { PublishableImage } from "./publication.ts";
import { MID_POSITION, REVIEW_LABEL, framePositionLabel, intendedPosition } from "./types.ts";
import type { ExerciseImage, ExercisePose } from "./types.ts";

/**
 * Choosing the frames of a sequence to publish: Start, Mid (three-frame exercises) and End of ONE
 * subject. A pick only fills the slots the staff chose; the others stay the subject's active
 * frames, so the sequence that gets published is the pick laid over what is live.
 */
export type SequencePick = { start: string | null; mid: string | null; end: string | null };

export const EMPTY_PICK: SequencePick = { start: null, mid: null, end: null };

export type PickSlot = keyof SequencePick;

export const PICK_SLOTS: readonly PickSlot[] = ["start", "mid", "end"];

const SLOT_POSITION: Record<PickSlot, number> = { start: 0, mid: MID_POSITION, end: 2 };

export function slotOf(position: number): PickSlot | null {
  return PICK_SLOTS.find((slot) => SLOT_POSITION[slot] === position) ?? null;
}

export function slotPosition(slot: PickSlot): number {
  return SLOT_POSITION[slot];
}

export function slotLabel(slot: PickSlot): string {
  return framePositionLabel(SLOT_POSITION[slot]);
}

type PickImage = PublishableImage & Pick<ExerciseImage, "params" | "created_at">;

/**
 * Puts an image in the slot of `position` (and takes it out of any other slot); picking the image
 * already there clears the slot.
 */
export function togglePick(pick: SequencePick, position: number, imageId: string): SequencePick {
  const slot = slotOf(position);
  if (!slot) return pick;
  const others: SequencePick = {
    start: pick.start === imageId ? null : pick.start,
    mid: pick.mid === imageId ? null : pick.mid,
    end: pick.end === imageId ? null : pick.end,
  };
  return pick[slot] === imageId ? others : { ...others, [slot]: imageId };
}

/** The pick without `imageId` (rejected or deleted). */
export function unpick(pick: SequencePick, imageId: string): SequencePick {
  return {
    start: pick.start === imageId ? null : pick.start,
    mid: pick.mid === imageId ? null : pick.mid,
    end: pick.end === imageId ? null : pick.end,
  };
}

/** Whether a pick has no slot filled. */
export function isEmptyPick(pick: SequencePick): boolean {
  return PICK_SLOTS.every((slot) => pick[slot] == null);
}

/** The pick without images that were deleted, and without Mid for a two-frame exercise. */
export function cleanPick(
  pick: SequencePick,
  images: Pick<ExerciseImage, "id">[],
  twoFrames: boolean,
): SequencePick {
  const ids = new Set(images.map((image) => image.id));
  const keep = (id: string | null) => (id && ids.has(id) ? id : null);
  return { start: keep(pick.start), mid: twoFrames ? null : keep(pick.mid), end: keep(pick.end) };
}

/** What would be published: the pick over the active frame of each slot. */
export function effectivePick(
  pick: SequencePick,
  images: Pick<ExerciseImage, "id" | "active" | "position">[],
  twoFrames: boolean,
): SequencePick {
  const active = activeByPosition(images);
  const of = (slot: PickSlot) => pick[slot] ?? active.get(SLOT_POSITION[slot])?.id ?? null;
  return { start: of("start"), mid: twoFrames ? null : of("mid"), end: of("end") };
}

/** A problem with a pick: `blocking` ones stop the publish, the others are only worth a look. */
export type PickProblem = { slot: PickSlot | null; message: string; blocking: boolean };

/**
 * What is wrong with publishing `pick` over the active frames, before asking the database (which
 * checks the same rules and gets the last word). `images` are the frames of one
 * (style, exercise, subject).
 */
export function validatePick(
  pick: SequencePick,
  images: PickImage[],
  twoFrames: boolean,
): PickProblem[] {
  const problems: PickProblem[] = [];
  const block = (slot: PickSlot | null, message: string) =>
    problems.push({ slot, message, blocking: true });
  const note = (slot: PickSlot | null, message: string) =>
    problems.push({ slot, message, blocking: false });

  const chosen = effectivePick(pick, images, twoFrames);
  if (!chosen.start) block("start", "Pick a Start.");
  if (!twoFrames && !chosen.mid) block("mid", "Pick a Mid.");
  if (!chosen.end) block("end", "Pick an End.");

  const byId = new Map(images.map((image) => [image.id, image]));
  const used = PICK_SLOTS.filter((slot) => chosen[slot]);
  const ids = used.map((slot) => chosen[slot] as string);
  if (new Set(ids).size !== ids.length) block(null, "The same image cannot fill two slots.");

  for (const slot of used) {
    const image = byId.get(chosen[slot] as string);
    if (!image) {
      block(slot, `${slotLabel(slot)}: the image no longer exists.`);
      continue;
    }
    if (image.review_status === "rejected") {
      block(
        slot,
        `${slotLabel(slot)} is rejected. Mark it ${REVIEW_LABEL.pending.toLowerCase()} or ${REVIEW_LABEL.approved.toLowerCase()} first.`,
      );
    }
    const made = intendedPosition(image);
    if (made != null && made !== SLOT_POSITION[slot]) {
      note(slot, `${slotLabel(slot)} was made as ${framePositionLabel(made)}.`);
    }
  }

  const start = chosen.start ? byId.get(chosen.start) : undefined;
  if (start) {
    for (const slot of ["mid", "end"] as const) {
      const image = chosen[slot] ? byId.get(chosen[slot]) : undefined;
      if (image && drawnOnAnotherStart(image, start)) {
        block(
          slot,
          `${slotLabel(slot)} was drawn on another Start. Pick the Start it was drawn on, or a ${slotLabel(slot)} drawn on this one.`,
        );
      }
    }
  }
  return problems;
}

/** Whether publishing would change anything: a picked frame is not the live one, or the live sequence is not shown. */
export function needsPublish(
  pick: SequencePick,
  images: PublishableImage[],
  twoFrames: boolean,
): boolean {
  const active = activeByPosition(images);
  const differs = PICK_SLOTS.some(
    (slot) => pick[slot] != null && active.get(SLOT_POSITION[slot])?.id !== pick[slot],
  );
  return differs || !isSequencePublished(images, twoFrames);
}

function newestFirst(a: Pick<ExerciseImage, "created_at" | "id">, b: typeof a): number {
  return b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
}

/**
 * The newest candidates to publish: per slot the newest frame waiting for it (not active, not
 * rejected), a Mid / End only when it was drawn on the Start that results (the suggested one, else
 * the live one). Slots without a suitable candidate are left out, so they stay as they are live.
 */
export function suggestPick(images: PickImage[], twoFrames: boolean): SequencePick {
  const waiting = (position: number) =>
    images
      .filter(
        (image) =>
          !image.active &&
          image.review_status !== "rejected" &&
          intendedPosition(image) === position,
      )
      .sort(newestFirst);
  const newStart = waiting(0)[0];
  const start = newStart ?? activeByPosition(images).get(0);
  const fits = (image: PickImage) => !start || !drawnOnAnotherStart(image, start);
  const mid = twoFrames ? undefined : waiting(MID_POSITION).find(fits);
  const end = waiting(2).find(fits);
  return { start: newStart?.id ?? null, mid: mid?.id ?? null, end: end?.id ?? null };
}

/** The active frame id of each slot, as one side of a publish saw it. */
export type LiveFrames = SequencePick;

/** The live (active) frames of a subject by slot. */
export function liveFrames(images: Pick<ExerciseImage, "id" | "active" | "position">[]): LiveFrames {
  const active = activeByPosition(images);
  return {
    start: active.get(SLOT_POSITION.start)?.id ?? null,
    mid: active.get(SLOT_POSITION.mid)?.id ?? null,
    end: active.get(SLOT_POSITION.end)?.id ?? null,
  };
}

/** Whether the live frames now differ from the ones the panel showed when the pick was made. */
export function liveFramesChanged(expected: LiveFrames, actual: LiveFrames): boolean {
  return PICK_SLOTS.some((slot) => expected[slot] !== actual[slot]);
}

export const LIVE_CHANGED_MESSAGE =
  "The live frames of this subject changed since this page loaded (another tab or user published). Refresh the page and check before publishing.";

const PUBLISH_ERRORS: [string, string][] = [
  ["start_and_end_required", "Pick a Start and an End."],
  ["frames_must_differ", "Each slot needs a different image."],
  ["image_not_found", "One of the images no longer exists. Refresh the page and pick again."],
  ["mid_image_required", "This exercise uses three frames: a Mid is required."],
  [
    "two_frame_exercise_has_no_mid",
    "This exercise uses two frames (Start + End): publish without a Mid.",
  ],
  [
    "frames_of_another_sequence",
    "Every frame must be of the same style, exercise and subject.",
  ],
  ["insufficient_privilege", "Only staff can publish a sequence."],
  ["staff-only", "Only staff can publish a sequence."],
];

/**
 * The message for an error of `images_publish_exercise_sequence` (the function raises a short
 * code, with the offending image id after a colon for some). `labelOf` names that image.
 */
export function publishErrorMessage(
  raw: string,
  labelOf?: (imageId: string) => string | null,
): string {
  const rejected = /frame_rejected(?::\s*([0-9a-f-]{36}))?/i.exec(raw);
  if (rejected) {
    const label = rejected[1] ? labelOf?.(rejected[1]) : null;
    return `${label ?? "A frame"} was rejected in review. Pick another frame, or set it back to pending first.`;
  }
  const drawn = /frame_drawn_on_another_start(?::\s*([0-9a-f-]{36}))?/i.exec(raw);
  if (drawn) {
    const label = drawn[1] ? labelOf?.(drawn[1]) : null;
    return `${label ?? "A Mid or End"} was drawn on a different Start than the one picked. Pick the Start it was drawn on, or a frame drawn on this Start.`;
  }
  const known = PUBLISH_ERRORS.find(([code]) => raw.includes(code));
  return known ? known[1] : raw;
}

/** A pose that is not written or not approved for a position. */
export type PoseWarning = { position: number; status: "missing" | "generated" };

/**
 * Positions whose pose is not `approved`: frames are drawn from the pose text (or, without one,
 * from the description), so they are worth checking before they are generated or published.
 */
export function poseWarnings(
  poses: Pick<ExercisePose, "position" | "status">[],
  positions: number[],
): PoseWarning[] {
  const warnings: PoseWarning[] = [];
  for (const position of [...positions].sort((a, b) => a - b)) {
    const pose = poses.find((item) => item.position === position);
    if (!pose) warnings.push({ position, status: "missing" });
    else if (pose.status !== "approved") warnings.push({ position, status: "generated" });
  }
  return warnings;
}

/** "Pose not approved: Start (generated), End (missing)". Empty when every pose is approved. */
export function poseWarningText(warnings: PoseWarning[]): string {
  if (!warnings.length) return "";
  const detail = warnings
    .map(
      (w) =>
        `${framePositionLabel(w.position)} (${w.status === "missing" ? "no pose, drawn from the description" : "generated, not approved"})`,
    )
    .join(", ");
  return `Pose not approved: ${detail}`;
}
