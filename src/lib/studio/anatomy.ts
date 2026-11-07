/**
 * Anatomical pose parameters: the vocabulary the LLM extracts from the catalog pose texts and the
 * viewer turns into bone rotations on any Mixamo-named rig. Degrees everywhere, metres for
 * heights. Character frame: +Y up, +Z forward (the way the avatar faces), +X the avatar's left.
 *
 * Every angle is measured from the anatomical position: standing erect, arms at the sides, palms
 * facing forward, feet parallel and flat. A pose of all zeros IS that position on every rig
 * (pose-clip.ts calibrates each avatar to it). Arms are relative to the thorax, legs to the pelvis.
 * The one departure from clinical goniometry is the forearm, whose zero here is full supination
 * (the anatomical position) instead of the thumb-up mid-position: see `clinicalForearm`.
 *
 * The shoulder follows the ISB sequence (Wu 2005): plane of elevation, elevation in it, rotation
 * about the humerus. Ranges of motion and their sources live in rom.ts.
 *
 * No three.js here: this module is shared by the server (worker) and the client (viewer).
 */

import { ROM, ROOT_LIMITS } from "./rom.ts";

export const ORIENTATIONS = ["standing", "prone", "supine", "side_lying", "kneeling", "seated", "hanging"] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

export type ArmAngles = {
  /** Which way the arm rises, relative to the thorax: 0 to the side, 90 forward, 130 across the body, -90 behind. No effect at elevation 0. */
  shoulder_plane: number;
  /** How far the arm is raised in that plane: 0 along the trunk, 90 horizontal, 180 overhead. */
  shoulder_elevation: number;
  /** Rotation about the humerus, + external, 0 as the arm rises without turning. */
  shoulder_rotation: number;
  /** Shoulder blade around the ribs: + forward (reaching, top of a press), - back (squeezed, end of a row). */
  scapula_protraction: number;
  /** Shoulder blade up (+, a shrug) or down (-), on top of what raising the arm already does. */
  scapula_elevation: number;
  /** 0 straight, 90 right angle, 150 fully bent. */
  elbow_flexion: number;
  /** Forearm rotation from full supination: 0 palm forward (anatomical), 90 thumb forward (neutral, hammer), 170 palm back. */
  forearm_pronation: number;
  /** + palm side (flexion), - back of the hand (extension). */
  wrist_flexion: number;
  /** + towards the thumb (radial), - towards the little finger (ulnar). */
  wrist_deviation: number;
};

export type LegAngles = {
  /** Thigh relative to the pelvis: 0 in line with the torso (standing), 90 thigh horizontal forward. */
  hip_flexion: number;
  /** + thigh out to the side. */
  hip_abduction: number;
  /** Rotation about the thigh axis, + external (toes out). */
  hip_rotation: number;
  /** 0 straight, 90 right angle. */
  knee_flexion: number;
  /** + toes pulled up (dorsiflexion), - pointed (plantar flexion). Follows the floor while `feet_flat` holds. */
  ankle_dorsiflexion: number;
  /** + sole turned inwards, - outwards. Follows the floor while `feet_flat` holds. */
  ankle_inversion: number;
};

/** Where a two-handed implement (bar, plate, handle) is in this frame; the arms are solved to reach it. */
export type ImplementPose = {
  /** Height of the implement's centre above the floor, metres. */
  height_m: number;
  /** Forward (+) / back (-) of the implement's centre from the avatar's standing midline, metres. */
  forward_m: number;
  /** Distance between the hands on the implement, metres. */
  grip_width_m: number;
};

/** End effectors (and knees as poles) a pose can pin to a point in the world, metres. */
export const ANCHOR_IDS = ["left_foot", "right_foot", "left_hand", "right_hand", "left_knee", "right_knee"] as const;
export type AnchorId = (typeof ANCHOR_IDS)[number];
export type PoseAnchors = Partial<Record<AnchorId, [number, number, number]>>;

export type SpineAngles = {
  /** + forward (rounding), - extension (arching). */
  flexion: number;
  /** + bend to the left. */
  lateral: number;
  /** + turn to the left. */
  twist: number;
};

/** Heights that depend on the avatar's proportions, resolved on its rig. */
export const HEIGHT_REFS = ["floor", "bar_on_floor", "mid_shin", "knee", "mid_thigh", "hip", "shoulder"] as const;
export type HeightRef = (typeof HEIGHT_REFS)[number];

/**
 * What a pose must reach, where only the rig knows how: `point` ends at `ref` (plus `height_m`)
 * by moving `by`, the pelvis up and down (feet stay) or the pitch of a body pivoting on its toes.
 * Solved once at the keyframe; the result replaces the goal.
 */
export type PoseGoal = {
  point: "hands" | "shoulders";
  ref?: HeightRef;
  height_m?: number;
  by: "pelvis" | "pitch";
};

