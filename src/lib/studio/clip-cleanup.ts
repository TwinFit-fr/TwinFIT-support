"use client";

import * as THREE from "three";
import { avatarBoneName, type CanonicalBone } from "./mocap";
import { restoreRestPose, type RestPose } from "./rest-pose";

/**
 * Clean-up of a motion-capture clip once it sits on the avatar's rig, the way a Blender batch
 * would do it, but at load time and against this very rig:
 * 1. bake the clip to a fixed frame rate on the avatar (any track layout becomes one per bone);
 * 2. remove the horizontal drift of the hips (the performer walked or the camera panned) and
 *    centre the clip on the origin;
 * 3. ground the body: while a foot is in contact, the hips move vertically so that foot stands on
 *    the floor (no floating, no sinking);
 * 4. lock each foot to one spot during its contact phases, solving the leg with two-bone IK so the
 *    hips keep their own motion (anti-skate);
 * 5. blend the last frames into the first so the loop closes without a jump.
 */

export type CleanupOptions = {
  removeDrift: boolean;
  groundFeet: boolean;
  lockFeet: boolean;
  loopBlend: boolean;
  /** Frames per second of the baked clip. */
  fps?: number;
};

export const DEFAULT_CLEANUP: CleanupOptions = { removeDrift: true, groundFeet: true, lockFeet: true, loopBlend: true };

export type CleanupReport = {
  frames: number;
  fps: number;
  /** Horizontal drift removed, metres (x, z). */
  drift: [number, number];
  /** Frames with at least one foot in contact. */
  contactFrames: number;
  /** Range of the vertical hips correction, metres. */
  hipsShift: [number, number];
  /** Contact phases locked per foot. */
  lockedPhases: { left: number; right: number };
};

type Side = "left" | "right";
const SIDE_BONES: Record<Side, { up: CanonicalBone; leg: CanonicalBone; foot: CanonicalBone; toe: CanonicalBone }> = {
  left: { up: "LeftUpLeg", leg: "LeftLeg", foot: "LeftFoot", toe: "LeftToeBase" },
  right: { up: "RightUpLeg", leg: "RightLeg", foot: "RightFoot", toe: "RightToeBase" },
};

const CONTACT_HEIGHT_M = 0.03;
const CONTACT_SPEED_MPS = 0.3;
const MIN_PHASE_FRAMES = 3;
const LOOP_BLEND_FRAMES = 6;

type Baked = {
  times: Float32Array;
  /** bone name → quaternions (frames × 4), every bone of the rig. */
  quats: Map<string, Float32Array>;
  hips: string;
  hipsPos: Float32Array;
  /** World samples per frame for the legs and the hips. */
  world: Map<string, THREE.Vector3[]>;
  hipsWorldQuat: THREE.Quaternion[];
};

function bonesOf(model: THREE.Object3D): THREE.Bone[] {
  const out: THREE.Bone[] = [];
  model.traverse((o) => {
    if ((o as THREE.Bone).isBone) out.push(o as THREE.Bone);
  });
  return out;
}

/** Sample the clip on the avatar at a fixed rate; the avatar is left in its rest pose afterwards. */
function bake(model: THREE.Object3D, rest: RestPose, clip: THREE.AnimationClip, fps: number, sampled: string[], hips: string): Baked {
  const bones = bonesOf(model);
  const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = new Float32Array(frames);
  const quats = new Map(bones.map((b) => [b.name, new Float32Array(frames * 4)]));
  const hipsPos = new Float32Array(frames * 3);
  const world = new Map(sampled.map((n) => [n, [] as THREE.Vector3[]]));
  const hipsWorldQuat: THREE.Quaternion[] = [];
  const hipsBone = model.getObjectByName(hips);
  const mixer = new THREE.AnimationMixer(model);
  const action = mixer.clipAction(clip);
  // LoopOnce + clamp: setTime(duration) must give the last frame, not wrap to the first.
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  restoreRestPose(model, rest);
  for (let f = 0; f < frames; f += 1) {
    const t = Math.min(clip.duration - 1e-4, f / fps);
    times[f] = t;
    mixer.setTime(t);
    model.updateMatrixWorld(true);
    for (const b of bones) quats.get(b.name)!.set([b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w], f * 4);
    if (hipsBone) {
      hipsPos.set([hipsBone.position.x, hipsBone.position.y, hipsBone.position.z], f * 3);
      hipsWorldQuat.push(hipsBone.getWorldQuaternion(new THREE.Quaternion()));
    }
    for (const n of sampled) {
      const o = model.getObjectByName(n);
      world.get(n)!.push(o ? o.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3());
    }
  }
  action.stop();
  mixer.uncacheClip(clip);
  restoreRestPose(model, rest);
  model.updateMatrixWorld(true);
  return { times, quats, hips, hipsPos, world, hipsWorldQuat };
}

