/**
 * A motion capture, already retargeted to the avatar (mocap.ts), turned into the pose editor's
 * document: every frame read back into PoseAngles (pose-from-bones.ts), then reduced to a few key
 * poses (key-poses.ts). Reading the frames is the slow half, so it is done a few frames at a time
 * (`readCapture` yields between chunks and can be stopped); the reduction is cheap and runs again
 * whenever the Detail setting changes. No scene: the clip is sampled from its tracks.
 */

import * as THREE from "three";
import { clampToLimit, type PoseAngles } from "./anatomy.ts";
import { missingParts } from "./capture-words.ts";
import { DETAIL_SPEC, reduceToKeyPoses, type Detail, type KeyPoses } from "./key-poses.ts";
import { LOGICAL_BONES, forwardKinematics, type Logical, type Rig } from "./pose-clip.ts";
import { measuredDeltas, poseFromDeltas } from "./pose-from-bones.ts";

/** Frames per second the capture is read at (a finer capture is sampled down to it). */
export const CAPTURE_FPS = 30;
/** A supporting foot further than this from where it started has travelled (metres). */
const TRAVEL_M = 0.15;
/** A foot this much higher than the other is off the floor (metres). */
const LIFTED_M = 0.08;

export type CaptureFrames = {
  times: number[];
  poses: PoseAngles[];
  /**
   * The largest difference between a frame's bones and the pose read from them, degrees, and the
   * bone: what the editor's joints cannot do of the capture (a knee that is not a pure hinge, a
   * joint past its range).
   */
  residual: number;
  residualBone: Logical | null;
  duration: number;
  fps: number;
  /** Joints held to their range on some frame ("left elbow"), and how far past it at most, degrees. */
  clamped: string[];
  clampedBy: number;
  /** Avatar body parts the capture does not move, in words. */
  missing: string[];
  /** The feet moved across the floor: the poses keep the body where it started. */
  travel: boolean;
};

export type CaptureSource = {
  clip: THREE.AnimationClip;
  /** Avatar bone names the capture moves (the retarget's mapping). */
  driven: Set<string>;
};

type TrackReader = { bone: string; kind: "quaternion" | "position"; evaluate: (t: number) => ArrayLike<number> };

function trackReaders(clip: THREE.AnimationClip): TrackReader[] {
  return clip.tracks.flatMap((track) => {
    const dot = track.name.lastIndexOf(".");
    const bone = track.name.slice(0, dot);
    const kind = track.name.slice(dot + 1);
    if (kind !== "quaternion" && kind !== "position") return [];
    // Each track builds its own interpolant (slerp for rotations); its typing leaves it out.
    const interpolant = (track as unknown as { createInterpolant: () => THREE.Interpolant }).createInterpolant();
    return [{ bone, kind, evaluate: (t: number) => interpolant.evaluate(t) }];
  });
}

/** "left_arm.elbow_flexion: 162 -> 150" -> "left elbow". */
function jointWords(entry: string): string {
  const path = entry.split(":")[0];
  const [group, field] = path.split(".");
  const side = group.startsWith("left") ? "left " : group.startsWith("right") ? "right " : "";
  const joint = field.split("_")[0];
  const name = { shoulder: "shoulder", scapula: "shoulder blade", elbow: "elbow", forearm: "forearm", wrist: "wrist", hip: "hip", knee: "knee", ankle: "ankle" }[joint] ?? group;
  return `${side}${name}`;
}

/** Below this elevation (degrees) the plane an arm rises in is barely seen, and a shaky capture's reading of it is noise. */
const PLANE_UNSEEN = 10;

/**
 * An arm hanging along the trunk has no plane to rise in to speak of: on those frames the plane
 * follows the trend of the nearest frames where the arm is raised (a straight line of plane
 * against elevation, carried down to the frame's elevation), or, if it never is raised, the middle
 * of what was read. Key poses then do not swing the plane around for nothing.
 */