export type PoseAngles = {
  orientation: Orientation;
  /**
   * Standing: the soles of the feet that carry the body stay flat on the floor, and the ankles
   * follow from the legs (they close the chain); absent counts as true. False lets the ankles
   * set by hand lift the heels (calf raise, tiptoe): the toes then stay on the floor. Seated or on
   * the back, true puts the feet on the floor too, where they fall.
   */
  feet_flat?: boolean;
  /** This foot does not carry the body (the rear foot of a lunge, the one on the bench): it keeps its own ankle. */
  free_foot?: "left" | "right";
  /** The feet move on purpose in this pose (a lunge, a jump): they are not held where the first pose planted them. */
  steps?: boolean;
  /** Kneeling: the knees stay on the floor and the body pivots on them. */
  knees_down?: boolean;
  /** Face down: the toes stay on the floor (at this height above it) and the body pivots on them. */
  toes_down?: number;
  /** The hands stay where the clip's first pose put them (a push-up, a dip, a pull-up). */
  plant_hands?: boolean;
  /** The hands lie flat on the floor, fingers forward (a push-up): the wrist bends as it takes. */
  hands_flat?: boolean;
  /** A height to reach, solved on the rig: see PoseGoal. */
  goal?: PoseGoal;
  hips: {
    /** Tilt of the pelvis, and of everything above it: 0 upright, 90 horizontal face down (plank), -90 lying on the back. */
    pitch: number;
    /** Turn about the vertical axis, + to the left. */
    yaw: number;
    /** Side tilt, + left hip up. */
    roll: number;
    /** Pelvis height above the floor in metres; null = automatic (from the legs when standing, else the orientation's default). Standing, the feet stay put and the legs follow. */
    height_m: number | null;
    /** Pelvis shift forward (+) or back (-) from where the legs put it, metres. Standing, the feet stay put and the legs follow. */
    forward_m: number;
  };
  /** Lower spine against the pelvis. */
  lumbar: SpineAngles;
  /** Upper spine against the lumbar spine. */
  thoracic: SpineAngles;
  /** + chin down, - looking up; + turned left; + tilted to the left. */
  head: { pitch: number; yaw: number; lateral: number };
  left_arm: ArmAngles;
  right_arm: ArmAngles;
  left_leg: LegAngles;
  right_leg: LegAngles;
  /** Null when the exercise has no two-handed implement in this frame. */
  implement: ImplementPose | null;
  /**
   * Pinned points: a foot or hand stays exactly there (its leg or arm is solved to it); a knee is
   * the pole of its leg. World metres, in the avatar's frame (the bone's position: ankle, wrist, knee).
   */
  anchors?: PoseAnchors;
};

export const NEUTRAL_ARM: ArmAngles = {
  shoulder_plane: 0,
  shoulder_elevation: 0,
  shoulder_rotation: 0,
  scapula_protraction: 0,
  scapula_elevation: 0,
  elbow_flexion: 0,
  forearm_pronation: 0,
  wrist_flexion: 0,
  wrist_deviation: 0,
};

export const NEUTRAL_LEG: LegAngles = {
  hip_flexion: 0,
  hip_abduction: 0,
  hip_rotation: 0,
  knee_flexion: 0,
  ankle_dorsiflexion: 0,
  ankle_inversion: 0,
};

const NEUTRAL_SPINE: SpineAngles = { flexion: 0, lateral: 0, twist: 0 };

/** The anatomical position: every angle at its zero. */
export const NEUTRAL_POSE: PoseAngles = {
  orientation: "standing",
  feet_flat: true,
  hips: { pitch: 0, yaw: 0, roll: 0, height_m: null, forward_m: 0 },
  lumbar: NEUTRAL_SPINE,
  thoracic: NEUTRAL_SPINE,
  head: { pitch: 0, yaw: 0, lateral: 0 },
  left_arm: NEUTRAL_ARM,
  right_arm: NEUTRAL_ARM,
  left_leg: NEUTRAL_LEG,
  right_leg: NEUTRAL_LEG,
  implement: null,
};

/** Pelvis height when the legs do not carry the body (metres), by orientation. */
export const HIPS_HEIGHT_BY_ORIENTATION: Record<Exclude<Orientation, "standing">, number> = {
  prone: 0.24,
  supine: 0.14,
  side_lying: 0.2,
  kneeling: 0.52,
  seated: 0.5,
  hanging: 1.55,
};

export type PoseKeyframe = {
  /** Time in seconds. */
  t: number;
  /** Catalog frame this keyframe comes from (0 start, 1 mid, 2 end), when it does. */
  position?: number;
  angles: PoseAngles;
};

/**
 * A movement clip of format `json` expressed as anatomical keyframes. The viewer solves it on the
 * avatar's own rig (rest pose, limb lengths) when it loads, so one clip fits every Mixamo-named
 * model whatever its proportions or units.
 */
