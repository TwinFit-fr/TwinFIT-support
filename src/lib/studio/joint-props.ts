import { DEFAULT_IMPLEMENT, HIPS_HEIGHT_BY_ORIENTATION, POSE_GROUPS, flatAnkle, getPoseValue, limitOf, type PoseAngles } from "./anatomy.ts";
import type { PointId } from "./pose-points.ts";
import { ROM } from "./rom.ts";

/**
 * The properties of a selected body point: which joint controls belong to it, what each one is
 * called (one plain name per control, with the side), what its ends mean, where the usual
 * training range sits on its track, and how typed numbers are read. Pure data and arithmetic,
 * shared by the pose editor's properties panel and its "All joints" list.
 */

export type JointUnit = "°" | "m";
export type JointSection = { id: string; title: string; paths: string[] };
export type JointGroup = { id: string; title: string; /** The body point that shows this group in its properties. */ point: PointId; paths: string[] };

type Side = "left" | "right";
type Base = { name: string; ends: [string, string] };

/** Per field, without the side: the plain name and what its two ends mean. */
const ARM: Record<string, Base> = {
  shoulder_plane: { name: "shoulder raise direction", ends: ["behind", "across the body"] },
  shoulder_elevation: { name: "shoulder elevation", ends: ["arm down", "overhead"] },
  shoulder_rotation: { name: "shoulder rotation", ends: ["turned in", "turned out"] },
  scapula_protraction: { name: "shoulder blade protraction", ends: ["squeezed back", "reaching forward"] },
  scapula_elevation: { name: "shoulder blade elevation", ends: ["pulled down", "shrugged"] },
  elbow_flexion: { name: "elbow flexion", ends: ["straight", "fully bent"] },
  forearm_pronation: { name: "forearm rotation", ends: ["palm forward", "palm back"] },
  wrist_flexion: { name: "wrist flexion", ends: ["bent back", "bent to the palm"] },
  wrist_deviation: { name: "wrist deviation", ends: ["to the little finger", "to the thumb"] },
};
const LEG: Record<string, Base> = {
  hip_flexion: { name: "hip flexion", ends: ["leg behind", "thigh up"] },
  hip_abduction: { name: "hip abduction", ends: ["across", "out to the side"] },
  hip_rotation: { name: "hip rotation", ends: ["toes in", "toes out"] },
  knee_flexion: { name: "knee flexion", ends: ["straight", "fully bent"] },
  ankle_dorsiflexion: { name: "ankle dorsiflexion", ends: ["toes pointed", "toes up"] },
  ankle_inversion: { name: "ankle inversion", ends: ["sole out", "sole in"] },
};
const CENTRAL: Record<string, Base> = {
  "hips.height_m": { name: "Pelvis height", ends: ["low", "high"] },
  "hips.forward_m": { name: "Pelvis forward", ends: ["back", "forward"] },
  "hips.pitch": { name: "Body lean", ends: ["back", "forward"] },
  "hips.yaw": { name: "Body turn", ends: ["to the right", "to the left"] },
  "hips.roll": { name: "Body side tilt", ends: ["right hip up", "left hip up"] },
  "lumbar.flexion": { name: "Lower back flexion", ends: ["arched", "rounded"] },
  "lumbar.lateral": { name: "Lower back side bend", ends: ["to the right", "to the left"] },
  "lumbar.twist": { name: "Lower back twist", ends: ["to the right", "to the left"] },
  "thoracic.flexion": { name: "Upper back flexion", ends: ["arched", "rounded"] },
  "thoracic.lateral": { name: "Upper back side bend", ends: ["to the right", "to the left"] },
  "thoracic.twist": { name: "Upper back twist", ends: ["to the right", "to the left"] },
  "head.pitch": { name: "Head nod", ends: ["looking up", "chin down"] },
  "head.yaw": { name: "Head turn", ends: ["to the right", "to the left"] },
  "head.lateral": { name: "Head tilt", ends: ["to the right", "to the left"] },
  "implement.height_m": { name: "Bar height", ends: ["floor", "high"] },
  "implement.forward_m": { name: "Bar forward", ends: ["back", "forward"] },
  "implement.grip_width_m": { name: "Bar grip width", ends: ["narrow", "wide"] },
};

