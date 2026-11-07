"use client";

import * as THREE from "three";
import { BVHLoader } from "three/examples/jsm/loaders/BVHLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { retargetClip } from "three/examples/jsm/utils/SkeletonUtils.js";
import { studioAssetHeaders } from "./asset-auth";
import { CANONICAL_BONES, canonicalBoneName, type CanonicalBone } from "./bone-names";
import { restoreRestPose, type RestPose } from "./rest-pose";
import { retargetOffset } from "./retarget-offsets";

export { CANONICAL_BONES, canonicalBoneName, type CanonicalBone };

/**
 * Motion-capture clips (DeepMotion, Mixamo, any FBX / BVH / glTF export) played on the Studio
 * avatar. The file's skeleton rarely matches the avatar's, so the clip is retargeted on load:
 * bone names are matched to the Mixamo vocabulary, and three's SkeletonUtils bakes the motion
 * onto the avatar, relative to the rest pose of each rig (see retarget-offsets.ts) and in its units.
 */

/** The file's skeleton as loaded, by bone name. Captured once: retargeting leaves it animated. */
export type SourceRest = Map<string, { local: THREE.Quaternion; position: THREE.Vector3; world: THREE.Quaternion; worldPosition: THREE.Vector3 }>;

export type MocapClip = {
  kind: "mocap";
  clip: THREE.AnimationClip;
  /** The file's skeleton (bones, or a mesh with one); null when the file has only tracks. */
  source: THREE.Object3D | THREE.Skeleton | null;
  sourceRest: SourceRest;
  format: "glb" | "gltf" | "fbx" | "bvh";
};

export function captureSourceRest(source: THREE.Object3D | THREE.Skeleton | null): SourceRest {
  const rest: SourceRest = new Map();
  const bones = bonesOf(source);
  if (source instanceof THREE.Skeleton) bones[0]?.updateWorldMatrix(true, true);
  else source?.updateMatrixWorld(true);
  for (const bone of bones) {
    rest.set(bone.name, {
      local: bone.quaternion.clone(),
      position: bone.position.clone(),
      world: bone.getWorldQuaternion(new THREE.Quaternion()),
      worldPosition: bone.getWorldPosition(new THREE.Vector3()),
    });
  }
  return rest;
}

export function isMocapClip(value: unknown): value is MocapClip {
  return Boolean(value) && typeof value === "object" && (value as { kind?: unknown }).kind === "mocap";
}

/** Load a mocap file; the clip is the file's first animation. */
export async function loadMocap(url: string, format: MocapClip["format"]): Promise<MocapClip> {
  // Files in the Studio bucket need the staff JWT (asset-auth.ts).
  const headers = studioAssetHeaders(url);
  if (format === "bvh") {
    const result = await new BVHLoader().setRequestHeader(headers).loadAsync(url);
    return { kind: "mocap", clip: result.clip, source: result.skeleton, sourceRest: captureSourceRest(result.skeleton), format };
  }
  if (format === "fbx") {
    const group = await new FBXLoader().setRequestHeader(headers).loadAsync(url);
    const clip = group.animations[0];
    if (!clip) throw new Error("The FBX has no animation");
    return { kind: "mocap", clip, source: group, sourceRest: captureSourceRest(group), format };
  }
  const gltf = await new GLTFLoader().setRequestHeader(headers).loadAsync(url);
  const clip = gltf.animations[0];
  if (!clip) throw new Error("The model has no animation");
  return { kind: "mocap", clip, source: gltf.scene, sourceRest: captureSourceRest(gltf.scene), format };
}

// ---------------------------------------------------------------------------
// Bone name matching
// ---------------------------------------------------------------------------

/** The avatar's bone for a canonical name: `mixamorigHips`, `mixamorig:Hips`, `Hips`, or any bone that reads as it. */
export function avatarBoneName(model: THREE.Object3D, canonical: CanonicalBone): string | null {
  for (const candidate of [`mixamorig${canonical}`, `mixamorig:${canonical}`, canonical]) {
    if (model.getObjectByName(candidate)) return candidate;
  }
  let found: string | null = null;
  model.traverse((o) => {
    if (!found && (o as THREE.Bone).isBone && canonicalBoneName(o.name) === canonical) found = o.name;
  });
  return found;
}

