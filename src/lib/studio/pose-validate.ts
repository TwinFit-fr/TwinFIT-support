/**
 * Does a pose clip hold up as a body? Everything here is measured on the rig, on sampled frames
 * and not just keyframes: soles on the floor, feet that stay put, nothing through the floor, the
 * centre of mass over the feet, joints inside their ranges (rom.ts), both sides alike. Errors are
 * what no body does; warnings are what is possible but outside normal training.
 */

import * as THREE from "three";
import { upgradePoseClip, type PoseAngles, type PoseClipJson } from "./anatomy.ts";
import { sampleClip, type ClipSample, type RestPose } from "./pose-clip.ts";
import { ROM } from "./rom.ts";
import type { AvatarSocket } from "./types";

export type PoseIssue = { severity: "error" | "warning"; code: string; message: string };
export type PoseValidation = { ok: boolean; issues: PoseIssue[]; metrics: Record<string, number> };

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

function checkRanges(pose: PoseAngles, label: string, add: (issue: PoseIssue) => void) {
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
      if (value < range.hard[0] - 0.5 || value > range.hard[1] + 0.5) once({ severity: "error", code: `range:${path}`, message: `${label}: ${path} ${round(value, 1)}° is past its range (${range.hard.join(" to ")}°)` });
      else if (value < range.training[0] - 0.5 || value > range.training[1] + 0.5) once({ severity: "warning", code: `training:${path}`, message: `${label}: ${path} ${round(value, 1)}° is outside normal training (${range.training.join(" to ")}°)` });
    }
  }
  for (const [name, arm] of [["left", pose.left_arm], ["right", pose.right_arm]] as const) {
    // Behind the body the shoulder stops much earlier: extension 54° (28-80), UK review.
    if (arm.shoulder_plane < -45 && arm.shoulder_elevation > 80) once({ severity: "error", code: `extension:${name}`, message: `${label}: ${name} arm ${round(arm.shoulder_elevation, 0)}° behind the body` });
  }
}

export function validatePoseClip(
  model: THREE.Object3D,
  saved: PoseClipJson,
  rest: RestPose,
  sockets: AvatarSocket[] = [],
  options: { unilateral?: boolean; airborne?: boolean; moving?: boolean } = {},
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

  resolved.forEach((pose, i) => checkRanges(pose, `Pose ${i + 1}`, add));

  const home: Partial<Record<"left" | "right", THREE.Vector3>> = {};
  let deepest = "";
  for (const s of samples) {
    const standing = s.pose.orientation === "standing";
    // Bone origins: the mesh hangs a little below them, so this is a floor for joints, not skin.
    if (s.lowest.y < metrics.floor) {
      metrics.floor = s.lowest.y;
      deepest = s.lowest.bone;
    }
    if (!standing) continue;
    const carrying = s.feet.filter((f) => f.support > 0.5);
    for (const foot of carrying) {
      if (s.pose.feet_flat !== false) metrics.tilt = Math.max(metrics.tilt, foot.tilt);
      if (s.pose.feet_flat !== false) metrics.sink = Math.max(metrics.sink, ankleFloor - foot.ankle.y);
      const start = (home[foot.side] ??= foot.ankle.clone());
      metrics.slide = Math.max(metrics.slide, Math.hypot(foot.ankle.x - start.x, foot.ankle.z - start.z));
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
    }
    if (!unilateral) {
      const d = Math.abs((s.bones.LeftHand?.position.y ?? 0) - (s.bones.RightHand?.position.y ?? 0));
      if (d > 0.08 && !moving) add({ severity: "warning", code: "symmetry", message: `The hands are ${round(d, 2)} m apart in height in a two-sided exercise` });
    }
  }

  if (metrics.tilt > 3) add({ severity: "error", code: "tilt", message: `A sole on the floor tilts ${round(metrics.tilt, 1)}°` });
  if (metrics.sink > 0.02) add({ severity: "error", code: "sink", message: `An ankle sinks ${round(metrics.sink)} m` });
  if (metrics.slide > 0.03 && !moving && !airborne) add({ severity: "error", code: "slide", message: `A foot slides ${round(metrics.slide)} m` });
  if (metrics.floor < -0.03) add({ severity: "error", code: "floor", message: `${deepest} goes ${round(-metrics.floor)} m through the floor` });
  if (metrics.comAhead > 0.08) add({ severity: "error", code: "balance-front", message: `The centre of mass is ${round(metrics.comAhead)} m ahead of the toes` });
  if (metrics.comBehind > 0.08) add({ severity: "error", code: "balance-back", message: `The centre of mass is ${round(metrics.comBehind)} m behind the heels` });
  if (metrics.comSide > 0.1) add({ severity: "warning", code: "balance-side", message: `The centre of mass is ${round(metrics.comSide)} m outside the feet` });

  return { ok: !issues.some((i) => i.severity === "error"), issues, metrics };
}