export type PoseClipJson = {
  kind: "pose-angles";
  /**
   * Absent = 1: forearm zero at the thumb-up mid-position. 2: every zero is the anatomical
   * position. 3: ISB shoulder (plane, elevation, rotation), lumbar and thoracic spine.
   */
  version?: number;
  fps: number;
  /** Seconds. */
  duration: number;
  loop: boolean;
  keyframes: PoseKeyframe[];
  meta?: Record<string, unknown>;
};

export function isPoseClipJson(data: unknown): data is PoseClipJson {
  return Boolean(data) && typeof data === "object" && (data as { kind?: unknown }).kind === "pose-angles" && Array.isArray((data as { keyframes?: unknown }).keyframes);
}

export const POSE_CLIP_VERSION = 3;

type Quat = [number, number, number, number]; // x y z w
const RAD = Math.PI / 180;
const axisAngle = (x: number, y: number, z: number, deg: number): Quat => {
  const h = (deg * RAD) / 2;
  return [x * Math.sin(h), y * Math.sin(h), z * Math.sin(h), Math.cos(h)];
};
const qmul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qrot = (q: Quat, v: [number, number, number]): [number, number, number] => {
  const r = qmul(qmul(q, [v[0], v[1], v[2], 0]), [-q[0], -q[1], -q[2], q[3]]);
  return [r[0], r[1], r[2]];
};

/** Unit axis of the swing that raises an arm by `plane` (s = +1 left, -1 right): the arm turns about it by its elevation. */
export function swingAxis(plane: number, s: 1 | -1): [number, number, number] {
  return [-Math.sin(plane * RAD), 0, s * Math.cos(plane * RAD)];
}

/** Version 2's shoulder (abduction, flexion, rotation through the T-pose) as plane, elevation and rotation. */
function isbShoulder(abduction: number, flexion: number, rotation: number, s: 1 | -1) {
  const old = [axisAngle(0, 0, 1, s * (abduction - 90)), axisAngle(0, 1, 0, -s * flexion), axisAngle(0, 0, 1, s * 90), axisAngle(0, 1, 0, s * rotation)].reduce(qmul);
  const [dx, dy, dz] = qrot(old, [0, -1, 0]);
  const elevation = Math.acos(Math.max(-1, Math.min(1, -dy))) / RAD;
  const plane = elevation < 0.01 ? 0 : Math.atan2(dz, s * dx) / RAD;
  const swing = axisAngle(...swingAxis(plane, s), elevation);
  const twist = qmul([-swing[0], -swing[1], -swing[2], swing[3]], old);
  let turn = (2 * Math.atan2(twist[1], twist[3])) / RAD;
  if (turn > 180) turn -= 360;
  if (turn < -180) turn += 360;
  return { shoulder_plane: plane, shoulder_elevation: elevation, shoulder_rotation: s * turn };
}

type LegacyArm = Partial<ArmAngles> & { shoulder_abduction?: number; shoulder_flexion?: number };
type LegacyPose = Partial<PoseAngles> & { torso?: SpineAngles };

/** A pose of an older clip in the current vocabulary. */
function upgradePose(p: PoseAngles, from: number): PoseAngles {
  const old = p as LegacyPose;
  const arm = (a: LegacyArm, s: 1 | -1): ArmAngles => ({
    ...NEUTRAL_ARM,
    ...a,
    ...isbShoulder(a.shoulder_abduction ?? 0, a.shoulder_flexion ?? 0, a.shoulder_rotation ?? 0, s),
    forearm_pronation: clampToLimit("arm.forearm_pronation", (a.forearm_pronation ?? 0) + (from < 2 ? 90 : 0)),
  });
  const { shoulder_abduction: _a, shoulder_flexion: _f, ...left } = arm(p.left_arm, 1) as ArmAngles & LegacyArm;
  const { shoulder_abduction: _b, shoulder_flexion: _g, ...right } = arm(p.right_arm, -1) as ArmAngles & LegacyArm;
  const torso = old.torso ?? NEUTRAL_SPINE;
  const { torso: _t, ...rest } = old;
  return {
    ...(rest as PoseAngles),
    // The old single spine, shared out as each segment's range is (rom.ts).
    lumbar: { flexion: torso.flexion * 0.7, lateral: torso.lateral * 0.6, twist: torso.twist * 0.2 },
    thoracic: { flexion: torso.flexion * 0.3, lateral: torso.lateral * 0.4, twist: torso.twist * 0.8 },
    head: { ...p.head, lateral: p.head.lateral ?? 0 },
    left_arm: left,
    right_arm: right,
    left_leg: { ...NEUTRAL_LEG, ...p.left_leg },
    right_leg: { ...NEUTRAL_LEG, ...p.right_leg },
  };
}

/** A saved clip in the current vocabulary. */
export function upgradePoseClip(clip: PoseClipJson): PoseClipJson {
  const from = clip.version ?? 1;
  if (from >= POSE_CLIP_VERSION) return clip;
  return { ...clip, version: POSE_CLIP_VERSION, keyframes: clip.keyframes.map((k) => ({ ...k, angles: upgradePose(k.angles, from) })) };
}

