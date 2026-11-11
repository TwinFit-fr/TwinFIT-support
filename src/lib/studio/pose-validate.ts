/**
 * Does a pose clip hold up as a body? Everything here is measured on the rig, on sampled frames
 * and not just keyframes: soles on the floor, feet that stay put, nothing through the floor, the
 * centre of mass over the feet, joints inside their ranges (rom.ts), both sides alike. Errors are
 * what no body does; warnings are what is possible but outside normal training.
 */

import * as THREE from "three";
import { upgradePoseClip, type PoseAngles, type PoseClipJson } from "./anatomy.ts";
import { jointName } from "./joint-props.ts";
import { sampleClip, type ClipSample, type RestPose } from "./pose-clip.ts";
import { ROM } from "./rom.ts";
import type { AvatarSocket } from "./types";

export type PoseIssue = { severity: "error" | "warning"; code: string; message: string };
export type PoseValidation = { ok: boolean; issues: PoseIssue[]; metrics: Record<string, number>; located?: PoseLocations };

/** Where each check fails: the thresholds below, applied to one sampled frame or one key pose. */
export const LIMITS = { tilt: 3, sink: 0.02, slide: 0.03, floor: 0.03, comFront: 0.08, comBack: 0.08, comSide: 0.1, handGap: 0.08 } as const;

type XYZ = [number, number, number];
/** One carrying foot of a standing frame: what the foot checks measured on it (null: not measured, feet not flat). */
export type FootReading = { side: "left" | "right"; tilt: number | null; sink: number | null; slide: number; ankle: XYZ };
/**
 * What the checks measured on one sampled frame, kept when asked for (options.locate): the body
 * checks on the stage and the timeline show where and when a check fails from these.
 */
export type FrameReading = {
  t: number;
  orientation: string;
  /** Only while standing: the feet that carry the body. */
  feet: FootReading[];
  /**
   * Only while standing: the feet that do not carry the body, with the ankle's height above its
   * place on the floor (metres) and whether the pose itself sets that foot free (free_foot).
   */
  lifted: { side: "left" | "right"; height: number; free: boolean }[];
  /** The lowest joint, by logical name ("LeftToeBase") when the rig maps it; y in metres. */
  lowest: { bone: string; logical: string | null; y: number };
  /** Balance, when it is checked on this frame: the centre of mass and the base of support on the floor. */
  balance: { com: XYZ; heel: number; toes: number; left: number; right: number } | null;
  /** Height between the hands, when "both sides alike" is checked on this frame. */
  handGap: number | null;
  /** Height of each hand (for marking the one out of line). */
  hands: { left: number; right: number } | null;
};
/** A joint value outside its range in one key pose of the clip (clip keyframe `key`, reached at `t`). */
export type RangeReading = { key: number; t: number; path: string; value: number; limit: [number, number]; severity: "error" | "warning"; kind: "range" | "training" | "extension" };
export type PoseLocations = {
  frames: FrameReading[];
  ranges: RangeReading[];
  duration: number;
  /** The clip's flags that switch checks off. */
  unilateral: boolean;
  airborne: boolean;
  moving: boolean;
};

/** Segment mass fractions, Dempster via Winter's tables: the crude model the audit used, good for gross errors only. */
const SEGMENTS: [string, string, number][] = [
  ["Hips", "Head", 0.578],
  ["LeftUpLeg", "LeftLeg", 0.1],
  ["RightUpLeg", "RightLeg", 0.1],
  ["LeftLeg", "LeftFoot", 0.0465],
  ["RightLeg", "RightFoot", 0.0465],
  ["LeftArm", "LeftForeArm", 0.028],
  ["RightArm", "RightForeArm", 0.028],
  ["LeftForeArm", "LeftHand", 0.016],
  ["RightForeArm", "RightHand", 0.016],
];
const FOOT_MASS = 0.0145;

const round = (v: number, digits = 3) => +v.toFixed(digits);

function centreOfMass(sample: ClipSample): THREE.Vector3 | null {
  const com = new THREE.Vector3();
  let mass = 0;
  for (const [a, b, m] of SEGMENTS) {
    const pa = sample.bones[a as keyof ClipSample["bones"]]?.position;
    const pb = sample.bones[b as keyof ClipSample["bones"]]?.position;
    if (!pa || !pb) return null;
    com.addScaledVector(pa.clone().add(pb).multiplyScalar(0.5), m);
    mass += m;
  }
  for (const foot of sample.feet) {
    com.addScaledVector(foot.ankle, FOOT_MASS);
    mass += FOOT_MASS;
  }
  return com.divideScalar(mass);
}

