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

export type PoseAngles = {
  orientation: Orientation;
  hips: {
    /** Forward tilt of the whole body at the pelvis: 0 upright, 90 horizontal face down (plank), -90 lying on the back. */
    pitch: number;
    /** Turn about the vertical axis, + to the left. */
    yaw: number;
    /** Side tilt, + left hip up. */
    roll: number;
    /** Pelvis height above the floor in metres; null = automatic (from the legs when standing, else the orientation's default). */
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
  /** Null when the exercise has no two-handed implement in this frame. */
  implement: ImplementPose | null;
  /**
   * Pinned points: a foot or hand stays exactly there (its leg or arm is solved to it); a knee is
   * the pole of its leg. World metres, in the avatar's frame (the bone's position: ankle, wrist, knee).
   */
  anchors?: PoseAnchors;
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
  required: ["orientation", "hips", "torso", "head", "left_arm", "right_arm", "left_leg", "right_leg", "implement"],
  properties: {
    orientation: { type: "string", enum: [...ORIENTATIONS], description: "how the body is supported" },
    implement: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["height_m", "forward_m", "grip_width_m"],
      description: "the two-handed implement (barbell, EZ bar, plate, bar handle) in this frame, when the exercise has one; null otherwise. The arms are solved to reach it, so this is what makes the grip exact",
      properties: {
        height_m: num("height of the implement's centre above the floor, metres (floor 0.22 for a loaded barbell, mid-thigh about 0.75, shoulders about 1.4, overhead about 2.1 for a 1.75 m avatar; scale with the avatar height)"),
        forward_m: num("forward (+) / back (-) of the implement's centre from the avatar's standing midline, metres (over mid-foot about 0.05, held at the chest about 0.2, arms extended forward about 0.55)"),
        grip_width_m: num("distance between the hands, metres (shoulder width 0.45, bench press 0.8, wide 1.0, narrow 0.25)"),
      },
    },
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
    implement:
      p?.implement && typeof p.implement === "object"
        ? {
            height_m: c(p.implement.height_m, 0, 2.6, 0.9),
            forward_m: c(p.implement.forward_m, -0.6, 1.0, 0.2),
            grip_width_m: c(p.implement.grip_width_m, 0.05, 1.4, 0.45),
          }
        : null,
    ...(p?.anchors && typeof p.anchors === "object" ? { anchors: sanitizeAnchors(p.anchors) } : {}),
  };
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

/** Expand an ordered list of poses into timed keyframes, evenly spaced over the duration. */
export function buildKeyframes(poses: PoseAngles[], durationS: number, mode: LoopMode): PoseKeyframe[] {
  if (!poses.length) throw new Error("A pose is needed");
  if (poses.length === 1) {
    return [
      { t: 0, position: 0, angles: poses[0] },
      { t: durationS, position: 0, angles: poses[0] },
    ];
  }
  const order: number[] =
    mode === "cycle"
      ? [...poses.map((_, i) => i), 0]
      : mode === "pingpong"
        ? [...poses.map((_, i) => i), ...poses.map((_, i) => i).reverse().slice(1)]
        : poses.map((_, i) => i);
  const steps = order.length - 1;
  return order.map((index, k) => ({ t: (durationS * k) / steps, position: index, angles: poses[index] }));
}

/** Keyframes of one repetition from the three catalog poses (start, mid, end). */
export function keyframesFromPoses(poses: PoseAngles[], durationS: number, loop: boolean): PoseKeyframe[] {
  if (poses.length !== 3) throw new Error("Three poses are needed");
  return buildKeyframes(poses, durationS, loop ? "cycle" : "once");
}

/** The editable poses of a clip: one per distinct `position`, in order; a trailing return to the start is dropped. */
export function posesFromClip(clip: PoseClipJson): { poses: PoseAngles[]; mode: LoopMode } {
  const keys = [...clip.keyframes].sort((a, b) => a.t - b.t);
  const byPosition = new Map<number, PoseAngles>();
  keys.forEach((k, i) => {
    const pos = k.position ?? i;
    if (!byPosition.has(pos)) byPosition.set(pos, k.angles);
  });
  const poses = [...byPosition.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
  const metaMode = clip.meta?.loop_mode;
  const mode: LoopMode = metaMode === "pingpong" || metaMode === "once" || metaMode === "cycle" ? metaMode : clip.loop ? "cycle" : "once";
  return { poses: poses.length ? poses : [NEUTRAL_POSE], mode };
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

/**
 * Range of motion of every joint angle, degrees (metres for the pelvis and the bar). The sliders
 * stop here and the limb solver never leaves these ranges when a hand, foot or knee is dragged
 * or pinned. Side-less keys: the same range applies to both sides.
 */
export const JOINT_LIMITS: Record<string, { min: number; max: number }> = {
  "arm.shoulder_abduction": { min: -30, max: 180 },
  "arm.shoulder_flexion": { min: -60, max: 180 },
  "arm.shoulder_rotation": { min: -90, max: 90 },
  "arm.elbow_flexion": { min: 0, max: 150 },
  "arm.forearm_pronation": { min: -90, max: 90 },
  "arm.wrist_flexion": { min: -70, max: 70 },
  "leg.hip_flexion": { min: -30, max: 140 },
  "leg.hip_abduction": { min: -30, max: 60 },
  "leg.hip_rotation": { min: -45, max: 45 },
  "leg.knee_flexion": { min: 0, max: 150 },
  "leg.ankle_dorsiflexion": { min: -50, max: 40 },
  "hips.pitch": { min: -180, max: 180 },
  "hips.yaw": { min: -180, max: 180 },
  "hips.roll": { min: -90, max: 90 },
  "hips.forward_m": { min: -0.6, max: 0.6 },
  "hips.height_m": { min: 0.05, max: 2.2 },
  "torso.flexion": { min: -45, max: 90 },
  "torso.lateral": { min: -45, max: 45 },
  "torso.twist": { min: -60, max: 60 },
  "head.pitch": { min: -60, max: 60 },
  "head.yaw": { min: -80, max: 80 },
  "implement.height_m": { min: 0, max: 2.6 },
  "implement.forward_m": { min: -0.6, max: 1.0 },
  "implement.grip_width_m": { min: 0.05, max: 1.4 },
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
  { path: `${side}_arm.shoulder_abduction`, label: "Shoulder abduction", ...limitOf(`${side}_arm.shoulder_abduction`), unit: "°" },
  { path: `${side}_arm.shoulder_flexion`, label: "Shoulder flexion", ...limitOf(`${side}_arm.shoulder_flexion`), unit: "°" },
  { path: `${side}_arm.shoulder_rotation`, label: "Shoulder rotation", ...limitOf(`${side}_arm.shoulder_rotation`), unit: "°" },
  { path: `${side}_arm.elbow_flexion`, label: "Elbow flexion", ...limitOf(`${side}_arm.elbow_flexion`), unit: "°" },
  { path: `${side}_arm.forearm_pronation`, label: "Forearm pronation", ...limitOf(`${side}_arm.forearm_pronation`), unit: "°" },
  { path: `${side}_arm.wrist_flexion`, label: "Wrist flexion", ...limitOf(`${side}_arm.wrist_flexion`), unit: "°" },
];
const legFields = (side: "left" | "right"): PoseField[] => [
  { path: `${side}_leg.hip_flexion`, label: "Hip flexion", ...limitOf(`${side}_leg.hip_flexion`), unit: "°" },
  { path: `${side}_leg.hip_abduction`, label: "Hip abduction", ...limitOf(`${side}_leg.hip_abduction`), unit: "°" },
  { path: `${side}_leg.hip_rotation`, label: "Hip rotation", ...limitOf(`${side}_leg.hip_rotation`), unit: "°" },
  { path: `${side}_leg.knee_flexion`, label: "Knee flexion", ...limitOf(`${side}_leg.knee_flexion`), unit: "°" },
  { path: `${side}_leg.ankle_dorsiflexion`, label: "Ankle dorsiflexion", ...limitOf(`${side}_leg.ankle_dorsiflexion`), unit: "°" },
];

export const POSE_GROUPS: PoseGroup[] = [
  {
    id: "hips",
    label: "Hips & body",
    fields: [
      { path: "hips.pitch", label: "Body pitch (forward lean)", ...limitOf("hips.pitch"), unit: "°" },
      { path: "hips.yaw", label: "Body yaw", ...limitOf("hips.yaw"), unit: "°" },
      { path: "hips.roll", label: "Body roll", ...limitOf("hips.roll"), unit: "°" },
      { path: "hips.forward_m", label: "Pelvis forward", ...limitOf("hips.forward_m"), step: 0.01, unit: "m" },
      { path: "hips.height_m", label: "Pelvis height", ...limitOf("hips.height_m"), step: 0.01, unit: "m" },
    ],
  },
  {
    id: "torso",
    label: "Torso & head",
    fields: [
      { path: "torso.flexion", label: "Spine flexion", ...limitOf("torso.flexion"), unit: "°" },
      { path: "torso.lateral", label: "Spine lateral", ...limitOf("torso.lateral"), unit: "°" },
      { path: "torso.twist", label: "Spine twist", ...limitOf("torso.twist"), unit: "°" },
      { path: "head.pitch", label: "Head pitch", ...limitOf("head.pitch"), unit: "°" },
      { path: "head.yaw", label: "Head yaw", ...limitOf("head.yaw"), unit: "°" },
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
  meta: Record<string, unknown>;
}): PoseClipJson {
  return {
    kind: "pose-angles",
    fps: draft.fps,
    duration: draft.durationS,
    loop: draft.mode !== "once",
    keyframes: buildKeyframes(draft.poses, draft.durationS, draft.mode),
    meta: { ...draft.meta, loop_mode: draft.mode, two_handed: draft.twoHanded, grip: draft.grip, generator: "pose-editor" },
  };
}