function split(path: string): { side: Side | null; part: string; field: string } {
  const [part, field] = path.split(".");
  const m = /^(left|right)_(arm|leg)$/.exec(part);
  return m ? { side: m[1] as Side, part: m[2], field } : { side: null, part, field };
}

function base(path: string): Base | null {
  const { side, part, field } = split(path);
  if (side) return (part === "arm" ? ARM : LEG)[field] ?? null;
  return CENTRAL[path] ?? null;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The control's plain name, unique across the pose, with the side for a limb: "Left elbow flexion". */
export function jointName(path: string): string {
  const b = base(path);
  const { side } = split(path);
  if (!b) return path;
  return side ? `${capital(side)} ${b.name}` : b.name;
}

/** What the low and the high end of the control mean, in words ("straight", "fully bent"). */
export function jointEnds(path: string): [string, string] {
  return base(path)?.ends ?? ["", ""];
}

export function jointUnit(path: string): JointUnit {
  return path.endsWith("_m") ? "m" : "°";
}

/** Every field the pose editor can set, in the order of the body. */
export const ALL_JOINT_PATHS: readonly string[] = POSE_GROUPS.flatMap((g) => g.fields.map((f) => f.path));

const arm = (s: Side, ...fields: string[]) => fields.map((f) => `${s}_arm.${f}`);
const leg = (s: Side, ...fields: string[]) => fields.map((f) => `${s}_leg.${f}`);
const BAR: JointSection = { id: "bar", title: "Bar (both hands)", paths: ["implement.height_m", "implement.forward_m", "implement.grip_width_m"] };

/**
 * The joint controls a body point shows when it is selected, in sections, and nothing from other
 * body parts: a hand shows its shoulder, elbow, forearm and wrist; a foot its hip, knee and ankle.
 * With a bar in both hands, the hands also show the bar, which their arms are solved to reach.
 */
export function pointJoints(point: PointId, { twoHanded = false }: { twoHanded?: boolean } = {}): JointSection[] {
  const side: Side | null = point.startsWith("left_") ? "left" : point.startsWith("right_") ? "right" : null;
  switch (point) {
    case "hips":
      return [
        { id: "pelvis", title: "Pelvis", paths: ["hips.height_m", "hips.forward_m"] },
        { id: "body", title: "Whole body", paths: ["hips.pitch", "hips.yaw", "hips.roll"] },
      ];
    case "chest":
      return [
        { id: "lumbar", title: "Lower back", paths: ["lumbar.flexion", "lumbar.lateral", "lumbar.twist"] },
        { id: "thoracic", title: "Upper back", paths: ["thoracic.flexion", "thoracic.lateral", "thoracic.twist"] },
      ];
    case "head":
      return [{ id: "head", title: "Head and neck", paths: ["head.pitch", "head.yaw", "head.lateral"] }];
  }
  const s = side as Side;
  if (point.endsWith("_elbow")) {
    return [
      { id: "shoulder", title: "Shoulder", paths: arm(s, "shoulder_plane", "shoulder_elevation", "shoulder_rotation") },
      { id: "elbow", title: "Elbow", paths: arm(s, "elbow_flexion") },
      { id: "scapula", title: "Shoulder blade", paths: arm(s, "scapula_protraction", "scapula_elevation") },
    ];
  }
  if (point.endsWith("_hand")) {
    const sections: JointSection[] = [
      { id: "shoulder", title: "Shoulder", paths: arm(s, "shoulder_plane", "shoulder_elevation", "shoulder_rotation") },
      { id: "elbow", title: "Elbow", paths: arm(s, "elbow_flexion") },
      { id: "forearm", title: "Forearm", paths: arm(s, "forearm_pronation") },
      { id: "wrist", title: "Wrist", paths: arm(s, "wrist_flexion", "wrist_deviation") },
    ];
    return twoHanded ? [...sections, BAR] : sections;
  }
  if (point.endsWith("_knee")) {
    return [
      { id: "hip", title: "Hip", paths: leg(s, "hip_flexion", "hip_abduction", "hip_rotation") },
      { id: "knee", title: "Knee", paths: leg(s, "knee_flexion") },
    ];
  }
  return [
    { id: "hip", title: "Hip", paths: leg(s, "hip_flexion", "hip_abduction", "hip_rotation") },
    { id: "knee", title: "Knee", paths: leg(s, "knee_flexion") },
    { id: "ankle", title: "Ankle", paths: leg(s, "ankle_dorsiflexion", "ankle_inversion") },
  ];
}

/** Every joint of the pose by body part, for the "All joints" list (the bar only with one in the hands). */
export function allJointGroups({ twoHanded = false }: { twoHanded?: boolean } = {}): JointGroup[] {
  const point: Record<string, PointId> = {
    hips: "hips",
    torso: "chest",
    left_arm: "left_hand",
    right_arm: "right_hand",
    left_leg: "left_foot",
    right_leg: "right_foot",
    implement: "left_hand",
  };
  const title: Record<string, string> = { hips: "Pelvis and whole body", torso: "Spine and head", implement: "Bar (both hands)" };
  return POSE_GROUPS.filter((g) => g.id !== "implement" || twoHanded).map((g) => ({
    id: g.id,
    title: title[g.id] ?? g.label,
    point: point[g.id] ?? "hips",
    paths: g.fields.map((f) => f.path),
  }));
}

export type RangeMarks = {
  min: number;
  max: number;
  step: number;
  unit: JointUnit;
  /** The usual training range, as fractions of the track (0 = min, 1 = max); null where no anatomy applies (position of the body or the bar). */
  band: { from: number; to: number; lo: number; hi: number } | null;
  /** Where zero sits on the track (the anatomical position), when it is inside the range. */
  zero: number | null;
};

const fraction = (v: number, min: number, max: number) => (max > min ? Math.min(1, Math.max(0, (v - min) / (max - min))) : 0);

/** The ends of the control (the hard limits) and the marks on its track (training range, zero). */
export function rangeMarks(path: string): RangeMarks {
  const { min, max } = limitOf(path);
  const unit = jointUnit(path);
  const rom = ROM[split(path).side ? `${split(path).part}.${split(path).field}` : path];
  const band = rom ? { from: fraction(rom.training[0], min, max), to: fraction(rom.training[1], min, max), lo: rom.training[0], hi: rom.training[1] } : null;
  return { min, max, step: unit === "m" ? 0.01 : 1, unit, band, zero: min < 0 && max > 0 ? fraction(0, min, max) : null };
}

/** Outside the usual training range: allowed, but worth a second look. */
export function isUnusual(path: string, value: number): boolean {
  const band = rangeMarks(path).band;
  return band !== null && (value < band.lo - 1e-6 || value > band.hi + 1e-6);
}

/** A value as the number field shows it: metres to the centimetre, degrees to a tenth (no trailing ".0"). */
export function formatEntry(value: number, unit: JointUnit): string {
  if (!Number.isFinite(value)) return "";
  if (unit === "m") return value.toFixed(2);
  const r = Math.round(value * 10) / 10;
  return String(Object.is(r, -0) ? 0 : r);
}

/** A value with its unit, for reading out: "−5°", "0.92 m". */
export function formatValue(value: number, unit: JointUnit): string {
  const text = formatEntry(value, unit).replace(/^-/, "−");
  return unit === "m" ? `${text} m` : `${text}°`;
}

export type Entry = { kind: "empty" } | { kind: "invalid" } | { kind: "ok"; value: number; clamped: boolean };

/**
 * What a typed number means: an empty field (or a lone sign or point, half typed) is nothing yet,
 * never zero; a comma or a typographic minus is accepted; the value is kept inside the limits and
 * says when it was.
 */
export function parseEntry(text: string, { min = -Infinity, max = Infinity }: { min?: number; max?: number } = {}): Entry {
  const t = text.trim().replace(",", ".").replace(/^[−–]/, "-");
  if (t === "" || t === "-" || t === "." || t === "-." || t === "+") return { kind: "empty" };
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return { kind: "invalid" };
  const parsed = Number(t);
  if (!Number.isFinite(parsed)) return { kind: "invalid" };
  const value = Math.min(max, Math.max(min, parsed));
  return { kind: "ok", value, clamped: value !== parsed };
}

/** One arrow-key step of a number field (ten with Shift), inside the limits and free of float noise. */
export function stepEntry(value: number, direction: 1 | -1, { step, min, max, coarse = false }: { step: number; min: number; max: number; coarse?: boolean }): number {
  const next = value + direction * step * (coarse ? 10 : 1);
  return Math.min(max, Math.max(min, Math.round(next * 1e6) / 1e6));
}

/**
 * The skeleton joints (Mixamo logical names) a control turns, for the stage to mark while the
 * control is hovered or focused; two names mean the point halfway between them.
 */
export function jointBones(path: string): string[] {
  const { side, part, field } = split(path);
  if (side) {
    const S = side === "left" ? "Left" : "Right";
    if (part === "arm") {
      if (field.startsWith("scapula")) return [`${S}Shoulder`];
      if (field.startsWith("shoulder")) return [`${S}Arm`];
      if (field === "elbow_flexion") return [`${S}ForeArm`];
      if (field === "forearm_pronation") return [`${S}ForeArm`, `${S}Hand`];
      return [`${S}Hand`];
    }
    if (field.startsWith("hip")) return [`${S}UpLeg`];
    if (field.startsWith("knee")) return [`${S}Leg`];
    return [`${S}Foot`];
  }
  if (part === "hips") return ["Hips"];
  if (part === "lumbar") return ["Spine"];
  if (part === "thoracic") return ["Spine2"];
  if (part === "head") return ["Neck"];
  if (part === "implement") return ["LeftHand", "RightHand"];
  return [];
}

/** "arm" or "leg" for a limb point, null for a point in the middle of the body. */
export function limbOf(point: PointId): "arm" | "leg" | null {
  if (/_(elbow|hand)$/.test(point)) return "arm";
  if (/_(knee|foot)$/.test(point)) return "leg";
  return null;
}

/** What Mirror does with a change made in this point's properties, in one sentence. */
export function mirrorNote(point: PointId, { mirror, standing }: { mirror: boolean; standing: boolean }): string {
  const limb = limbOf(point);
  if (!limb) return "Mirror does not apply here: this point is in the middle of the body.";
  const side = point.startsWith("left_") ? "left" : "right";
  const other = side === "left" ? "right" : "left";
  if (!mirror) return `Mirror off: only the ${side} ${limb} changes.`;
  const stage = limb === "leg" && standing ? " On the stage, a standing leg is still dragged alone." : "";
  return `Mirror on: a change here is copied to the ${other} ${limb}.${stage}`;
}

export type ShownValue = {
  value: number;
  /** The pose leaves it to the solver (pelvis height on Auto): the value is what the body is at. */
  auto: boolean;
  /** Worked out from something else (an ankle while the sole stays flat): not set here. */
  follows: boolean;
};

/** Standing pelvis height before the stage has solved one (metres). */
const STANDING_HIPS_M = 0.9;

/**
 * What a control shows for this pose: the stored value, or, where the pose leaves it open, the
 * value the body is drawn at, so the first drag starts from what is on screen. The pelvis height
 * on Auto reads the solved height (`hipsY`, from the stage), never 0; a flat-footed ankle reads
 * the angle that keeps its sole on the floor; a bar not placed yet reads where it would start.
 */
export function shownValue(pose: PoseAngles, path: string, { hipsY, flatFoot }: { hipsY?: number; flatFoot?: (side: Side) => boolean } = {}): ShownValue {
  const { side, field } = split(path);
  if (side && field === "ankle_dorsiflexion" && flatFoot?.(side)) return { value: flatAnkle(pose, side), auto: false, follows: true };
  const stored = getPoseValue(pose, path);
  if (stored !== null) return { value: stored, auto: false, follows: false };
  if (path === "hips.height_m") {
    const fallback = pose.orientation === "standing" ? STANDING_HIPS_M : HIPS_HEIGHT_BY_ORIENTATION[pose.orientation];
    const { min, max } = limitOf(path);
    return { value: Math.min(max, Math.max(min, hipsY ?? fallback)), auto: true, follows: false };
  }
  if (path.startsWith("implement.")) return { value: DEFAULT_IMPLEMENT[field as keyof typeof DEFAULT_IMPLEMENT] ?? 0, auto: false, follows: false };
  return { value: 0, auto: false, follows: false };
}