function bonesOf(source: THREE.Object3D | THREE.Skeleton | null): THREE.Bone[] {
  if (!source) return [];
  if (source instanceof THREE.Skeleton) return source.bones;
  const bones: THREE.Bone[] = [];
  source.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
  });
  return bones;
}

function firstSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh | null {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((o) => {
    if (!found && (o as THREE.SkinnedMesh).isSkinnedMesh) found = o as THREE.SkinnedMesh;
  });
  return found;
}

export type RetargetReport = {
  /** avatar bone → source bone, as used. */
  mapped: Record<string, string>;
  unmatched: string[];
  /** True when the file already used the avatar's bone names (tracks played as they were). */
  direct: boolean;
};

/** Limb segments, as [bone, from, to]: the bone is aligned on the direction from → to. A hand or foot follows the segment before it. */
const LIMB_SEGMENTS: [CanonicalBone, CanonicalBone, CanonicalBone][] = (["Left", "Right"] as const).flatMap((s) => [
  [`${s}Arm`, `${s}Arm`, `${s}ForeArm`],
  [`${s}ForeArm`, `${s}ForeArm`, `${s}Hand`],
  [`${s}Hand`, `${s}ForeArm`, `${s}Hand`],
  [`${s}UpLeg`, `${s}UpLeg`, `${s}Leg`],
  [`${s}Leg`, `${s}Leg`, `${s}Foot`],
  [`${s}Foot`, `${s}Leg`, `${s}Foot`],
] as [CanonicalBone, CanonicalBone, CanonicalBone][]);

/** The per-bone offsets three's retarget multiplies: see retargetOffset. */
function restOffsets(model: THREE.Object3D, rest: RestPose, sourceRest: SourceRest, names: Record<string, string>): Record<string, THREE.Matrix4> {
  const align = new Map<string, { source: THREE.Vector3; target: THREE.Vector3 }>();
  for (const [bone, from, to] of LIMB_SEGMENTS) {
    const [boneName, fromName, toName] = [bone, from, to].map((c) => avatarBoneName(model, c));
    if (!boneName || !fromName || !toName) continue;
    const targetFrom = rest.get(fromName);
    const targetTo = rest.get(toName);
    const sourceFrom = sourceRest.get(names[fromName]);
    const sourceTo = sourceRest.get(names[toName]);
    if (!targetFrom || !targetTo || !sourceFrom || !sourceTo) continue;
    align.set(boneName, {
      source: sourceTo.worldPosition.clone().sub(sourceFrom.worldPosition),
      target: targetTo.worldPosition.clone().sub(targetFrom.worldPosition),
    });
  }
  const offsets: Record<string, THREE.Matrix4> = {};
  for (const [target, source] of Object.entries(names)) {
    const t = rest.get(target);
    const s = sourceRest.get(source);
    if (t && s) offsets[target] = retargetOffset(s.world, t.world, align.get(target));
  }
  return offsets;
}

/**
 * True when the file was made on this very rig (the avatar's .glb used as a capture tool's
 * character): same bone names is not enough, the rest pose must agree too, or the file's local
 * rotations and units mean something else here.
 */
function sameRig(trackBones: string[], sourceRest: SourceRest, rest: RestPose): boolean {
  return trackBones.every((name) => {
    const source = sourceRest.get(name);
    const target = rest.get(name);
    if (!source || !target) return true;
    const tolerance = Math.max(target.position.length() * 0.05, 1e-4);
    return source.local.angleTo(target.local) < THREE.MathUtils.degToRad(2) && source.position.distanceTo(target.position) <= tolerance;
  });
}

/**
 * The clip for this avatar. Made on this rig: played as it is. Otherwise retargeted through the
 * source skeleton (rest poses, bone frames and units accounted for), or, with no skeleton in the
 * file, the tracks are renamed to the matching avatar bones.
 */