/** The logical name of the lowest joint of a frame, when the rig maps it. */
function lowestLogical(sample: ClipSample): string | null {
  let best: string | null = null;
  let y = Infinity;
  for (const [name, bone] of Object.entries(sample.bones)) {
    if (bone && bone.position.y < y) [best, y] = [name, bone.position.y];
  }
  return best;
}

function checkRanges(pose: PoseAngles, label: string, add: (issue: PoseIssue) => void, found?: (reading: Omit<RangeReading, "key" | "t">) => void) {
  const seen = new Set<string>();
  const once = (issue: PoseIssue) => {
    if (!seen.has(issue.code)) add(issue);
    seen.add(issue.code);
  };
  const sections: [string, string, object][] = [
    ["left_arm", "arm", pose.left_arm],
    ["right_arm", "arm", pose.right_arm],
    ["left_leg", "leg", pose.left_leg],
    ["right_leg", "leg", pose.right_leg],
    ["lumbar", "lumbar", pose.lumbar],
    ["thoracic", "thoracic", pose.thoracic],
    ["head", "head", pose.head],
  ];
  for (const [name, group, values] of sections) {
    for (const [key, value] of Object.entries(values)) {
      const range = ROM[`${group}.${key}`];
      if (!range || typeof value !== "number") continue;
      const path = `${name}.${key}`;
      if (value < range.hard[0] - 0.5 || value > range.hard[1] + 0.5) found?.({ path, value, limit: range.hard, severity: "error", kind: "range" });
      else if (value < range.training[0] - 0.5 || value > range.training[1] + 0.5) found?.({ path, value, limit: range.training, severity: "warning", kind: "training" });
      if (value < range.hard[0] - 0.5 || value > range.hard[1] + 0.5) once({ severity: "error", code: `range:${path}`, message: `${label}: ${jointName(path)} ${round(value, 1)}° is past its range (${range.hard.join(" to ")}°)` });
      else if (value < range.training[0] - 0.5 || value > range.training[1] + 0.5) once({ severity: "warning", code: `training:${path}`, message: `${label}: ${jointName(path)} ${round(value, 1)}° is outside normal training (${range.training.join(" to ")}°)` });
    }
  }
  for (const [name, arm] of [["left", pose.left_arm], ["right", pose.right_arm]] as const) {
    // Behind the body the shoulder stops much earlier: extension 54° (28-80), UK review.
    if (arm.shoulder_plane < -45 && arm.shoulder_elevation > 80) found?.({ path: `${name}_arm.shoulder_elevation`, value: arm.shoulder_elevation, limit: [0, 80], severity: "error", kind: "extension" });
    if (arm.shoulder_plane < -45 && arm.shoulder_elevation > 80) once({ severity: "error", code: `extension:${name}`, message: `${label}: ${name} arm ${round(arm.shoulder_elevation, 0)}° behind the body` });
  }
}