/** The forearm as a goniometer reads it, from the thumb-up mid-position: + pronation, - supination. */
export function clinicalForearm(pronation: number): number {
  return pronation - 90;
}

/**
 * The dorsiflexion that keeps a sole flat with this leg in the sagittal plane: what the ankle
 * reads when `feet_flat` holds. The solver works it out in 3D; this is its sagittal value.
 */
export function flatAnkle(pose: PoseAngles, side: "left" | "right"): number {
  const leg = side === "left" ? pose.left_leg : pose.right_leg;
  return pose.hips.pitch - leg.hip_flexion + leg.knee_flexion;
}

const mix = (a: number, b: number, u: number) => a + (b - a) * u;

/** A pose between two poses, field by field: what plays between keyframes, solved like any other. */
export function lerpPose(a: PoseAngles, b: PoseAngles, u: number): PoseAngles {
  const blend = <T extends Record<string, number>>(x: T, y: T): T => Object.fromEntries(Object.keys(x).map((k) => [k, mix(x[k], y[k], u)])) as T;
  const height = (p: PoseAngles) => p.hips.height_m;
  const ah = height(a);
  const bh = height(b);
  return {
    ...(u < 0.5 ? a : b),
    // A hand or foot held at either end is held all the way between them.
    ...(a.plant_hands || b.plant_hands ? { plant_hands: true } : {}),
    ...(a.hands_flat || b.hands_flat ? { hands_flat: true } : {}),
    ...(a.steps || b.steps ? { steps: true } : {}),
    hips: {
      pitch: mix(a.hips.pitch, b.hips.pitch, u),
      yaw: mix(a.hips.yaw, b.hips.yaw, u),
      roll: mix(a.hips.roll, b.hips.roll, u),
      height_m: ah !== null && bh !== null ? mix(ah, bh, u) : u < 0.5 ? ah : bh,
      forward_m: mix(a.hips.forward_m, b.hips.forward_m, u),
    },
    lumbar: blend(a.lumbar, b.lumbar),
    thoracic: blend(a.thoracic, b.thoracic),
    head: blend(a.head, b.head),
    left_arm: blend(a.left_arm, b.left_arm),
    right_arm: blend(a.right_arm, b.right_arm),
    left_leg: blend(a.left_leg, b.left_leg),
    right_leg: blend(a.right_leg, b.right_leg),
    implement: a.implement && b.implement ? blend(a.implement, b.implement) : (u < 0.5 ? a : b).implement,
  };
}

// ---------------------------------------------------------------------------
// JSON schema for the LLM (OpenAI structured outputs, strict: every key required).
// ---------------------------------------------------------------------------

const num = (description: string) => ({ type: "number", description });

const ARM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: Object.keys(NEUTRAL_ARM),
  properties: {
    shoulder_plane: num("which way the arm rises, relative to the trunk: 0 to the side, 90 straight forward, 130 across the body, -90 behind; ignored at elevation 0"),
    shoulder_elevation: num("how far the arm is raised in that plane, relative to the trunk: 0 along the trunk, 90 horizontal, 175 overhead"),
    shoulder_rotation: num("rotation about the upper arm, + external; 0 unless the text turns it: 90 for forearms vertical with the elbows out to the side"),
    scapula_protraction: num("shoulder blades + forward (reaching), - squeezed back (end of a row); usually 0"),
    scapula_elevation: num("shoulder blades + up (shrug), - down; usually 0"),
    elbow_flexion: num("0 straight, 90 right angle, 150 fully bent; flexion, never the included angle"),
    forearm_pronation: num("from the anatomical position: 0 palm forward, 90 thumb forward (neutral, hammer grip, arms hanging relaxed), 170 palm back"),
    wrist_flexion: num("+ palm side, - back of the hand, usually 0"),
    wrist_deviation: num("+ towards the thumb, - towards the little finger, usually 0"),
  },
} as const;

const LEG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: Object.keys(NEUTRAL_LEG),
  properties: {
    hip_flexion: num("thigh relative to the pelvis, NOT to the vertical: the thigh's forward angle from vertical is hip_flexion minus hips.pitch"),
    hip_abduction: num("+ thigh out to the side; anatomical position 0, shoulder-width stance about 8"),
    hip_rotation: num("+ toes turned out; anatomical position 0, a squat stance about 10"),
    knee_flexion: num("0 straight, 90 right angle, 130 deep squat; flexion, never the included angle"),
    ankle_dorsiflexion: num("only read when feet_flat is false or the foot is off the floor: + toes up, - pointed; 0 otherwise"),
    ankle_inversion: num("only read off the floor: + sole inwards; 0 otherwise"),
  },
} as const;

const SPINE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["flexion", "lateral", "twist"],
  properties: {
    flexion: num("+ rounding forward, - arching back; 0 for a neutral spine even when the trunk leans (the lean is hips.pitch)"),
    lateral: num("+ bend to the left"),
    twist: num("+ turn to the left"),
  },
} as const;