function settleArmPlanes(poses: PoseAngles[]) {
  for (const arm of ["left_arm", "right_arm"] as const) {
    const elevation = (i: number) => poses[i][arm].shoulder_elevation;
    const plane = (i: number) => poses[i][arm].shoulder_plane;
    const seen = (i: number) => elevation(i) >= PLANE_UNSEEN;
    const read = poses.map((_, i) => plane(i)).sort((a, b) => a - b);
    const middle = read[read.length >> 1] ?? 0;
    const settled = poses.map((_, i) => {
      if (seen(i)) return plane(i);
      let j = -1;
      for (let d = 1; d < poses.length && j < 0; d += 1) j = [i - d, i + d].find((k) => k >= 0 && k < poses.length && seen(k)) ?? -1;
      if (j < 0) return middle;
      // The raised frames next to it, on its side, while the arm is still low.
      const step = j < i ? -1 : 1;
      const run: number[] = [];
      for (let k = j; k >= 0 && k < poses.length && seen(k) && run.length < 20 && elevation(k) <= 60; k += step) run.push(k);
      const es = run.map(elevation);
      if (run.length < 4 || Math.max(...es) - Math.min(...es) < 5) return plane(j);
      const me = es.reduce((a, b) => a + b, 0) / es.length;
      const mp = run.reduce((a, k) => a + plane(k), 0) / run.length;
      const slope = run.reduce((a, k) => a + (elevation(k) - me) * (plane(k) - mp), 0) / es.reduce((a, e) => a + (e - me) ** 2, 0);
      return clampToLimit(`${arm}.shoulder_plane`, mp + slope * (elevation(i) - me));
    });
    poses.forEach((p, i) => (poses[i] = { ...p, [arm]: { ...p[arm], shoulder_plane: settled[i] } }));
  }
}

/**
 * Reads a retargeted capture frame by frame on this rig: `count` frames, `read(i)` one of them
 * (in order), `finish()` the result. Frames are read in order so each keeps its angles continuous
 * with the previous one.
 */
export function createCaptureReader(rig: Rig, source: CaptureSource, fps = CAPTURE_FPS) {
  const duration = Math.max(source.clip.duration, 1 / fps);
  const count = Math.max(2, Math.round(duration * fps) + 1);
  const readers = trackReaders(source.clip);
  const hipsName = rig.names.Hips;
  const hipsRest = hipsName ? rig.rest.get(hipsName) : undefined;
  const drivenLogical = new Set<Logical>(LOGICAL_BONES.filter((l) => rig.names[l] && source.driven.has(rig.names[l]!)));
  // A spine bone the capture does not move still follows the others; the spine counts as moved when any of it is.
  const spineMoved = rig.spine.some((l) => drivenLogical.has(l));
  const driven = (l: Logical) => drivenLogical.has(l) || (spineMoved && rig.spine.includes(l));
  const present = (l: Logical) => Boolean(rig.names[l] && rig.rest.has(rig.names[l]!));

  const times: number[] = [];
  const poses: PoseAngles[] = [];
  let residual = 0;
  let residualBone: Logical | null = null;
  const clamped = new Map<string, number>();
  const feet: { start: THREE.Vector3[] | null; travel: boolean } = { start: null, travel: false };
  let previous: PoseAngles | null = null;
  let standing = true;

  const read = (i: number) => {
    const t = Math.min(duration, i / fps);
    const local = new Map<string, THREE.Quaternion>();
    const hipsPosition = hipsRest ? hipsRest.position.clone() : new THREE.Vector3();
    for (const r of readers) {
      const v = r.evaluate(t);
      if (r.kind === "quaternion") local.set(r.bone, new THREE.Quaternion(v[0], v[1], v[2], v[3]).normalize());
      else if (r.bone === hipsName) hipsPosition.set(v[0], v[1], v[2]);
    }
    const fk = forwardKinematics(rig, local, hipsPosition);
    const measured = measuredDeltas(rig, fk);
    const result = poseFromDeltas(rig, measured, { previous, driven });
    const pose = result.pose;
    // Lying or standing, read once from the first frame: the pelvis tilted past 50 degrees lies down.
    if (i === 0) standing = Math.abs(pose.hips.pitch) <= 50;
    const footPos = rig.feet.map((f) => fk.get(f.name)!.pos.clone());
    const footRise = rig.feet.map((f, k) => footPos[k].y - f.ankleRestY);
    if (standing) {
      pose.orientation = "standing";
      pose.feet_flat = true;
      pose.hips = { ...pose.hips, height_m: null, forward_m: 0 };
      // A foot well above the other does not carry the body (a lunge's back foot, a knee raise).
      if (footRise.length === 2 && Math.abs(footRise[0] - footRise[1]) > LIFTED_M) pose.free_foot = rig.feet[footRise[0] > footRise[1] ? 0 : 1].side;
    } else {
      pose.orientation = pose.hips.pitch > 0 ? "prone" : "supine";
      pose.feet_flat = false;
      const hipsWorld = hipsName ? fk.get(hipsName)?.pos.y : undefined;
      pose.hips = { ...pose.hips, height_m: hipsWorld ?? null, forward_m: 0 };
    }
    // Travel: the foot carrying the body moved across the floor from where it started.
    if (!feet.start) feet.start = footPos.map((p) => p.clone().setY(0));
    else if (footPos.length) {
      const lowest = footRise.indexOf(Math.min(...footRise));
      const moved = footPos[lowest].clone().setY(0).distanceTo(feet.start[lowest]);
      if (moved > TRAVEL_M) feet.travel = true;
    }
    for (const entry of result.clamped) {
      const m = /: (-?[\d.]+) -> (-?[\d.]+)$/.exec(entry);
      const by = m ? Math.abs(Number(m[1]) - Number(m[2])) : 0;
      const words = jointWords(entry);
      clamped.set(words, Math.max(clamped.get(words) ?? 0, by));
    }
    if (result.residual > residual) [residual, residualBone] = [result.residual, result.worst];
    times.push(t);
    poses.push(pose);
    previous = pose;
  };

  const finish = (): CaptureFrames => {
    settleArmPlanes(poses);
    // Small clamps are the rig's rounding, not something the capture did.
    const worth = [...clamped.entries()].filter(([, by]) => by >= 3);
    return {
      times,
      poses,
      residual,
      residualBone,
      duration,
      fps,
      clamped: worth.map(([w]) => w),
      clampedBy: worth.reduce((m, [, by]) => Math.max(m, by), 0),
      missing: missingParts(present, driven),
      travel: feet.travel,
    };
  };

  return { count, read, finish };
}