function frameDelta(axisRest: THREE.Vector3, normalRest: THREE.Vector3, axis: THREE.Vector3, normal: THREE.Vector3): THREE.Quaternion {
  const ortho = (ax: THREE.Vector3, n: THREE.Vector3) => n.clone().sub(ax.clone().multiplyScalar(n.dot(ax))).normalize();
  const nR = ortho(axisRest, normalRest);
  const nW = ortho(axis, normal);
  const mRest = new THREE.Matrix4().makeBasis(axisRest, nR, axisRest.clone().cross(nR));
  const mWant = new THREE.Matrix4().makeBasis(axis, nW, axis.clone().cross(nW));
  return new THREE.Quaternion().setFromRotationMatrix(mWant.multiply(mRest.transpose()));
}

/** Contact phases of one probe: runs of frames low and slow enough, at least MIN_PHASE_FRAMES long. */
function contactPhases(probe: THREE.Vector3[], restY: number, dt: number): [number, number][] {
  const n = probe.length;
  const contact = new Array<boolean>(n).fill(false);
  for (let f = 0; f < n; f += 1) {
    const prev = probe[Math.max(0, f - 1)];
    const next = probe[Math.min(n - 1, f + 1)];
    const span = (Math.min(n - 1, f + 1) - Math.max(0, f - 1)) * dt || dt;
    const speed = Math.hypot(next.x - prev.x, next.z - prev.z) / span;
    contact[f] = probe[f].y < restY + CONTACT_HEIGHT_M && speed < CONTACT_SPEED_MPS;
  }
  const phases: [number, number][] = [];
  let start = -1;
  for (let f = 0; f <= n; f += 1) {
    if (f < n && contact[f]) {
      if (start < 0) start = f;
    } else if (start >= 0) {
      if (f - start >= MIN_PHASE_FRAMES) phases.push([start, f - 1]);
      start = -1;
    }
  }
  return phases;
}

