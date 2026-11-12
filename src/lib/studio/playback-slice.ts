// Playback and view toggles of the studio store: playing or paused, the in-between time shown,
// the speed, and the grid, equipment and mocap-cleaning switches.
import type { PoseEditState } from "./pose-slice.ts";

/**
 * The playback part of the studio store. The canvas reads the playback controls imperatively
 * inside its frame loop and subscribes to the view toggles. The playhead step also moves the
 * pose the editor holds.
 */
export type PlaybackSlice = {
  playing: boolean;
  /**
   * Paused on a moment that is not a key pose (the timeline was scrubbed there, or a clip was
   * paused mid-loop): the stage shows the clip at this time, in seconds. Null while playing and
   * while the editor holds a key pose.
   */
  scrubTime: number | null;
  speed: number;
  showGrid: boolean;
  showEquipment: boolean;
  /** Clean motion-capture clips on load: ground and lock the feet, remove drift, close the loop. */
  cleanMocap: boolean;

  togglePlaying: () => void;
  /** Playing on, or stopped holding the selected pose (playback.ts pauses where it is). */
  setPlaying: (playing: boolean) => void;
  /** One step of the playhead: playing or not, the in-between time shown (or null), the pose held. */
  setStageTime: (next: { playing: boolean; scrubTime: number | null; keyframe?: number }) => void;
  setSpeed: (speed: number) => void;
  toggleGrid: () => void;
  toggleEquipment: () => void;
  toggleCleanMocap: () => void;
};

/** What the playback actions read and write: this slice, plus the pose editor's draft the playhead holds a pose of. */
type PlaybackView = PlaybackSlice & { poseEdit: PoseEditState | null };
type PlaybackSet = (partial: Partial<PlaybackView> | ((s: PlaybackView) => Partial<PlaybackView>)) => void;

export function createPlaybackSlice(set: PlaybackSet): PlaybackSlice {
  return {
    playing: true,
    scrubTime: null,
    speed: 1,
    showGrid: true,
    showEquipment: true,
    cleanMocap: true,

    togglePlaying: () => set((s) => ({ playing: !s.playing, scrubTime: null })),
    setPlaying: (playing) => set((s) => (s.playing === playing && s.scrubTime === null ? s : { playing, scrubTime: null })),
    setStageTime: ({ playing, scrubTime, keyframe }) =>
      set((s) => {
        const edit = s.poseEdit;
        const hold = keyframe !== undefined && edit ? Math.max(0, Math.min(keyframe, edit.poses.length - 1)) : null;
        const poseEdit = edit && hold !== null && hold !== edit.keyframe ? { ...edit, keyframe: hold, gestureOpen: false } : edit;
        if (s.playing === playing && s.scrubTime === scrubTime && poseEdit === edit) return s;
        return { playing, scrubTime, poseEdit };
      }),
    setSpeed: (speed) => set({ speed }),
    toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
    toggleEquipment: () => set((s) => ({ showEquipment: !s.showEquipment })),
    toggleCleanMocap: () => set((s) => ({ cleanMocap: !s.cleanMocap })),
  };
}
