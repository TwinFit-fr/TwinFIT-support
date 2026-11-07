"use client";

import * as THREE from "three";
import { BVHLoader } from "three/examples/jsm/loaders/BVHLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { retargetClip } from "three/examples/jsm/utils/SkeletonUtils.js";
import { CANONICAL_BONES, canonicalBoneName, type CanonicalBone } from "./bone-names";

export { CANONICAL_BONES, canonicalBoneName, type CanonicalBone };

/**
 * Motion-capture clips (DeepMotion, Mixamo, any FBX / BVH / glTF export) played on the Studio
 * avatar. The file's skeleton rarely matches the avatar's bone names, so the clip is retargeted
 * on load: bone names are matched to the Mixamo vocabulary, and three's SkeletonUtils bakes the
 * motion onto the avatar's own rest pose and units.
 */

export type MocapClip = {
  kind: "mocap";
  clip: THREE.AnimationClip;
  /** The file's skeleton (bones, or a mesh with one); null when the file has only tracks. */
  source: THREE.Object3D | THREE.Skeleton | null;
  format: "glb" | "gltf" | "fbx" | "bvh";
};

export function isMocapClip(value: unknown): value is MocapClip {
  return Boolean(value) && typeof value === "object" && (value as { kind?: unknown }).kind === "mocap";
}

/** Load a mocap file; the clip is the file's first animation. */
export async function loadMocap(url: string, format: MocapClip["format"]): Promise<MocapClip> {
  if (format === "bvh") {
    const result = await new BVHLoader().loadAsync(url);
    return { kind: "mocap", clip: result.clip, source: result.skeleton, format };
  }
  if (format === "fbx") {
    const group = await new FBXLoader().loadAsync(url);
    const clip = group.animations[0];
    if (!clip) throw new Error("The FBX has no animation");
    return { kind: "mocap", clip, source: group, format };
  }
  const gltf = await new GLTFLoader().loadAsync(url);
  const clip = gltf.animations[0];
  if (!clip) throw new Error("The model has no animation");
  return { kind: "mocap", clip, source: gltf.scene, format };
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

/**
 * The clip for this avatar. Same bone names: played as it is. Otherwise retargeted through the
 * source skeleton (bind poses and units accounted for), or, with no skeleton in the file, the
 * tracks are renamed to the matching avatar bones.
 */
export function retargetToAvatar(model: THREE.Object3D, mocap: MocapClip): { clip: THREE.AnimationClip; report: RetargetReport } {
  const trackBones = [...new Set(mocap.clip.tracks.map((t) => t.name.split(".")[0]))];
  const direct = trackBones.length > 0 && trackBones.every((name) => Boolean(model.getObjectByName(name)));
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
  const sourceRoot = mocap.source instanceof THREE.Skeleton ? sourceBones[0] : (mocap.source as THREE.Object3D);
  sourceRoot.updateMatrixWorld(true);
  model.updateMatrixWorld(true);
  const extent = (bones: THREE.Object3D[]) => {
    let min = Infinity;
    let max = -Infinity;
    for (const b of bones) {
      const y = b.getWorldPosition(new THREE.Vector3()).y;
      min = Math.min(min, y);
      max = Math.max(max, y);
    }
    return max - min;
  };
  const sourceHeight = extent(sourceBones);
  const targetHeight = extent(bonesOf(model));
  const scale = sourceHeight > 1e-6 && targetHeight > 1e-6 ? targetHeight / sourceHeight : 1;

  // SkeletonUtils wants a source with a `.skeleton` (a skinned mesh) or a Skeleton. An FBX of
  // bones only (DeepMotion without a character) has neither: wrap its bones in a Skeleton.
  const sourceSkinned = mocap.source instanceof THREE.Skeleton ? null : firstSkinnedMesh(mocap.source as THREE.Object3D);
  const retargetSource: THREE.Object3D | THREE.Skeleton =
    mocap.source instanceof THREE.Skeleton ? mocap.source : (sourceSkinned ?? new THREE.Skeleton(sourceBones));

  const fps = Math.max(...mocap.clip.tracks.map((t) => t.times.length)) / Math.max(mocap.clip.duration, 1e-6);
  const clip = retargetClip(targetMesh, retargetSource, mocap.clip, {
    // SkeletonUtils compares `hip` with the SOURCE bone name of each target bone.
    hip: names[hipTarget],
    names,
    scale,
    useFirstFramePosition: false,
    fps: Math.min(60, Math.max(1, Math.round(fps))),
  });
  // SkeletonUtils names tracks `.bones[Name].quaternion` for a SkinnedMesh target; the mixer
  // runs on the model root, where bones bind by node name.
  for (const track of clip.tracks) track.name = track.name.replace(/^\.bones\[([^\]]+)\]/, "$1");
  clip.name = mocap.clip.name || "mocap";
  return { clip, report: { mapped: names, unmatched, direct: false } };
}