export function retargetToAvatar(model: THREE.Object3D, mocap: MocapClip, rest: RestPose): { clip: THREE.AnimationClip; report: RetargetReport } {
  const trackBones = [...new Set(mocap.clip.tracks.map((t) => t.name.split(".")[0]))];
  const direct = trackBones.length > 0 && trackBones.every((name) => Boolean(model.getObjectByName(name))) && sameRig(trackBones, mocap.sourceRest, rest);
  if (direct) {
    return { clip: mocap.clip, report: { mapped: Object.fromEntries(trackBones.map((n) => [n, n])), direct: true, unmatched: [] } };
  }

  // avatar bone name → source bone name (what SkeletonUtils expects in `names`).
  const names: Record<string, string> = {};
  const unmatched: string[] = [];
  const sourceBones = bonesOf(mocap.source);
  const sourceNames = sourceBones.length ? sourceBones.map((b) => b.name) : trackBones;
  for (const sourceName of sourceNames) {
    const canonical = canonicalBoneName(sourceName);
    const target = canonical ? avatarBoneName(model, canonical) : null;
    if (target && !names[target]) names[target] = sourceName;
    else unmatched.push(sourceName);
  }
  if (!names[avatarBoneName(model, "Hips") ?? ""]) throw new Error(`No hips bone recognised in the clip (bones: ${sourceNames.slice(0, 8).join(", ")}…)`);

  // Retargeting samples the avatar's bones: they must be in their rest pose, not mid-clip.
  restoreRestPose(model, rest);
  const targetMesh = firstSkinnedMesh(model);
  if (!sourceBones.length || !targetMesh) {
    // No skeleton to retarget through: rename the tracks and hope the rest poses agree (Mixamo-family rigs).
    const renamed = mocap.clip.clone();
    const sourceToTarget = Object.fromEntries(Object.entries(names).map(([t, s]) => [s, t]));
    renamed.tracks = renamed.tracks
      .filter((t) => sourceToTarget[t.name.split(".")[0]])
      .map((t) => {
        const [bone, ...rest] = t.name.split(".");
        const copy = t.clone();
        copy.name = [sourceToTarget[bone], ...rest].join(".");
        return copy;
      });
    return { clip: renamed, report: { mapped: names, unmatched, direct: false } };
  }

  // Units: scale the hip translation by the ratio of skeleton heights (the vertical extent of the
  // rest bones), so an FBX or BVH in centimetres lands in metres whatever its root offset.
  const hipTarget = avatarBoneName(model, "Hips")!;
  const extent = (heights: number[]) => Math.max(...heights) - Math.min(...heights);
  const sourceHeight = extent([...mocap.sourceRest.values()].map((r) => r.worldPosition.y));
  const targetHeight = extent([...rest.values()].map((r) => r.worldPosition.y));
  const scale = sourceHeight > 1e-6 && targetHeight > 1e-6 ? targetHeight / sourceHeight : 1;

  // SkeletonUtils wants a source with a `.skeleton` (a skinned mesh) or a Skeleton. An FBX of
  // bones only (DeepMotion without a character) has neither: wrap its bones in a Skeleton.
  const sourceSkinned = mocap.source instanceof THREE.Skeleton ? null : firstSkinnedMesh(mocap.source as THREE.Object3D);
  const retargetSource: THREE.Object3D | THREE.Skeleton =
    mocap.source instanceof THREE.Skeleton ? mocap.source : (sourceSkinned ?? new THREE.Skeleton(sourceBones));

  const fps = Math.max(...mocap.clip.tracks.map((t) => t.times.length)) / Math.max(mocap.clip.duration, 1e-6);
  // SkeletonUtils resets the target with skeleton.pose() on every frame, which breaks a rig under
  // a scaled Armature (see rest-pose.ts): for this call the reset is our own.
  const skeleton = targetMesh.skeleton;
  const bindPose = skeleton.pose;
  skeleton.pose = () => restoreRestPose(model, rest);
  let clip: THREE.AnimationClip;
  try {
    const options = {
      // SkeletonUtils compares `hip` with the SOURCE bone name of each target bone.
      hip: names[hipTarget],
      names,
      scale,
      // Honoured by SkeletonUtils, missing from its published option type.
      localOffsets: restOffsets(model, rest, mocap.sourceRest, names),
      useFirstFramePosition: false,
      fps: Math.min(60, Math.max(1, Math.round(fps))),
    };
    clip = retargetClip(targetMesh, retargetSource, mocap.clip, options);
  } finally {
    skeleton.pose = bindPose;
    restoreRestPose(model, rest);
  }
  // SkeletonUtils names tracks `.bones[Name].quaternion` for a SkinnedMesh target; the mixer
  // runs on the model root, where bones bind by node name.
  for (const track of clip.tracks) track.name = track.name.replace(/^\.bones\[([^\]]+)\]/, "$1");
  clip.name = mocap.clip.name || "mocap";
  return { clip, report: { mapped: names, unmatched, direct: false } };
}