export const POSE_ANGLES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["orientation", "feet_flat", "hips", "lumbar", "thoracic", "head", "left_arm", "right_arm", "left_leg", "right_leg", "implement"],
  properties: {
    orientation: { type: "string", enum: [...ORIENTATIONS], description: "how the body is supported" },
    feet_flat: { type: "boolean", description: "standing: true when the soles stay flat on the floor, which is almost always; false only for heels lifted (calf raise, tiptoe, a jump take-off)" },
    implement: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["height_m", "forward_m", "grip_width_m"],
      description: "the two-handed implement (barbell, EZ bar, plate, bar handle) in this frame, when the exercise has one; null otherwise. The arms are solved to reach it, so this is what makes the grip exact",
      properties: {
        height_m: num("height of the implement's centre above the floor, metres, for a 1.75 m avatar (scale with its height): on the floor 0.22, arms hanging straight 0.80, hip crease 0.92, shoulders 1.40, arms locked out overhead 1.95"),
        forward_m: num("forward (+) / back (-) of the implement's centre from the avatar's standing midline, metres (over mid-foot and arms hanging 0.05, held at the chest 0.2, arms extended forward 0.55)"),
        grip_width_m: num("distance between the hands, metres (shoulder width 0.45, bench press 0.8, wide 1.0, narrow 0.25)"),
      },
    },
    hips: {
      type: "object",
      additionalProperties: false,
      required: ["pitch", "yaw", "roll", "height_m", "forward_m"],
      properties: {
        pitch: num("tilt of the pelvis and everything above it, which is the trunk lean: 0 upright, 45 hip hinge, 90 horizontal face down (plank, push-up), -90 lying on the back"),
        yaw: num("turn about the vertical axis, + to the left, usually 0"),
        roll: num("side tilt, + left hip up, usually 0"),
        height_m: { type: ["number", "null"], description: "pelvis height above the floor in metres when the legs do not carry the body (prone, supine, seated, kneeling, hanging); null when standing" },
        forward_m: num("0 when standing: the legs already place the pelvis over the feet. Otherwise the pelvis shift forward (+) or back (-), metres"),
      },
    },
    lumbar: SPINE_SCHEMA,
    thoracic: SPINE_SCHEMA,
    head: {
      type: "object",
      additionalProperties: false,
      required: ["pitch", "yaw", "lateral"],
      properties: { pitch: num("+ chin down, - looking up"), yaw: num("+ turned left"), lateral: num("+ tilted to the left") },
    },
    left_arm: ARM_SCHEMA,
    right_arm: ARM_SCHEMA,
    left_leg: LEG_SCHEMA,
    right_leg: LEG_SCHEMA,
  },
} as const;

/** A pose with the time it takes to reach it from the previous one (the draft the editor asks for). */
const TIMED_POSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [...POSE_ANGLES_SCHEMA.required, "label", "transition_s"],
  properties: {
    ...POSE_ANGLES_SCHEMA.properties,
    label: { type: "string", description: "two or three words naming the moment (start, bottom, lockout, ...)" },
    transition_s: num("seconds spent moving into this pose from the previous one (the first pose's value is the return into it when the loop cycles); slower on the lowering phase"),
  },
} as const;

export const POSE_DRAFT_SCHEMA = {
  name: "exercise_pose_draft",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["poses", "loop_mode", "notes"],
    properties: {
      poses: { type: "array", description: "the key poses of one repetition in order, 2 to 6 of them; the first is the start position", items: TIMED_POSE_SCHEMA },
      loop_mode: { type: "string", enum: ["pingpong", "cycle"], description: "pingpong when the movement retraces its poses (a lift up and down); cycle when it returns to the start another way (a step, a rotation)" },
      notes: { type: "string", description: "one line on anything ambiguous or that the images contradict" },
    },
  },
} as const;

/** The ranges of motion as one line per joint, for the prompt. */
export function jointLimitsText(): string {
  return Object.entries(JOINT_LIMITS)
    .filter(([k]) => !k.startsWith("implement."))
    .map(([k, v]) => `${k}: ${v.min}…${v.max}`)
    .join("; ");
}

