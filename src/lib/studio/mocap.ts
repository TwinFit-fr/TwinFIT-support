"use client";

import * as THREE from "three";
import { BVHLoader } from "three/examples/jsm/loaders/BVHLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { retargetClip } from "three/examples/jsm/utils/SkeletonUtils.js";

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

/** The Mixamo bones the Studio animates. */
export const CANONICAL_BONES = [
  "Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
  "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
  "RightShoulder", "RightArm", "RightForeArm", "RightHand",
  "LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase",
  "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase",
] as const;
export type CanonicalBone = (typeof CANONICAL_BONES)[number];

/** Side-less aliases, lower case, without separators. The side is detected separately. */
const ALIASES: Record<string, string> = {
  hips: "Hips", hip: "Hips", pelvis: "Hips",
  spine: "Spine", lowerback: "Spine", spine0: "Spine",
  spine1: "Spine1", chest: "Spine1", spine01: "Spine1",
  spine2: "Spine2", spine3: "Spine2", upperchest: "Spine2", spine02: "Spine2",
  neck: "Neck", neck1: "Neck",
  head: "Head",
  shoulder: "Shoulder", collar: "Shoulder", clavicle: "Shoulder",
  arm: "Arm", upperarm: "Arm", humerus: "Arm", uparm: "Arm",
  forearm: "ForeArm", lowerarm: "ForeArm", elbow: "ForeArm", loarm: "ForeArm",
  hand: "Hand", wrist: "Hand",
  upleg: "UpLeg", upperleg: "UpLeg", thigh: "UpLeg", hipjoint: "UpLeg", femur: "UpLeg",
  leg: "Leg", lowerleg: "Leg", knee: "Leg", calf: "Leg", shin: "Leg", tibia: "Leg",
  foot: "Foot", ankle: "Foot",
  toebase: "ToeBase", toe: "ToeBase", toes: "ToeBase", ball: "ToeBase",
};

const PREFIXES = ["mixamorig:", "mixamorig", "dm_", "character1_", "bip01 ", "bip01_", "bip_", "armature|", "valvebiped.", "mixamo:"];

/** The Mixamo bone a foreign bone name stands for, or null when it is not one we animate. */
export function canonicalBoneName(raw: string): CanonicalBone | null {
  let name = raw.trim().toLowerCase();
  for (const prefix of PREFIXES) if (name.startsWith(prefix)) name = name.slice(prefix.length);
  name = name.replace(/^.*[|:]/, "");
  // Rig suffixes (DeepMotion `hips_JNT`, Blender `.001`, `_bone`, `_def`, `_bind`).
  name = name.replace(/\.\d+$/, "").replace(/[_\s.-]?(jnt|joint|bone|bind|def|ctrl|skin)$/, "");
  // A side-less bone first (LowerBack, Pelvis): otherwise its leading l / r reads as a side.
  const plain = ALIASES[name.replace(/[^a-z0-9]/g, "")];
  if (plain && !["Shoulder", "Arm", "ForeArm", "Hand", "UpLeg", "Leg", "Foot", "ToeBase"].includes(plain)) {
    return plain as CanonicalBone;
  }
  // Side: Left / Right / L / R as prefix, suffix or separated token.
  let side: "Left" | "Right" | "" = "";
  const sideRules: [RegExp, "Left" | "Right"][] = [
    [/^left[_\s.-]?/, "Left"], [/^right[_\s.-]?/, "Right"],
    [/[_\s.-]?left$/, "Left"], [/[_\s.-]?right$/, "Right"],
    [/^l[_\s.-]/, "Left"], [/^r[_\s.-]/, "Right"],
    [/[_\s.-]l$/, "Left"], [/[_\s.-]r$/, "Right"],
    [/^l(?=[a-z]{3,})/, "Left"], [/^r(?=[a-z]{3,})/, "Right"],
  ];
  for (const [re, s] of sideRules) {
    if (re.test(name)) {
      side = s;
      name = name.replace(re, "");
      break;
    }
  }
  name = name.replace(/[^a-z0-9]/g, "");
  const base = ALIASES[name];
  if (!base) return null;
  const sided = ["Shoulder", "Arm", "ForeArm", "Hand", "UpLeg", "Leg", "Foot", "ToeBase"].includes(base);
  if (sided && !side) return null;
  if (!sided && side) return null;
  const canonical = (sided ? `${side}${base}` : base) as CanonicalBone;
  return CANONICAL_BONES.includes(canonical) ? canonical : null;
}

/** The avatar's bone for a canonical name (`mixamorigHips`, `mixamorig:Hips` or `Hips`). */
export function avatarBoneName(model: THREE.Object3D, canonical: CanonicalBone): string | null {
  for (const candidate of [`mixamorig${canonical}`, `mixamorig:${canonical}`, canonical]) {
    if (model.getObjectByName(candidate)) return candidate;
  }
  return null;
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