export function cleanupClip(
  model: THREE.Object3D,
  clip: THREE.AnimationClip,
  rest: RestPose,
  options: CleanupOptions = DEFAULT_CLEANUP,
): { clip: THREE.AnimationClip; report: CleanupReport } {
  const hips = avatarBoneName(model, "Hips");
  if (!hips || !rest.get(hips)) throw new Error("The avatar has no hips bone");
  const fps = Math.min(60, Math.max(10, options.fps ?? 30));
  const dt = 1 / fps;

  const legs = (["left", "right"] as Side[]).map((side) => {
    const names = SIDE_BONES[side];
    const resolved = { up: avatarBoneName(model, names.up), leg: avatarBoneName(model, names.leg), foot: avatarBoneName(model, names.foot), toe: avatarBoneName(model, names.toe) };
    return { side, ...resolved };
  });
  const sampled = [hips, ...legs.flatMap((l) => [l.up, l.leg, l.foot, l.toe].filter((n): n is string => Boolean(n)))];
  const baked = bake(model, rest, clip, fps, sampled, hips);
  const frames = baked.times.length;
  const hipsRest = rest.get(hips)!;

  // Hips corrections, in world metres: dx / dz from drift removal, dy from grounding.
  const dx = new Float32Array(frames);
  const dy = new Float32Array(frames);
  const dz = new Float32Array(frames);
  const report: CleanupReport = { frames, fps, drift: [0, 0], contactFrames: 0, hipsShift: [0, 0], lockedPhases: { left: 0, right: 0 } };

  const hipsWorld = baked.world.get(hips)!;
  if (options.removeDrift && frames > 1) {
    const first = hipsWorld[0];
    const last = hipsWorld[frames - 1];
    report.drift = [last.x - first.x, last.z - first.z];
    let meanX = 0;
    let meanZ = 0;
    for (let f = 0; f < frames; f += 1) {
      const u = f / (frames - 1);
      dx[f] = -(report.drift[0] * u);
      dz[f] = -(report.drift[1] * u);
      meanX += hipsWorld[f].x + dx[f];
      meanZ += hipsWorld[f].z + dz[f];
    }
    meanX /= frames;
    meanZ /= frames;
    for (let f = 0; f < frames; f += 1) {
      dx[f] -= meanX;
      dz[f] -= meanZ;
    }
  }

  // Contact phases per foot, on the lower probe (toe when the rig has one, else the ankle).
  type LegPhases = { side: Side; probe: string; restY: number; phases: [number, number][] };
  const legPhases: LegPhases[] = [];
  for (const l of legs) {
    const probe = l.toe ?? l.foot;
    if (!probe) continue;
    const restY = rest.get(probe)?.worldPosition.y ?? 0;
    legPhases.push({ side: l.side, probe, restY, phases: contactPhases(baked.world.get(probe)!, restY, dt) });
  }

  if (options.groundFeet) {
    // Per frame, the contacting probe closest to the floor sets the vertical correction.
    let last = 0;
    const raw = new Float32Array(frames).fill(NaN);
    for (let f = 0; f < frames; f += 1) {
      let best: number | null = null;
      for (const lp of legPhases) {
        if (!lp.phases.some(([a, b]) => f >= a && f <= b)) continue;
        const y = baked.world.get(lp.probe)![f].y;
        const need = lp.restY - y;
        best = best === null ? need : Math.max(best, need); // lift enough for the lowest foot
      }
      if (best !== null) raw[f] = best;
    }
    // Hold the last correction through flight phases, then smooth lightly.
    for (let f = 0; f < frames; f += 1) {
      if (!Number.isNaN(raw[f])) last = raw[f];
      dy[f] = last;
    }
    for (let f = 1; f < frames - 1; f += 1) dy[f] = (dy[f - 1] + dy[f] + dy[f + 1]) / 3;
    let min = Infinity;
    let max = -Infinity;
    for (let f = 0; f < frames; f += 1) {
      min = Math.min(min, dy[f]);
      max = Math.max(max, dy[f]);
      if (!Number.isNaN(raw[f])) report.contactFrames += 1;
    }
    report.hipsShift = [Number.isFinite(min) ? min : 0, Number.isFinite(max) ? max : 0];
  }

  // Write the hips corrections (world metres → the hips' parent frame and units).
  const parentScale = hipsRest.parentWorldScale || 1;
  const parentQuatInv = (() => {
    const bone = model.getObjectByName(hips);
    const q = bone?.parent ? bone.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    return q.invert();
  })();
  for (let f = 0; f < frames; f += 1) {
    const d = new THREE.Vector3(dx[f], dy[f], dz[f]).applyQuaternion(parentQuatInv).divideScalar(parentScale);
    baked.hipsPos[f * 3] += d.x;
    baked.hipsPos[f * 3 + 1] += d.y;
    baked.hipsPos[f * 3 + 2] += d.z;
  }

  if (options.lockFeet) {
    const forwardRest = new THREE.Vector3(0, 0, 1);
    for (const l of legs) {
      if (!l.up || !l.leg || !l.foot) continue;
      const lp = legPhases.find((p) => p.side === l.side);
      if (!lp) continue;
      const rUp = rest.get(l.up)!;
      const rLeg = rest.get(l.leg)!;
      const rFoot = rest.get(l.foot)!;
      const L1 = rUp.worldPosition.distanceTo(rLeg.worldPosition);
      const L2 = rLeg.worldPosition.distanceTo(rFoot.worldPosition);
      const axisThighRest = rLeg.worldPosition.clone().sub(rUp.worldPosition).normalize();
      const axisShankRest = rFoot.worldPosition.clone().sub(rLeg.worldPosition).normalize();
      const uRest = rFoot.worldPosition.clone().sub(rUp.worldPosition).normalize();
      const nRest = uRest.clone().cross(forwardRest).normalize();
      const upW = baked.world.get(l.up)!;
      const legW = baked.world.get(l.leg)!;
      const footW = baked.world.get(l.foot)!;
      const probeW = baked.world.get(lp.probe)!;
      const upQ = baked.quats.get(l.up)!;
      const legQ = baked.quats.get(l.leg)!;
      const parentOfUp = rUp.parent;

      for (const [a, b] of lp.phases) {
        // The spot: median of the ankle over the phase (horizontal), floor height from the probe.
        const xs: number[] = [];
        const zs: number[] = [];
        for (let f = a; f <= b; f += 1) {
          xs.push(footW[f].x + dx[f]);
          zs.push(footW[f].z + dz[f]);
        }
        xs.sort((p, q) => p - q);
        zs.sort((p, q) => p - q);
        const lockX = xs[Math.floor(xs.length / 2)];
        const lockZ = zs[Math.floor(zs.length / 2)];
        report.lockedPhases[l.side] += 1;
        for (let f = a; f <= b; f += 1) {
          const shift = new THREE.Vector3(dx[f], dy[f], dz[f]);
          const H = upW[f].clone().add(shift);
          const knee0 = legW[f].clone().add(shift);
          const ankle0 = footW[f].clone().add(shift);
          // Ankle target: locked spot, at the height that puts the probe on the floor.
          const probeDrop = probeW[f].y + dy[f] - lp.restY;
          const T = new THREE.Vector3(lockX, ankle0.y - probeDrop, lockZ);
          const toT = T.clone().sub(H);
          const d = THREE.MathUtils.clamp(toT.length(), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
          const u = toT.normalize();
          let v = knee0.clone().sub(H);
          v.sub(u.clone().multiplyScalar(v.dot(u)));
          if (v.lengthSq() < 1e-6) v = new THREE.Vector3(0, 0, 1).sub(u.clone().multiplyScalar(u.z));
          v.normalize();
          const alpha = Math.acos(THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
          const knee = H.clone().addScaledVector(u, Math.cos(alpha) * L1).addScaledVector(v, Math.sin(alpha) * L1);
          const ankle = H.clone().addScaledVector(u, d);
          const dirThigh = knee.clone().sub(H).normalize();
          const dirShank = ankle.clone().sub(knee).normalize();
          const n = u.clone().cross(v).normalize();
          const qThighWorld = frameDelta(axisThighRest, nRest, dirThigh, n).multiply(rUp.world);
          const qShankWorld = frameDelta(axisShankRest, nRest, dirShank, n).multiply(rLeg.world);
          // Parent of the thigh is the hips (or whatever the rig has there): its world rotation at this frame.
          const parentWorld = parentOfUp === hips ? baked.hipsWorldQuat[f] : worldQuatAt(model, baked, parentOfUp, f);
          const qThighLocal = parentWorld.clone().invert().multiply(qThighWorld);
          const qShankLocal = qThighWorld.clone().invert().multiply(qShankWorld);
          upQ.set([qThighLocal.x, qThighLocal.y, qThighLocal.z, qThighLocal.w], f * 4);
          legQ.set([qShankLocal.x, qShankLocal.y, qShankLocal.z, qShankLocal.w], f * 4);
        }
      }
    }
  }

  if (options.loopBlend && frames > LOOP_BLEND_FRAMES * 2) {
    const n = LOOP_BLEND_FRAMES;
    const qa = new THREE.Quaternion();
    const qb = new THREE.Quaternion();
    for (const values of baked.quats.values()) {
      qb.fromArray(values, 0);
      for (let k = 0; k < n; k += 1) {
        const f = frames - n + k;
        const w = (k + 1) / (n + 1);
        const s = w * w * (3 - 2 * w);
        qa.fromArray(values, f * 4).slerp(qb, s);
        values.set([qa.x, qa.y, qa.z, qa.w], f * 4);
      }
      values.set([qb.x, qb.y, qb.z, qb.w], (frames - 1) * 4);
    }
    for (let k = 0; k < n; k += 1) {
      const f = frames - n + k;
      const w = (k + 1) / (n + 1);
      const s = w * w * (3 - 2 * w);
      for (let c = 0; c < 3; c += 1) {
        const first = baked.hipsPos[c];
        baked.hipsPos[f * 3 + c] = baked.hipsPos[f * 3 + c] * (1 - s) + first * s;
      }
    }
    for (let c = 0; c < 3; c += 1) baked.hipsPos[(frames - 1) * 3 + c] = baked.hipsPos[c];
  }

  const tracks: THREE.KeyframeTrack[] = [];
  for (const [name, values] of baked.quats) tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, baked.times, values));
  tracks.push(new THREE.VectorKeyframeTrack(`${hips}.position`, baked.times, baked.hipsPos));
  const cleaned = new THREE.AnimationClip(`${clip.name || "mocap"} (clean)`, baked.times[frames - 1], tracks);
  return { clip: cleaned, report };
}

/** World rotation of a bone at a baked frame, from the rig hierarchy and the baked local quaternions. */
function worldQuatAt(model: THREE.Object3D, baked: Baked, name: string | null, f: number): THREE.Quaternion {
  if (!name) return new THREE.Quaternion();
  const chain: string[] = [];
  let node = model.getObjectByName(name);
  while (node && (node as THREE.Bone).isBone) {
    chain.unshift(node.name);
    node = node.parent ?? undefined;
  }
  const q = node ? node.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
  const local = new THREE.Quaternion();
  for (const bone of chain) {
    const values = baked.quats.get(bone);
    if (values) local.fromArray(values, f * 4);
    else local.identity();
    q.multiply(local);
  }
  return q;
}