/** A pose held to the ranges of rom.ts, with what had to change (the model's output is kept and audited). */
export function sanitizePoseReport(p: PoseAngles): { pose: PoseAngles; clamped: string[] } {
  const clamped: string[] = [];
  const c = (path: string, v: unknown, fallback = 0) => {
    const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
    const out = clampToLimit(path, n);
    if (out !== v) clamped.push(`${path}: ${String(v)} -> ${out}`);
    return out;
  };
  const section = <T extends object>(prefix: string, raw: Partial<T> | undefined, keys: T): T => Object.fromEntries(Object.keys(keys).map((k) => [k, c(`${prefix}.${k}`, raw?.[k as keyof T])])) as T;
  const pose: PoseAngles = {
    orientation: ORIENTATIONS.includes(p?.orientation) ? p.orientation : "standing",
    feet_flat: p?.feet_flat !== false,
    hips: {
      pitch: c("hips.pitch", p?.hips?.pitch),
      yaw: c("hips.yaw", p?.hips?.yaw),
      roll: c("hips.roll", p?.hips?.roll),
      height_m: typeof p?.hips?.height_m === "number" && Number.isFinite(p.hips.height_m) ? clampToLimit("hips.height_m", p.hips.height_m) : null,
      forward_m: c("hips.forward_m", p?.hips?.forward_m),
    },
    lumbar: section("lumbar", p?.lumbar, NEUTRAL_SPINE),
    thoracic: section("thoracic", p?.thoracic, NEUTRAL_SPINE),
    head: section("head", p?.head, NEUTRAL_POSE.head),
    left_arm: section("left_arm", p?.left_arm, NEUTRAL_ARM),
    right_arm: section("right_arm", p?.right_arm, NEUTRAL_ARM),
    left_leg: section("left_leg", p?.left_leg, NEUTRAL_LEG),
    right_leg: section("right_leg", p?.right_leg, NEUTRAL_LEG),
    implement:
      p?.implement && typeof p.implement === "object"
        ? { height_m: c("implement.height_m", p.implement.height_m, 0.9), forward_m: c("implement.forward_m", p.implement.forward_m, 0.2), grip_width_m: c("implement.grip_width_m", p.implement.grip_width_m, 0.45) }
        : null,
    ...(p?.anchors && typeof p.anchors === "object" ? { anchors: sanitizeAnchors(p.anchors) } : {}),
  };
  return { pose, clamped };
}

export function sanitizePose(p: PoseAngles): PoseAngles {
  return sanitizePoseReport(p).pose;
}

function sanitizeAnchors(raw: PoseAnchors): PoseAnchors {
  const out: PoseAnchors = {};
  for (const id of ANCHOR_IDS) {
    const v = raw[id];
    if (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n))) {
      out[id] = [Math.min(3, Math.max(-3, v[0])), Math.min(3, Math.max(-0.5, v[1])), Math.min(3, Math.max(-3, v[2]))];
    }
  }
  return out;
}

/** How each palm faces a two-handed implement, from the catalog grip code (see solveArmsToImplement). */
export type PalmFacing = "pronated" | "supinated" | "neutral";

export function palmFacing(grip: string | null | undefined, side: "left" | "right"): PalmFacing {
  switch (grip) {
    case "UNDERHAND":
      return "supinated";
    case "HAMMER":
      return "neutral";
    case "MIXED":
      return side === "left" ? "pronated" : "supinated";
    default:
      return "pronated";
  }
}

/**
 * How the poses of a clip are traversed in one loop:
 * - cycle: 1 → 2 → … → n → 1 (the last segment returns to the start);
 * - pingpong: 1 → 2 → … → n → … → 2 → 1 (there and back, a repetition of a lift);
 * - once: 1 → 2 → … → n (no return).
 */
export type LoopMode = "cycle" | "pingpong" | "once";
export const LOOP_MODES: readonly LoopMode[] = ["cycle", "pingpong", "once"];

/**
 * Expand an ordered list of poses into timed keyframes over the duration. `weights[i]` is the
 * relative time spent getting to pose i from the previous one (weights[0] is the return leg of a
 * cycle); omitted or equal weights space the poses evenly. A boomerang reuses the weights on the
 * way back.
 */
export function buildKeyframes(poses: PoseAngles[], durationS: number, mode: LoopMode, weights?: number[]): PoseKeyframe[] {
  if (!poses.length) throw new Error("A pose is needed");
  if (poses.length === 1) {
    return [
      { t: 0, position: 0, angles: poses[0] },
      { t: durationS, position: 0, angles: poses[0] },
    ];
  }
  const w = poses.map((_, i) => Math.max(0.05, weights?.[i] ?? 1));
  const order: number[] =
    mode === "cycle"
      ? [...poses.map((_, i) => i), 0]
      : mode === "pingpong"
        ? [...poses.map((_, i) => i), ...poses.map((_, i) => i).reverse().slice(1)]
        : poses.map((_, i) => i);
  // Segment k goes from order[k-1] to order[k]; its weight is that of the pose being entered
  // (going forward) or the one being left (going back), so each transition keeps its tempo.
  const segments: number[] = [];
  for (let k = 1; k < order.length; k += 1) {
    const from = order[k - 1];
    const to = order[k];
    segments.push(to > from ? w[to] : to === 0 && from === poses.length - 1 && mode === "cycle" ? w[0] : w[from]);
  }
  const total = segments.reduce((acc, v) => acc + v, 0);
  let t = 0;
  return order.map((index, k) => {
    if (k > 0) t += (durationS * segments[k - 1]) / total;
    return { t: k === order.length - 1 ? durationS : t, position: index, angles: poses[index] };
  });
}