/** All frames at once (tests, small clips). */
export function readCaptureNow(rig: Rig, source: CaptureSource, fps = CAPTURE_FPS): CaptureFrames {
  const reader = createCaptureReader(rig, source, fps);
  for (let i = 0; i < reader.count; i += 1) reader.read(i);
  return reader.finish();
}

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * The frames, read a few milliseconds at a time so the page keeps responding. `stopped` is asked
 * between chunks (another exercise or avatar was picked): the reading ends and null is returned.
 */
export async function readCapture(
  rig: Rig,
  source: CaptureSource,
  options: { stopped?: () => boolean; onProgress?: (done: number, total: number) => void; sliceMs?: number; fps?: number } = {},
): Promise<CaptureFrames | null> {
  const reader = createCaptureReader(rig, source, options.fps ?? CAPTURE_FPS);
  const slice = options.sliceMs ?? 12;
  let i = 0;
  while (i < reader.count) {
    if (options.stopped?.()) return null;
    const start = performance.now();
    while (i < reader.count && performance.now() - start < slice) reader.read(i++);
    options.onProgress?.(i, reader.count);
    if (i < reader.count) await nextTask();
  }
  return options.stopped?.() ? null : reader.finish();
}

export type CaptureKeyPoses = KeyPoses & {
  labels: string[];
  /** Frames the capture was read at. */
  frameCount: number;
};

/** The key poses of a capture at a detail level, named by the frame they come from. */
export function keyPosesFromCapture(frames: CaptureFrames, rig: Rig, detail: Detail): CaptureKeyPoses {
  const keys = reduceToKeyPoses({ times: frames.times, poses: frames.poses, duration: frames.duration }, rig, DETAIL_SPEC[detail]);
  const labels = keys.frames.map((f, i) => (i === 0 ? "start" : `frame ${f}`));
  return { ...keys, labels, frameCount: frames.times.length };
}

/** Clip files that are motion captures (played retargeted; editable as key poses), as opposed to pose clips (.json). */
export function isCaptureFormat(format: string | null | undefined): boolean {
  return format === "bvh" || format === "fbx" || format === "glb" || format === "gltf";
}