export function validatePoseClip(
  model: THREE.Object3D,
  saved: PoseClipJson,
  rest: RestPose,
  sockets: AvatarSocket[] = [],
  options: { unilateral?: boolean; airborne?: boolean; moving?: boolean; /** Also say where each check fails (`located`). */ locate?: boolean } = {},
): PoseValidation {
  const clip = upgradePoseClip(saved);
  const unilateral = options.unilateral ?? clip.meta?.unilateral === true;
  const airborne = options.airborne ?? clip.meta?.airborne === true;
  const moving = options.moving ?? clip.meta?.moving === true;
  const { samples, resolved, ankleFloor } = sampleClip(model, clip, rest, sockets);
  const issues: PoseIssue[] = [];
  const add = (issue: PoseIssue) => {
    if (!issues.some((i) => i.code === issue.code)) issues.push(issue);
  };
  const metrics = { tilt: 0, slide: 0, sink: 0, floor: 0, comAhead: 0, comBehind: 0, comSide: 0 };

  const located: PoseLocations | undefined = options.locate ? { frames: [], ranges: [], duration: samples.length ? samples[samples.length - 1].t : 0, unilateral, airborne, moving } : undefined;
  const keyTimes = [...clip.keyframes].map((k) => k.t).sort((a, b) => a - b);
  resolved.forEach((pose, i) => checkRanges(pose, `Pose ${i + 1}`, add, located ? (r) => located.ranges.push({ ...r, key: i, t: keyTimes[i] ?? 0 }) : undefined));

  const home: Partial<Record<"left" | "right", THREE.Vector3>> = {};
  let deepest = "";
  for (const s of samples) {
    const standing = s.pose.orientation === "standing";
    // Bone origins: the mesh hangs a little below them, so this is a floor for joints, not skin.
    if (s.lowest.y < metrics.floor) {
      metrics.floor = s.lowest.y;
      deepest = s.lowest.bone;
    }
    const reading: FrameReading | null = located ? { t: s.t, orientation: s.pose.orientation, feet: [], lifted: [], lowest: { ...s.lowest, logical: lowestLogical(s) }, balance: null, handGap: null, hands: null } : null;
    if (reading) located!.frames.push(reading);
    if (!standing) continue;
    const carrying = s.feet.filter((f) => f.support > 0.5);
    for (const foot of s.feet) if (foot.support <= 0.5) reading?.lifted.push({ side: foot.side, height: foot.ankle.y - ankleFloor, free: s.pose.free_foot === foot.side });
    for (const foot of carrying) {
      const flat = s.pose.feet_flat !== false;
      if (flat) metrics.tilt = Math.max(metrics.tilt, foot.tilt);
      if (flat) metrics.sink = Math.max(metrics.sink, ankleFloor - foot.ankle.y);
      const start = (home[foot.side] ??= foot.ankle.clone());
      const slide = Math.hypot(foot.ankle.x - start.x, foot.ankle.z - start.z);
      metrics.slide = Math.max(metrics.slide, slide);
      reading?.feet.push({ side: foot.side, tilt: flat ? foot.tilt : null, sink: flat ? ankleFloor - foot.ankle.y : null, slide, ankle: [foot.ankle.x, foot.ankle.y, foot.ankle.z] });
    }
    const com = centreOfMass(s);
    if (com && carrying.length && !airborne && !moving) {
      // Base of support: heel behind the ankles, toes ahead of them, feet apart.
      const heel = Math.min(...carrying.map((f) => f.ankle.z)) - 0.09;
      const toes = Math.max(...carrying.map((f) => f.ankle.z)) + 0.2;
      const left = Math.max(...carrying.map((f) => f.ankle.x)) + 0.06;
      const right = Math.min(...carrying.map((f) => f.ankle.x)) - 0.06;
      metrics.comAhead = Math.max(metrics.comAhead, com.z - toes);
      metrics.comBehind = Math.max(metrics.comBehind, heel - com.z);
      metrics.comSide = Math.max(metrics.comSide, com.x - left, right - com.x);
      if (reading) reading.balance = { com: [com.x, com.y, com.z], heel, toes, left, right };
    }
    if (!unilateral) {
      const d = Math.abs((s.bones.LeftHand?.position.y ?? 0) - (s.bones.RightHand?.position.y ?? 0));
      if (reading && !moving) {
        reading.handGap = d;
        reading.hands = { left: s.bones.LeftHand?.position.y ?? 0, right: s.bones.RightHand?.position.y ?? 0 };
      }
      if (d > LIMITS.handGap && !moving) add({ severity: "warning", code: "symmetry", message: `The hands are ${round(d, 2)} m apart in height in a two-sided exercise` });
    }
  }

  if (metrics.tilt > LIMITS.tilt) add({ severity: "error", code: "tilt", message: `A sole on the floor tilts ${round(metrics.tilt, 1)}°` });
  if (metrics.sink > LIMITS.sink) add({ severity: "error", code: "sink", message: `An ankle sinks ${round(metrics.sink)} m` });
  if (metrics.slide > LIMITS.slide && !moving && !airborne) add({ severity: "error", code: "slide", message: `A foot slides ${round(metrics.slide)} m` });
  if (metrics.floor < -LIMITS.floor) add({ severity: "error", code: "floor", message: `${deepest} goes ${round(-metrics.floor)} m through the floor` });
  if (metrics.comAhead > LIMITS.comFront) add({ severity: "error", code: "balance-front", message: `The centre of mass is ${round(metrics.comAhead)} m ahead of the toes` });
  if (metrics.comBehind > LIMITS.comBack) add({ severity: "error", code: "balance-back", message: `The centre of mass is ${round(metrics.comBehind)} m behind the heels` });
  if (metrics.comSide > LIMITS.comSide) add({ severity: "warning", code: "balance-side", message: `The centre of mass is ${round(metrics.comSide)} m outside the feet` });

  return { ok: !issues.some((i) => i.severity === "error"), issues, metrics, ...(located ? { located } : {}) };
}
