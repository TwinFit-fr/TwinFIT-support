/**
 * Anatomical pose parameters: the vocabulary the LLM extracts from the catalog pose texts and the
 * viewer turns into bone rotations on any Mixamo-named rig. Degrees everywhere, metres for
 * heights. Character frame: +Y up, +Z forward (the way the avatar faces), +X the avatar's left.
 * No three.js here: this module is shared by the server (worker) and the client (viewer).
 */

export const ORIENTATIONS = ["standing", "prone", "supine", "side_lying", "kneeling", "seated", "hanging"] as const;
export type Orientation = (typeof ORIENTATIONS)[number];

export type ArmAngles = {
  /** 0 arm along the body, 90 horizontal out to the side (T-pose), 180 straight overhead. */
  shoulder_abduction: number;
  /** 0 in the frontal plane, 90 arm pointing straight forward, negative behind the body. */
  shoulder_flexion: number;
  /** Rotation about the upper arm axis, + external. */
  shoulder_rotation: number;
  /** 0 straight, 90 right angle, 150 fully bent. */
  elbow_flexion: number;
  /** Forearm rotation, + pronation (palm turning down / back). */
  forearm_pronation: number;
  /** + palm side (flexion), - back of the hand (extension). */
  wrist_flexion: number;
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
  /** + toes pulled up (dorsiflexion), - pointed (plantar flexion). */
  ankle_dorsiflexion: number;
};

export type PoseAngles = {
  orientation: Orientation;
  hips: {
    /** Forward tilt of the whole body at the pelvis: 0 upright, 90 horizontal face down (plank), -90 lying on the back. */
    pitch: number;
    /** Turn about the vertical axis, + to the left. */
    yaw: number;
    /** Side tilt, + left hip up. */
    roll: number;
    /** Pelvis height above the floor in metres when not standing; null when standing (computed from the legs). */
    height_m: number | null;
    /** Pelvis shift forward (+) or back (-) from the standing position, metres. */
    forward_m: number;
  };
  torso: {
    /** Spine bend relative to the pelvis, + forward (rounding), - extension (arching). */
    flexion: number;
    /** + bend to the left. */
    lateral: number;
    /** + turn to the left. */
    twist: number;
  };
  head: { pitch: number; yaw: number };
  left_arm: ArmAngles;
  right_arm: ArmAngles;
  left_leg: LegAngles;
  right_leg: LegAngles;
};

export const NEUTRAL_ARM: ArmAngles = {
  shoulder_abduction: 10,
  shoulder_flexion: 0,
  shoulder_rotation: 0,
  elbow_flexion: 5,
  forearm_pronation: 0,
  wrist_flexion: 0,
};

export const NEUTRAL_LEG: LegAngles = {
  hip_flexion: 0,
  hip_abduction: 5,
  hip_rotation: 5,
  knee_flexion: 5,
  ankle_dorsiflexion: 0,
};

export const NEUTRAL_POSE: PoseAngles = {
  orientation: "standing",
  hips: { pitch: 0, yaw: 0, roll: 0, height_m: null, forward_m: 0 },
  torso: { flexion: 0, lateral: 0, twist: 0 },
  head: { pitch: 0, yaw: 0 },
  left_arm: NEUTRAL_ARM,
  right_arm: NEUTRAL_ARM,
  left_leg: NEUTRAL_LEG,
  right_leg: NEUTRAL_LEG,
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

// ---------------------------------------------------------------------------
// JSON schema for the LLM (OpenAI structured outputs, strict: every key required).
// ---------------------------------------------------------------------------

const num = (description: string) => ({ type: "number", description });

const ARM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["shoulder_abduction", "shoulder_flexion", "shoulder_rotation", "elbow_flexion", "forearm_pronation", "wrist_flexion"],
  properties: {
    shoulder_abduction: num("0 arm hanging along the body, 90 horizontal out to the side, 180 straight overhead"),
    shoulder_flexion: num("0 arm in the frontal plane, 90 arm pointing straight forward, negative behind the body"),
    shoulder_rotation: num("rotation about the upper arm axis, + external, usually 0"),
    elbow_flexion: num("0 straight, 90 right angle, 150 fully bent"),
    forearm_pronation: num("+ pronation (palm down/back), - supination (palm up/forward), usually 0"),
    wrist_flexion: num("+ palm side, - back of the hand, usually 0"),
  },
} as const;

const LEG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["hip_flexion", "hip_abduction", "hip_rotation", "knee_flexion", "ankle_dorsiflexion"],
  properties: {
    hip_flexion: num("thigh relative to the pelvis: 0 in line with the torso (standing tall), 90 thigh horizontal forward, 120 deep squat"),
    hip_abduction: num("+ thigh out to the side; shoulder-width stance is about 5"),
    hip_rotation: num("+ toes turned out; usually 5"),
    knee_flexion: num("0 straight, 90 right angle, 130 deep squat"),
    ankle_dorsiflexion: num("+ toes pulled up towards the shin, - pointed; standing 0, bottom of a squat about 25"),
  },
} as const;