/** The editable poses of a clip: one per distinct `position`, in order; a trailing return to the start is dropped. */
export function posesFromClip(saved: PoseClipJson): { poses: PoseAngles[]; mode: LoopMode; weights: number[] | null } {
  const clip = upgradePoseClip(saved);
  const keys = [...clip.keyframes].sort((a, b) => a.t - b.t);
  const byPosition = new Map<number, PoseAngles>();
  keys.forEach((k, i) => {
    const pos = k.position ?? i;
    if (!byPosition.has(pos)) byPosition.set(pos, k.angles);
  });
  const poses = [...byPosition.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
  const metaMode = clip.meta?.loop_mode;
  const mode: LoopMode = metaMode === "pingpong" || metaMode === "once" || metaMode === "cycle" ? metaMode : clip.loop ? "cycle" : "once";
  const rawWeights = clip.meta?.segment_weights;
  const weights = Array.isArray(rawWeights) && rawWeights.length === poses.length && rawWeights.every((v) => typeof v === "number") ? (rawWeights as number[]) : null;
  return { poses: poses.length ? poses : [NEUTRAL_POSE], mode, weights };
}

// ---------------------------------------------------------------------------
// Slider metadata for the pose editor
// ---------------------------------------------------------------------------

export type PoseField = {
  /** Dot path inside PoseAngles (`left_arm.elbow_flexion`, `hips.pitch`). */
  path: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  unit?: "°" | "m";
};

export type PoseGroup = { id: string; label: string; fields: PoseField[]; /** Mirrored counterpart group (left ↔ right). */ mirror?: string };

/** Hard limits of every field: the sliders stop here and the limb solver never leaves them (rom.ts). */
export const JOINT_LIMITS: Record<string, { min: number; max: number }> = {
  ...Object.fromEntries(Object.entries(ROM).map(([key, range]) => [key, { min: range.hard[0], max: range.hard[1] }])),
  ...ROOT_LIMITS,
};

/** The range of a pose field path (`left_arm.elbow_flexion` → the `arm.elbow_flexion` range). */
export function limitOf(path: string): { min: number; max: number } {
  const key = path.replace(/^(left|right)_/, "");
  return JOINT_LIMITS[key] ?? { min: -180, max: 180 };
}

export function clampToLimit(path: string, value: number): number {
  const { min, max } = limitOf(path);
  return Math.min(max, Math.max(min, value));
}

const armFields = (side: "left" | "right"): PoseField[] => [
  { path: `${side}_arm.shoulder_plane`, label: "Shoulder plane (0 side, 90 front)", ...limitOf(`${side}_arm.shoulder_plane`), unit: "°" },
  { path: `${side}_arm.shoulder_elevation`, label: "Shoulder elevation", ...limitOf(`${side}_arm.shoulder_elevation`), unit: "°" },
  { path: `${side}_arm.shoulder_rotation`, label: "Shoulder rotation (+ external)", ...limitOf(`${side}_arm.shoulder_rotation`), unit: "°" },
  { path: `${side}_arm.scapula_protraction`, label: "Scapula protraction", ...limitOf(`${side}_arm.scapula_protraction`), unit: "°" },
  { path: `${side}_arm.scapula_elevation`, label: "Scapula elevation", ...limitOf(`${side}_arm.scapula_elevation`), unit: "°" },
  { path: `${side}_arm.elbow_flexion`, label: "Elbow flexion", ...limitOf(`${side}_arm.elbow_flexion`), unit: "°" },
  { path: `${side}_arm.forearm_pronation`, label: "Forearm (0 palm forward)", ...limitOf(`${side}_arm.forearm_pronation`), unit: "°" },
  { path: `${side}_arm.wrist_flexion`, label: "Wrist flexion", ...limitOf(`${side}_arm.wrist_flexion`), unit: "°" },
  { path: `${side}_arm.wrist_deviation`, label: "Wrist deviation (+ radial)", ...limitOf(`${side}_arm.wrist_deviation`), unit: "°" },
];
const legFields = (side: "left" | "right"): PoseField[] => [
  { path: `${side}_leg.hip_flexion`, label: "Hip flexion", ...limitOf(`${side}_leg.hip_flexion`), unit: "°" },
  { path: `${side}_leg.hip_abduction`, label: "Hip abduction", ...limitOf(`${side}_leg.hip_abduction`), unit: "°" },
  { path: `${side}_leg.hip_rotation`, label: "Hip rotation", ...limitOf(`${side}_leg.hip_rotation`), unit: "°" },
  { path: `${side}_leg.knee_flexion`, label: "Knee flexion", ...limitOf(`${side}_leg.knee_flexion`), unit: "°" },
  { path: `${side}_leg.ankle_dorsiflexion`, label: "Ankle dorsiflexion", ...limitOf(`${side}_leg.ankle_dorsiflexion`), unit: "°" },
  { path: `${side}_leg.ankle_inversion`, label: "Ankle inversion", ...limitOf(`${side}_leg.ankle_inversion`), unit: "°" },
];

export const POSE_GROUPS: PoseGroup[] = [
  {
    id: "hips",
    label: "Hips & body",
    fields: [
      { path: "hips.pitch", label: "Trunk lean (pelvis pitch)", ...limitOf("hips.pitch"), unit: "°" },
      { path: "hips.yaw", label: "Body yaw", ...limitOf("hips.yaw"), unit: "°" },
      { path: "hips.roll", label: "Body roll", ...limitOf("hips.roll"), unit: "°" },
      { path: "hips.forward_m", label: "Pelvis forward of the legs", ...limitOf("hips.forward_m"), step: 0.01, unit: "m" },
      { path: "hips.height_m", label: "Pelvis height", ...limitOf("hips.height_m"), step: 0.01, unit: "m" },
    ],
  },
  {
    id: "torso",
    label: "Spine & head",
    fields: [
      { path: "lumbar.flexion", label: "Lumbar flexion", ...limitOf("lumbar.flexion"), unit: "°" },
      { path: "lumbar.lateral", label: "Lumbar lateral", ...limitOf("lumbar.lateral"), unit: "°" },
      { path: "lumbar.twist", label: "Lumbar twist", ...limitOf("lumbar.twist"), unit: "°" },
      { path: "thoracic.flexion", label: "Thoracic flexion", ...limitOf("thoracic.flexion"), unit: "°" },
      { path: "thoracic.lateral", label: "Thoracic lateral", ...limitOf("thoracic.lateral"), unit: "°" },
      { path: "thoracic.twist", label: "Thoracic twist", ...limitOf("thoracic.twist"), unit: "°" },
      { path: "head.pitch", label: "Head pitch", ...limitOf("head.pitch"), unit: "°" },
      { path: "head.yaw", label: "Head yaw", ...limitOf("head.yaw"), unit: "°" },
      { path: "head.lateral", label: "Head lateral", ...limitOf("head.lateral"), unit: "°" },
    ],
  },
  { id: "left_arm", label: "Left arm", fields: armFields("left"), mirror: "right_arm" },
  { id: "right_arm", label: "Right arm", fields: armFields("right"), mirror: "left_arm" },
  { id: "left_leg", label: "Left leg", fields: legFields("left"), mirror: "right_leg" },
  { id: "right_leg", label: "Right leg", fields: legFields("right"), mirror: "left_leg" },
  {
    id: "implement",
    label: "Implement (two hands)",
    fields: [
      { path: "implement.height_m", label: "Bar height", ...limitOf("implement.height_m"), step: 0.01, unit: "m" },
      { path: "implement.forward_m", label: "Bar forward", ...limitOf("implement.forward_m"), step: 0.01, unit: "m" },
      { path: "implement.grip_width_m", label: "Grip width", ...limitOf("implement.grip_width_m"), step: 0.01, unit: "m" },
    ],
  },
];

export function getPoseValue(pose: PoseAngles, path: string): number | null {
  const [a, b] = path.split(".");
  const section = (pose as unknown as Record<string, Record<string, unknown> | null>)[a];
  const value = section?.[b];
  return typeof value === "number" ? value : null;
}

/** A copy of the pose with one field changed (creates the implement when one of its fields is set). */
export function setPoseValue(pose: PoseAngles, path: string, value: number | null): PoseAngles {
  const [a, b] = path.split(".");
  const next = { ...pose } as unknown as Record<string, Record<string, unknown> | null>;
  if (a === "implement" && !next.implement) next.implement = { height_m: 0.9, forward_m: 0.2, grip_width_m: 0.45 };
  next[a] = { ...(next[a] ?? {}), [b]: value };
  return next as unknown as PoseAngles;
}

/** The same field on the other side (`left_arm.x` ↔ `right_arm.x`), or null for a central one. */
export function mirrorPath(path: string): string | null {
  if (path.startsWith("left_")) return `right_${path.slice(5)}`;
  if (path.startsWith("right_")) return `left_${path.slice(6)}`;
  return null;
}

/** The clip json of a pose-editor draft (what the canvas plays and what gets saved). */
export function poseClipFromDraft(draft: {
  poses: PoseAngles[];
  mode: LoopMode;
  durationS: number;
  fps: number;
  twoHanded: boolean;
  grip: string | null;
  weights?: number[] | null;
  meta: Record<string, unknown>;
}): PoseClipJson {
  const weights = draft.weights && draft.weights.length === draft.poses.length ? draft.weights : null;
  return {
    kind: "pose-angles",
    version: POSE_CLIP_VERSION,
    fps: draft.fps,
    duration: draft.durationS,
    loop: draft.mode !== "once",
    keyframes: buildKeyframes(draft.poses, draft.durationS, draft.mode, weights ?? undefined),
    meta: { ...draft.meta, loop_mode: draft.mode, two_handed: draft.twoHanded, grip: draft.grip, segment_weights: weights, generator: "pose-editor" },
  };
}
