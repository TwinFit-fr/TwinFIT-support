/**
 * What the playback controls do to the Studio: play from the playhead, pause where it is, put
 * the playhead on a moment (a key pose is then held and can be edited; anywhere else the stage
 * shows the in-between), step between keys. The timeline, the stage toolbar's Space key, the pose
 * editor's Play button and a grab on the stage all go through here.
 */
import { useStudioStore, type PoseEditState, type StudioState } from "./store.ts";
import { useTimelineClock } from "./timeline-clock.ts";
import { adjacentKey, clampTime, heldKeyTime, keyAt, keyTolerance, nearestKey, timelineKeys, type TimelineKey } from "./timeline.ts";

type Draft = Pick<PoseEditState, "poses" | "durationS" | "mode" | "weights">;

/** The key poses of the editor's draft on the timeline. */
export function draftKeys(edit: Draft): TimelineKey[] {
  return timelineKeys({ poseCount: edit.poses.length, durationS: edit.durationS, mode: edit.mode, weights: edit.weights });
}

/** Length of what is on the stage: the editor's draft, else the clip playing; null when nothing is. */
export function stageDuration(s: Pick<StudioState, "poseEdit"> = useStudioStore.getState()): number | null {
  return s.poseEdit ? s.poseEdit.durationS : useTimelineClock.getState().clipDuration;
}

/**
 * Where the playhead is: the playback time while playing, the in-between being shown, the key
 * of the pose being held, else (a clip paused) where it stopped.
 */
export function stageTime(
  s: Pick<StudioState, "poseEdit" | "playing" | "scrubTime"> = useStudioStore.getState(),
  clock: { playTime: number; heldAt: number | null } = useTimelineClock.getState(),
): number {
  if (s.playing) return clock.playTime;
  if (s.scrubTime !== null) return s.scrubTime;
  if (s.poseEdit) return heldKeyTime(draftKeys(s.poseEdit), s.poseEdit.keyframe, clock.heldAt, keyTolerance(s.poseEdit.fps));
  return clock.playTime;
}

/** Play on from the playhead (or from `from` seconds). */
export function play(from?: number) {
  const s = useStudioStore.getState();
  const duration = stageDuration(s);
  const start = from ?? stageTime(s);
  useTimelineClock.getState().setPlayTime(duration ? clampTime(start, duration) : start);
  s.setStageTime({ playing: true, scrubTime: null });
}

/**
 * Put the playhead at `t` seconds and stop there. On a key pose (within half a frame) that pose
 * is held, selected for editing; between keys the stage shows the clip at that moment.
 */
export function seek(t: number) {
  const s = useStudioStore.getState();
  const clock = useTimelineClock.getState();
  const duration = stageDuration(s);
  const time = duration !== null ? clampTime(t, duration) : Math.max(0, t);
  if (s.poseEdit) {
    const keys = draftKeys(s.poseEdit);
    const on = keyAt(keys, time, keyTolerance(s.poseEdit.fps));
    if (on >= 0) {
      clock.setHeldAt(keys[on].t);
      clock.setPlayTime(keys[on].t);
      s.setStageTime({ playing: false, scrubTime: null, keyframe: keys[on].pose });
      return;
    }
  }
  clock.setPlayTime(time);
  s.setStageTime({ playing: false, scrubTime: time });
}

/** Pause where playback is (a pose held if that is a key, else the in-between). */
export function pause() {
  seek(useTimelineClock.getState().playTime);
}

export function togglePlayback() {
  if (useStudioStore.getState().playing) pause();
  else play();
}

/** Select key `index` of the timeline: the playhead goes there and its pose is held. */
export function selectKey(keys: TimelineKey[], index: number) {
  const key = keys[index];
  if (key) seek(key.t);
}

/** The key before or after the playhead, if there is one. */
export function neighbourKey(dir: 1 | -1): { keys: TimelineKey[]; index: number } {
  const s = useStudioStore.getState();
  if (!s.poseEdit) return { keys: [], index: -1 };
  const keys = draftKeys(s.poseEdit);
  return { keys, index: adjacentKey(keys, stageTime(s), dir, keyTolerance(s.poseEdit.fps)) };
}

export function stepKey(dir: 1 | -1) {
  const { keys, index } = neighbourKey(dir);
  selectKey(keys, index);
}

/** Move the playhead by `frames` frames of the clip (negative: back). */
export function stepFrames(frames: number) {
  const s = useStudioStore.getState();
  const fps = s.poseEdit?.fps ?? 30;
  seek(stageTime(s) + frames / fps);
}

/**
 * A grab on the stage while the view is not a held key (playing, or an in-between): the nearest
 * key pose is held first, so the drag edits a real pose. Returns that pose's index, or null when
 * a key was already held.
 */
export function holdNearestKey(): number | null {
  const s = useStudioStore.getState();
  if (!s.poseEdit || (!s.playing && s.scrubTime === null)) return null;
  const keys = draftKeys(s.poseEdit);
  const i = nearestKey(keys, stageTime(s));
  if (i < 0) return null;
  seek(keys[i].t);
  return keys[i].pose;
}