export const POSE_ANGLES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["orientation", "hips", "torso", "head", "left_arm", "right_arm", "left_leg", "right_leg"],
  properties: {
    orientation: { type: "string", enum: [...ORIENTATIONS], description: "how the body is supported" },
    hips: {
      type: "object",
      additionalProperties: false,
      required: ["pitch", "yaw", "roll", "height_m", "forward_m"],
      properties: {
        pitch: num("forward tilt of the whole body at the pelvis: 0 upright, 45 hip hinge, 90 horizontal face down (plank, push-up), -90 lying on the back"),
        yaw: num("turn about the vertical axis, + to the left, usually 0"),
        roll: num("side tilt, + left hip up, usually 0"),
        height_m: { type: ["number", "null"], description: "pelvis height above the floor in metres when the legs do not carry the body (prone, supine, seated, kneeling, hanging); null when standing" },
        forward_m: num("pelvis shift forward (+) or back (-) from standing, metres; a hip hinge sends it back about -0.15"),
      },
    },
    torso: {
      type: "object",
      additionalProperties: false,
      required: ["flexion", "lateral", "twist"],
      properties: {
        flexion: num("spine bend relative to the pelvis, + rounding forward, - arching back; a neutral spine is 0 even when the whole body leans (use hips.pitch for that)"),
        lateral: num("+ bend to the left"),
        twist: num("+ turn to the left"),
      },
    },
    head: {
      type: "object",
      additionalProperties: false,
      required: ["pitch", "yaw"],
      properties: { pitch: num("+ chin down, - looking up"), yaw: num("+ turned left") },
    },
    left_arm: ARM_SCHEMA,
    right_arm: ARM_SCHEMA,
    left_leg: LEG_SCHEMA,
    right_leg: LEG_SCHEMA,
  },
} as const;

export const POSE_SET_SCHEMA = {
  name: "exercise_pose_angles",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["poses", "notes"],
    properties: {
      poses: {
        type: "array",
        description: "exactly three items: the start, mid and end frame, in this order",
        items: POSE_ANGLES_SCHEMA,
      },
      notes: { type: "string", description: "one line on anything the texts leave ambiguous" },
    },
  },
} as const;

/** Clamp every angle to a plausible human range so a bad extraction cannot fold the avatar. */
export function sanitizePose(p: PoseAngles): PoseAngles {
  const c = (v: unknown, lo: number, hi: number, fallback = 0) => {
    const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
    return Math.min(hi, Math.max(lo, n));
  };
  const arm = (a: ArmAngles): ArmAngles => ({
    shoulder_abduction: c(a?.shoulder_abduction, -30, 180, 10),
    shoulder_flexion: c(a?.shoulder_flexion, -60, 180),
    shoulder_rotation: c(a?.shoulder_rotation, -90, 90),
    elbow_flexion: c(a?.elbow_flexion, 0, 150, 5),
    forearm_pronation: c(a?.forearm_pronation, -90, 90),
    wrist_flexion: c(a?.wrist_flexion, -70, 70),
  });
  const leg = (l: LegAngles): LegAngles => ({
    hip_flexion: c(l?.hip_flexion, -30, 140),
    hip_abduction: c(l?.hip_abduction, -30, 60, 5),
    hip_rotation: c(l?.hip_rotation, -45, 45, 5),
    knee_flexion: c(l?.knee_flexion, 0, 150, 5),
    ankle_dorsiflexion: c(l?.ankle_dorsiflexion, -50, 40),
  });
  return {
    orientation: ORIENTATIONS.includes(p?.orientation) ? p.orientation : "standing",
    hips: {
      pitch: c(p?.hips?.pitch, -180, 180),
      yaw: c(p?.hips?.yaw, -180, 180),
      roll: c(p?.hips?.roll, -90, 90),
      height_m: typeof p?.hips?.height_m === "number" && Number.isFinite(p.hips.height_m) ? Math.min(2.2, Math.max(0.05, p.hips.height_m)) : null,
      forward_m: c(p?.hips?.forward_m, -0.6, 0.6),
    },
    torso: { flexion: c(p?.torso?.flexion, -45, 90), lateral: c(p?.torso?.lateral, -45, 45), twist: c(p?.torso?.twist, -60, 60) },
    head: { pitch: c(p?.head?.pitch, -60, 60), yaw: c(p?.head?.yaw, -80, 80) },
    left_arm: arm(p?.left_arm),
    right_arm: arm(p?.right_arm),
    left_leg: leg(p?.left_leg),
    right_leg: leg(p?.right_leg),
  };
}

/** Keyframes of one repetition from the three catalog poses: start → mid → end (→ start when looping). */
export function keyframesFromPoses(poses: PoseAngles[], durationS: number, loop: boolean): PoseKeyframe[] {
  const [start, mid, end] = poses;
  if (!start || !mid || !end) throw new Error("Three poses are needed");
  if (loop) {
    return [
      { t: 0, position: 0, angles: start },
      { t: durationS * 0.4, position: 1, angles: mid },
      { t: durationS * 0.75, position: 2, angles: end },
      { t: durationS, position: 0, angles: start },
    ];
  }
  return [
    { t: 0, position: 0, angles: start },
    { t: durationS * 0.5, position: 1, angles: mid },
    { t: durationS, position: 2, angles: end },
  ];
}
