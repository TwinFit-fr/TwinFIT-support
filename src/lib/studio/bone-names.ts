/**
 * Bone names across rigs: the Mixamo vocabulary the Studio animates and how foreign names
 * (DeepMotion `l_arm_JNT`, CMU `LHipJoint`, Blender `Hips.001`, …) map onto it. No three.js here:
 * the server uses it to read a rigged GLB, the viewer to retarget clips.
 */

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
