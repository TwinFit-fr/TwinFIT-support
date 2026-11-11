import { create } from "zustand";

/**
 * The playhead as the 3D stage reports it, kept apart from the main Studio store so a moving
 * playhead (written every frame while a clip plays) only re-renders the timeline, never the
 * panels or the canvas.
 */
export type TimelineClock = {
  /** Seconds into the loop: where playback is, and where it starts from on the next Play. */
  playTime: number;
  /** Length of the clip the stage plays (a saved or mocap clip, or the editor's baked draft); null when none. */
  clipDuration: number | null;
  /** The key time the playhead was put on while a pose is held (a boomerang reaches a pose twice). */
  heldAt: number | null;
  setPlayTime: (t: number) => void;
  setClipDuration: (duration: number | null) => void;
  setHeldAt: (t: number | null) => void;
};

export const useTimelineClock = create<TimelineClock>((set) => ({
  playTime: 0,
  clipDuration: null,
  heldAt: null,
  // Sub-millisecond moves are not worth a render of the timeline.
  setPlayTime: (playTime) => set((s) => (Math.abs(s.playTime - playTime) < 1e-4 ? s : { playTime })),
  setClipDuration: (clipDuration) => set((s) => (s.clipDuration === clipDuration ? s : { clipDuration })),
  setHeldAt: (heldAt) => set((s) => (s.heldAt === heldAt ? s : { heldAt })),
}));
