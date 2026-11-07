/**
 * Exercise templates: the key poses of every movement family, written once by hand, instead of
 * asking a language model for 35 coupled angles per pose. The model only picks a few bounded
 * parameters (how deep, how wide); everything that depends on the avatar is left to the solver:
 * feet stay planted, ankles close the chain, the pelvis follows the legs, and `goal` asks the rig
 * for what only it can answer (how low the hips go for the hands to reach a bar on the floor).
 * Angles follow anatomy.ts: zero is the anatomical position, arms relative to the trunk.
 * Exercise-specific ranges: docs/studio-biomechanics-audit-2026-11-07.md, section 2.
 */

import { NEUTRAL_POSE, type ArmAngles, type LegAngles, type LoopMode, type Orientation, type PoseAngles, type PoseGoal, type SpineAngles } from "./anatomy.ts";

export const RANGES = ["partial", "full", "deep"] as const;
export const STANCES = ["narrow", "hip", "shoulder", "wide"] as const;
export const GRIPS = ["narrow", "shoulder", "wide"] as const;
export const LEANS = ["upright", "moderate", "forward"] as const;
export const SIDES = ["both", "left", "right", "alternate"] as const;

/** What the model may choose: nothing else about a pose is up to it. */
export type TemplateParams = {
  range: (typeof RANGES)[number];
  stance: (typeof STANCES)[number];
  grip: (typeof GRIPS)[number];
  lean: (typeof LEANS)[number];
  side: (typeof SIDES)[number];
  /** Seconds lowering (against the load's way) and lifting. */
  down_s: number;
  up_s: number;
};

export const DEFAULT_PARAMS: TemplateParams = { range: "full", stance: "shoulder", grip: "shoulder", lean: "moderate", side: "both", down_s: 2, up_s: 1 };

export type TemplateExercise = {
  name: string;
  movement: string | null;
  position: string | null;
  equipment: string | null;
  support: string | null;
  grip: string | null;
};

export type BuiltTemplate = {
  id: string;
  poses: PoseAngles[];
  labels: string[];
  /** Relative time into each pose (see buildKeyframes). */
  weights: number[];
  mode: LoopMode;
  /** One side works: the validator does not ask for symmetry. */
  unilateral: boolean;
  /** The feet leave the floor or travel on purpose. */
  airborne: boolean;
  moving: boolean;
};

type Pose = PoseAngles;
type Edit = (p: Pose) => Pose;

const build = (...edits: Edit[]): Pose => edits.reduce((p, e) => e(p), NEUTRAL_POSE);
const arm = (side: "left" | "right", kv: Partial<ArmAngles>): Edit => (p) => ({ ...p, [`${side}_arm`]: { ...p[`${side}_arm`], ...kv } });
const arms = (kv: Partial<ArmAngles>): Edit => (p) => arm("right", kv)(arm("left", kv)(p));
const leg = (side: "left" | "right", kv: Partial<LegAngles>): Edit => (p) => ({ ...p, [`${side}_leg`]: { ...p[`${side}_leg`], ...kv } });
const legs = (kv: Partial<LegAngles>): Edit => (p) => leg("right", kv)(leg("left", kv)(p));
const hips = (kv: Partial<PoseAngles["hips"]>): Edit => (p) => ({ ...p, hips: { ...p.hips, ...kv } });
const lean = (pitch: number) => hips({ pitch });
const spine = (lumbar: Partial<SpineAngles>, thoracic: Partial<SpineAngles> = {}): Edit => (p) => ({ ...p, lumbar: { ...p.lumbar, ...lumbar }, thoracic: { ...p.thoracic, ...thoracic } });
const head = (kv: Partial<PoseAngles["head"]>): Edit => (p) => ({ ...p, head: { ...p.head, ...kv } });
const support = (orientation: Orientation, height_m?: number): Edit => (p) => ({ ...p, orientation, ...(orientation === "standing" ? {} : { feet_flat: false }), hips: { ...p.hips, height_m: height_m ?? null } });
const feetDown: Edit = (p) => ({ ...p, feet_flat: true });
const heelsFree: Edit = (p) => ({ ...p, feet_flat: false });
const goal = (g: PoseGoal): Edit => (p) => ({ ...p, goal: g });
const planted: Edit = (p) => ({ ...p, plant_hands: true });
const onToes = (height = 0): Edit => (p) => ({ ...p, toes_down: height });
const freeFoot = (side: "left" | "right"): Edit => (p) => ({ ...p, free_foot: side });
const stepping: Edit = (p) => ({ ...p, steps: true });
const onKnees: Edit = (p) => ({ ...p, knees_down: true });
const handsFlat: Edit = (p) => ({ ...p, hands_flat: true });

const other = (side: "left" | "right") => (side === "left" ? "right" : "left");
/** Two poses as one repetition: out and back at the two tempos. */
const rep = (id: string, top: Pose, bottom: Pose, labels: [string, string], prm: TemplateParams, extra: Partial<BuiltTemplate> = {}): BuiltTemplate => ({
  id,
  poses: [top, bottom],
  labels,
  weights: [prm.up_s, prm.down_s],
  mode: "cycle",
  unilateral: false,
  airborne: false,
  moving: false,
  ...extra,
});
/** Poses in a loop at an even pace. */
const loop = (id: string, poses: Pose[], labels: string[], extra: Partial<BuiltTemplate> = {}): BuiltTemplate => ({ id, poses, labels, weights: poses.map(() => 1), mode: "cycle", unilateral: false, airborne: false, moving: false, ...extra });

// Stance and grip, once.
const stanceOf = (prm: TemplateParams): Partial<LegAngles> =>
  ({ narrow: { hip_abduction: 2, hip_rotation: 0 }, hip: { hip_abduction: 4, hip_rotation: 5 }, shoulder: { hip_abduction: 8, hip_rotation: 10 }, wide: { hip_abduction: 20, hip_rotation: 25 } })[prm.stance];
/** Which way the palms face, as the catalog's grip says: UNDERHAND up, HAMMER in, otherwise over the bar. */
const palms = (ex: TemplateExercise, overhand = 170) => (ex.grip === "UNDERHAND" ? 0 : ex.grip === "HAMMER" ? 90 : overhand);
/** Arms hanging to the floor from a trunk leaning `pitch`: relative to the trunk they are raised by that much. */
const hanging = (pitch: number, pron: number, width = 0): Partial<ArmAngles> => ({ shoulder_plane: 90 - width, shoulder_elevation: pitch + Math.abs(width) * 0.12, forearm_pronation: pron });
const gripPlane = (prm: TemplateParams) => ({ narrow: 80, shoulder: 60, wide: 40 })[prm.grip];
/** A bar across the upper back: hands by the shoulders, elbows down and back. */
const barOnBack: Partial<ArmAngles> = { shoulder_plane: -10, shoulder_elevation: 62, shoulder_rotation: 60, elbow_flexion: 135, forearm_pronation: 95 };
/** The load's place on a standing body, for lifts driven by the legs. */
const carried = (ex: TemplateExercise, pitch: number, reach = true): Partial<ArmAngles> => {
  if (/BARBELL|SMITH_MACHINE/.test(ex.equipment ?? "")) return barOnBack;
  if (ex.equipment === "NONE" || !ex.equipment) return reach ? { shoulder_plane: 90, shoulder_elevation: 80 + pitch, forearm_pronation: 170 } : hanging(pitch, 90);
  return hanging(pitch, 90);
};

const T: Record<string, (ex: TemplateExercise, prm: TemplateParams) => BuiltTemplate> = {
  squat(ex, prm) {
    const sumo = /sumo/i.test(ex.name);
    const st = sumo ? stanceOf({ ...prm, stance: "wide" }) : stanceOf(prm);
    const [pitch, hip, knee] = sumo ? [22, 100, 100] : ({ partial: [20, 70, 60], full: [35, 118, 105], deep: [38, 125, 125] } as const)[prm.range];
    const top = build(legs(st), arms(carried(ex, 0)));
    const bottom = build(lean(pitch), legs({ ...st, hip_flexion: hip, knee_flexion: knee }), arms(carried(ex, pitch)));
    return rep("squat", top, bottom, ["standing", "bottom"], prm);
  },
  split_squat(ex, prm) {
    const side = prm.side === "right" ? "right" : "left";
    const hold = carried(ex, 12, false);
    const set = (hip: number, knee: number, pitch: number, rearHip: number, rearKnee: number) =>
      build(freeFoot(other(side)), lean(pitch), leg(side, { hip_flexion: hip, knee_flexion: knee }), leg(other(side), { hip_flexion: rearHip, hip_abduction: 2, knee_flexion: rearKnee, ankle_dorsiflexion: -30 }), arms(hold));
    return rep("split_squat", set(45, 35, 18, -5, 75), set(112, 112, 28, -10, 100), ["top", "bottom"], prm, { unilateral: true });
  },
  lunge(ex, prm) {
    const side = prm.side === "right" ? "right" : "left";
    const hold = carried(ex, 5, false);
    const bottom = build(stepping, freeFoot(other(side)), lean(5), leg(side, { hip_flexion: 88, knee_flexion: 85 }), leg(other(side), { hip_flexion: -8, knee_flexion: 65, ankle_dorsiflexion: -40 }), arms(hold));
    return rep("lunge", build(stepping, legs(stanceOf({ ...prm, stance: "hip" })), arms(carried(ex, 0, false))), bottom, ["standing", "lunge"], prm, { moving: true });
  },
  deadlift(ex, prm) {
    const sumo = /sumo/i.test(ex.name);
    const st = sumo ? stanceOf({ ...prm, stance: "wide" }) : stanceOf({ ...prm, stance: "hip" });
    const pron = /DUMBBELL|KETTLEBELL/.test(ex.equipment ?? "") ? 90 : 170;
    const [pitch, hip, knee] = sumo ? [40, 100, 85] : [58, 115, 75];
    const floorRef = /BARBELL|SMITH_MACHINE/.test(ex.equipment ?? "") ? "bar_on_floor" : "mid_shin";
    const bottom = build(lean(pitch), legs({ ...st, hip_flexion: hip, knee_flexion: knee }), arms(hanging(pitch, pron)), goal({ point: "hands", ref: floorRef, by: "pelvis" }));
    return rep("deadlift", build(legs(st), arms(hanging(0, pron))), bottom, ["lockout", "bar down"], { ...prm, down_s: 1.5, up_s: 1.5 });
  },
  rack_pull(ex, prm) {
    const st = stanceOf({ ...prm, stance: "hip" });
    const pron = ex.equipment === "DUMBBELL" ? 90 : 170;
    const bottom = build(lean(42), legs({ ...st, hip_flexion: 62, knee_flexion: 25 }), arms(hanging(42, pron)), goal({ point: "hands", ref: "knee", by: "pelvis" }));
    return rep("rack_pull", build(legs(st), arms(hanging(0, pron))), bottom, ["lockout", "at the knees"], prm);
  },
  romanian_deadlift(ex, prm) {
    const st = stanceOf({ ...prm, stance: "hip" });
    const pron = /DUMBBELL|KETTLEBELL/.test(ex.equipment ?? "") ? 90 : 170;
    const [pitch, hip, knee] = ({ partial: [40, 52, 15], full: [62, 78, 20], deep: [72, 90, 22] } as const)[prm.range];
    return rep("romanian_deadlift", build(legs({ ...st, knee_flexion: 5 }), arms(hanging(0, pron))), build(lean(pitch), legs({ ...st, hip_flexion: hip, knee_flexion: knee }), arms(hanging(pitch, pron))), ["standing", "hinged"], prm);
  },
  good_morning(_ex, prm) {
    const st = stanceOf({ ...prm, stance: "hip" });
    return rep("good_morning", build(legs(st), arms(barOnBack)), build(lean(70), legs({ ...st, hip_flexion: 82, knee_flexion: 18 }), arms(barOnBack)), ["standing", "hinged"], prm);
  },
  pull_through(_ex, prm) {
    const st = stanceOf({ ...prm, stance: "shoulder" });
    return rep("pull_through", build(legs(st), arms(hanging(8, 90))), build(lean(60), legs({ ...st, hip_flexion: 82, knee_flexion: 28 }), arms({ shoulder_plane: 90, shoulder_elevation: 38, forearm_pronation: 90 })), ["standing", "hinged"], prm);
  },
  bent_row(ex, prm) {
    const uni = /unilateral/i.test(ex.name);
    const pitch = 62;
    const st = stanceOf({ ...prm, stance: "hip" });
    const body = [lean(pitch), legs({ ...st, hip_flexion: 82, knee_flexion: 22 })];
    const pron = palms(ex, ex.equipment === "DUMBBELL" ? 90 : 170);
    const work = uni ? (a: Partial<ArmAngles>) => arm("right", a) : arms;
    const rest = uni ? [arm("left", hanging(pitch, 90))] : [];
    return rep("bent_row", build(...body, ...rest, work(hanging(pitch, pron))), build(...body, ...rest, work({ shoulder_plane: -90, shoulder_elevation: 28, elbow_flexion: 100, forearm_pronation: pron, scapula_protraction: -15 })), ["arms long", "pulled"], prm, { unilateral: uni });
  },
  seated_row(ex, prm) {
    const uni = /unilateral/i.test(ex.name);
    const body = [support("seated", 0.5), legs({ hip_flexion: 80, knee_flexion: 30 })];
    const pron = ex.grip === "WIDE" ? 170 : palms(ex, 90);
    const work = uni ? (a: Partial<ArmAngles>) => arm("right", a) : arms;
    return rep("seated_row", build(...body, lean(10), work({ shoulder_plane: 90, shoulder_elevation: 85, forearm_pronation: pron, scapula_protraction: 12 })), build(...body, lean(-3), work({ shoulder_plane: -90, shoulder_elevation: 15, elbow_flexion: 100, forearm_pronation: pron, scapula_protraction: -15 })), ["arms long", "pulled"], prm, { unilateral: uni });
  },
  upright_row(ex, prm) {
    const pron = ex.equipment === "DUMBBELL" ? 170 : 170;
    return rep("upright_row", build(legs(stanceOf({ ...prm, stance: "hip" })), arms(hanging(0, pron))), build(legs(stanceOf({ ...prm, stance: "hip" })), arms({ shoulder_plane: 15, shoulder_elevation: 88, shoulder_rotation: -20, elbow_flexion: 125, forearm_pronation: pron, scapula_elevation: 8 })), ["arms down", "elbows high"], prm);
  },
  face_pull(_ex, prm) {
    const st = stanceOf({ ...prm, stance: "hip" });
    return rep("face_pull", build(legs(st), lean(-3), arms({ shoulder_plane: 85, shoulder_elevation: 88, forearm_pronation: 120, scapula_protraction: 10 })), build(legs(st), lean(-3), arms({ shoulder_plane: 5, shoulder_elevation: 88, shoulder_rotation: 70, elbow_flexion: 100, forearm_pronation: 90, scapula_protraction: -15 })), ["arms long", "at the face"], prm);
  },
  curl(ex, prm) {
    const pron = palms(ex, 0);
    const st = stanceOf({ ...prm, stance: "hip" });
    const top = (flex: number) => ({ shoulder_plane: 90, shoulder_elevation: flex, elbow_flexion: 135, forearm_pronation: pron });
    if (/cross-body/i.test(ex.name)) return rep("curl", build(legs(st), arms(hanging(0, 90))), build(legs(st), arms({ shoulder_plane: 110, shoulder_elevation: 15, elbow_flexion: 130, forearm_pronation: 90, shoulder_rotation: -35 })), ["arms down", "across"], prm);
    return rep("curl", build(legs(st), arms(hanging(0, pron))), build(legs(st), arms(top(12))), ["arms down", "curled"], prm);
  },
  curl_behind(_ex, prm) {
    const st = stanceOf({ ...prm, stance: "hip" });
    const start = { shoulder_plane: -90, shoulder_elevation: 22, forearm_pronation: 0 };
    return rep("curl_behind", build(lean(12), legs({ ...st, hip_flexion: 15 }), arms(start)), build(lean(12), legs({ ...st, hip_flexion: 15 }), arms({ ...start, elbow_flexion: 125 })), ["arms behind", "curled"], prm);
  },
  curl_overhead(_ex, prm) {
    const st = stanceOf({ ...prm, stance: "hip" });
    const up = { shoulder_plane: 20, shoulder_elevation: 95, forearm_pronation: 0 };
    return rep("curl_overhead", build(legs(st), arms(up)), build(legs(st), arms({ ...up, elbow_flexion: 125 })), ["arms long", "curled"], prm);
  },
  curl_concentration(_ex, prm) {
    const body = [support("seated", 0.48), feetDown, lean(38), legs({ hip_flexion: 95, hip_abduction: 18, hip_rotation: 15, knee_flexion: 90 })];
    const rest = arm("left", { shoulder_plane: 90, shoulder_elevation: 35, elbow_flexion: 30, forearm_pronation: 90 });
    const work = { shoulder_plane: 90, shoulder_elevation: 38, forearm_pronation: 0 };
    return rep("curl_concentration", build(...body, rest, arm("right", work)), build(...body, rest, arm("right", { ...work, elbow_flexion: 130 })), ["arm long", "curled"], prm, { unilateral: true });
  },
  curl_incline(ex, prm) {
    const body = [support("seated", 0.55), feetDown, lean(-35), legs({ hip_flexion: 60, knee_flexion: 85 })];
    const pron = palms(ex, 0);
    return rep("curl_incline", build(...body, arms({ shoulder_plane: -90, shoulder_elevation: 30, forearm_pronation: pron })), build(...body, arms({ shoulder_plane: -90, shoulder_elevation: 18, elbow_flexion: 130, forearm_pronation: pron })), ["arms long", "curled"], prm);
  },
  curl_preacher(_ex, prm) {
    const body = [support("seated", 0.6), feetDown, lean(12), legs({ hip_flexion: 85, knee_flexion: 85 })];
    const a = { shoulder_plane: 90, shoulder_elevation: 62, forearm_pronation: 0 };
    return rep("curl_preacher", build(...body, arms({ ...a, elbow_flexion: 15 })), build(...body, arms({ ...a, elbow_flexion: 125 })), ["arms long", "curled"], prm);
  },
  curl_machine(_ex, prm) {
    const body = [support("seated", 0.55), feetDown, legs({ hip_flexion: 88, knee_flexion: 88 })];
    const a = { shoulder_plane: 90, shoulder_elevation: 50, forearm_pronation: 0 };
    return rep("curl_machine", build(...body, arms({ ...a, elbow_flexion: 20 })), build(...body, arms({ ...a, elbow_flexion: 125 })), ["arms long", "curled"], prm);
  },
  curl_lying(_ex, prm) {
    const body = [support("supine", 0.14), lean(-90), feetDown, legs({ hip_flexion: 35, knee_flexion: 70 })];
    const a = { shoulder_plane: 90, shoulder_elevation: 120, forearm_pronation: 0 };
    return rep("curl_lying", build(...body, arms(a)), build(...body, arms({ ...a, elbow_flexion: 125 })), ["arms long", "curled"], prm);
  },
  leg_curl_seated(_ex, prm) {
    const body = [support("seated", 0.55), lean(-8), heelsFree];
    return rep("leg_curl_seated", build(...body, legs({ hip_flexion: 82, knee_flexion: 8 }), arms(hanging(0, 90))), build(...body, legs({ hip_flexion: 82, knee_flexion: 105 }), arms(hanging(0, 90))), ["legs long", "curled"], prm);
  },
  leg_curl_prone(_ex, prm) {
    const body = [support("prone", 0.75), lean(90), arms({ shoulder_plane: 90, shoulder_elevation: 145, elbow_flexion: 60, forearm_pronation: 170 })];
    return rep("leg_curl_prone", build(...body, legs({ knee_flexion: 5, ankle_dorsiflexion: 10 })), build(...body, legs({ knee_flexion: 115, ankle_dorsiflexion: 10 })), ["legs long", "curled"], prm);
  },
  nordic(_ex, prm) {
    const a = { shoulder_plane: 90, shoulder_elevation: 40, elbow_flexion: 100, forearm_pronation: 170 };
    return rep("nordic", build(support("kneeling"), onKnees, lean(0), legs({ knee_flexion: 90, ankle_dorsiflexion: -50 }), arms(a)), build(support("kneeling"), onKnees, lean(58), legs({ knee_flexion: 32, ankle_dorsiflexion: -50 }), arms({ ...a, shoulder_elevation: 80, elbow_flexion: 60 })), ["upright", "lowered"], prm);
  },
  press_overhead(ex, prm) {
    const seated = /machine/i.test(ex.name) && ex.equipment !== "SMITH_MACHINE";
    const body = seated ? [support("seated", 0.5), feetDown, legs({ hip_flexion: 88, knee_flexion: 88 })] : [legs(stanceOf({ ...prm, stance: "hip" }))];
    const start = { shoulder_plane: 20, shoulder_elevation: 85, shoulder_rotation: 70, elbow_flexion: 90, forearm_pronation: 90 };
    if (/arnold/i.test(ex.name)) return rep("press_overhead", build(...body, arms({ shoulder_plane: 85, shoulder_elevation: 25, elbow_flexion: 140, forearm_pronation: 0 })), build(...body, arms({ shoulder_plane: 10, shoulder_elevation: 172, elbow_flexion: 5, forearm_pronation: 0, scapula_elevation: 5 })), ["at the chest", "overhead"], prm);
    return rep("press_overhead", build(...body, arms(start)), build(...body, arms({ shoulder_plane: 10, shoulder_elevation: 172, elbow_flexion: 5, forearm_pronation: 0, scapula_elevation: 5 })), ["at the shoulders", "overhead"], prm);
  },
  bench_press(ex, prm) {
    const angle = ex.position === "INCLINE" ? -50 : ex.position === "DECLINE" ? -105 : -90;
    const body = [support("supine", 0.55), lean(angle), feetDown, legs({ hip_flexion: angle === -50 ? 42 : 12, knee_flexion: 88 })];
    const width = gripPlane(prm);
    const pron = /DUMBBELL/.test(ex.equipment ?? "") ? 170 : 170;
    return rep("bench_press", build(...body, arms({ shoulder_plane: 85, shoulder_elevation: 90, forearm_pronation: pron, scapula_protraction: 8 })), build(...body, arms({ shoulder_plane: width - 30, shoulder_elevation: 78, shoulder_rotation: 60, elbow_flexion: 95, forearm_pronation: pron, scapula_protraction: -12 })), ["arms up", "at the chest"], prm);
  },
  chest_press_machine(_ex, prm) {
    const body = [support("seated", 0.5), feetDown, legs({ hip_flexion: 88, knee_flexion: 88 })];
    return rep("chest_press_machine", build(...body, arms({ shoulder_plane: 40, shoulder_elevation: 80, shoulder_rotation: 60, elbow_flexion: 90, forearm_pronation: 170 })), build(...body, arms({ shoulder_plane: 85, shoulder_elevation: 85, elbow_flexion: 5, forearm_pronation: 170, scapula_protraction: 10 })), ["at the chest", "pressed"], prm);
  },
  leg_press(_ex, prm) {
    const body = [support("seated", 0.5), lean(-55), heelsFree];
    const [hip, knee] = ({ partial: [60, 60], full: [75, 90], deep: [85, 110] } as const)[prm.range];
    return rep("leg_press", build(...body, legs({ hip_flexion: 12, hip_abduction: 8, knee_flexion: 10 }), arms(hanging(0, 90))), build(...body, legs({ hip_flexion: hip, hip_abduction: 8, knee_flexion: knee }), arms(hanging(0, 90))), ["legs long", "knees in"], prm);
  },
  fly(ex, prm) {
    const a = { elbow_flexion: 20, forearm_pronation: 90 };
    if (ex.position === "SUPINE") {
      const body = [support("supine", 0.55), lean(-90), feetDown, legs({ hip_flexion: 12, knee_flexion: 88 })];
      return rep("fly", build(...body, arms({ ...a, shoulder_plane: 88, shoulder_elevation: 90 })), build(...body, arms({ ...a, shoulder_plane: 10, shoulder_elevation: 85 })), ["arms up", "open"], prm);
    }
    if (/machine/i.test(ex.name)) {
      const body = [support("seated", 0.5), feetDown, legs({ hip_flexion: 88, knee_flexion: 88 })];
      return rep("fly", build(...body, arms({ ...a, shoulder_plane: 10, shoulder_elevation: 88 })), build(...body, arms({ ...a, shoulder_plane: 88, shoulder_elevation: 88 })), ["open", "closed"], prm);
    }
    const st = stanceOf({ ...prm, stance: "hip" });
    const end = /low cable/i.test(ex.name) ? 115 : /high cable/i.test(ex.name) ? 50 : 75;
    const start = /low cable/i.test(ex.name) ? 60 : /high cable/i.test(ex.name) ? 110 : 90;
    const body = [lean(12), legs({ ...st, hip_flexion: 15, knee_flexion: 6 })];
    return rep("fly", build(...body, arms({ ...a, shoulder_plane: 5, shoulder_elevation: start })), build(...body, arms({ ...a, shoulder_plane: 88, shoulder_elevation: end })), ["open", "closed"], prm);
  },
  reverse_fly(ex, prm) {
    const a = { elbow_flexion: 15, forearm_pronation: 90 };
    if (ex.position === "FORWARD_TILT" && !/machine/i.test(ex.name)) {
      const pitch = 68;
      const body = [lean(pitch), legs({ ...stanceOf({ ...prm, stance: "hip" }), hip_flexion: 88, knee_flexion: 22 })];
      return rep("reverse_fly", build(...body, arms({ ...a, ...hanging(pitch, 90) })), build(...body, arms({ ...a, shoulder_plane: 8, shoulder_elevation: 88, scapula_protraction: -15 })), ["arms down", "open"], prm);
    }
    const body = /machine/i.test(ex.name) ? [support("seated", 0.5), lean(8), feetDown, legs({ hip_flexion: 92, knee_flexion: 88 })] : [legs(stanceOf({ ...prm, stance: "hip" }))];
    return rep("reverse_fly", build(...body, arms({ ...a, shoulder_plane: 85, shoulder_elevation: 88, scapula_protraction: 8 })), build(...body, arms({ ...a, shoulder_plane: -5, shoulder_elevation: 88, scapula_protraction: -15 })), ["arms forward", "open"], prm);
  },
  raise(ex, prm) {
    const st = stanceOf({ ...prm, stance: "hip" });
    const front = /front/i.test(ex.name);
    const pron = /reverse/i.test(ex.name) ? 0 : /hammer/i.test(ex.name) || !front ? 90 : 170;
    const plane = front ? 90 : 0;
    const top = ({ partial: 70, full: 90, deep: 110 } as const)[prm.range];
    return rep("raise", build(legs(st), arms({ shoulder_plane: plane, shoulder_elevation: 5, forearm_pronation: pron, elbow_flexion: 5 })), build(legs(st), arms({ shoulder_plane: plane, shoulder_elevation: top, forearm_pronation: pron, elbow_flexion: 8 })), ["arms down", "raised"], prm);
  },
  shrug(_ex, prm) {
    const st = stanceOf({ ...prm, stance: "hip" });
    return rep("shrug", build(legs(st), arms(hanging(0, 90))), build(legs(st), arms({ ...hanging(0, 90), scapula_elevation: 25 })), ["shoulders down", "shrugged"], prm);
  },
  pushdown(ex, prm) {
    const st = stanceOf({ ...prm, stance: "hip" });
    const pron = palms(ex, 170);
    const body = [lean(10), legs({ ...st, hip_flexion: 14, knee_flexion: 6 })];
    return rep("pushdown", build(...body, arms({ shoulder_plane: 90, shoulder_elevation: 12, elbow_flexion: 100, forearm_pronation: pron })), build(...body, arms({ shoulder_plane: 90, shoulder_elevation: 12, elbow_flexion: 5, forearm_pronation: pron })), ["elbows bent", "arms long"], prm);
  },
  triceps_overhead(ex, prm) {
    const st = stanceOf({ ...prm, stance: "hip" });
    const pron = ex.grip === "HAMMER" ? 90 : 170;
    const a = { shoulder_plane: 75, shoulder_elevation: 165, forearm_pronation: pron };
    return rep("triceps_overhead", build(legs(st), arms({ ...a, elbow_flexion: 5 })), build(legs(st), arms({ ...a, elbow_flexion: 130 })), ["arms up", "bent"], prm);
  },
  skull_crusher(ex, prm) {
    const body = [support("supine", 0.55), lean(-90), feetDown, legs({ hip_flexion: 12, knee_flexion: 88 })];
    const a = { shoulder_plane: 90, shoulder_elevation: 100, forearm_pronation: palms(ex, 170) };
    return rep("skull_crusher", build(...body, arms({ ...a, elbow_flexion: 5 })), build(...body, arms({ ...a, elbow_flexion: 115 })), ["arms up", "bent"], prm);
  },
  triceps_kickback(_ex, prm) {
    const pitch = 60;
    const body = [lean(pitch), legs({ ...stanceOf({ ...prm, stance: "hip" }), hip_flexion: 78, knee_flexion: 22 })];
    const a = { shoulder_plane: -90, shoulder_elevation: 20, forearm_pronation: 90 };
    return rep("triceps_kickback", build(...body, arms({ ...a, elbow_flexion: 95 })), build(...body, arms({ ...a, elbow_flexion: 5 })), ["elbows bent", "arms long"], prm);
  },
  triceps_machine(_ex, prm) {
    const body = [support("seated", 0.5), feetDown, legs({ hip_flexion: 88, knee_flexion: 88 })];
    const a = { shoulder_plane: 90, shoulder_elevation: 30, forearm_pronation: 90 };
    return rep("triceps_machine", build(...body, arms({ ...a, elbow_flexion: 100 })), build(...body, arms({ ...a, elbow_flexion: 8 })), ["elbows bent", "arms long"], prm);
  },
  leg_extension(_ex, prm) {
    const body = [support("seated", 0.55), lean(-8), heelsFree, arms(hanging(0, 90))];
    return rep("leg_extension", build(...body, legs({ hip_flexion: 82, knee_flexion: 90 })), build(...body, legs({ hip_flexion: 82, knee_flexion: 5 })), ["knees bent", "legs long"], prm);
  },
  glute_kickback(ex, prm) {
    const side = prm.side === "left" ? "left" : "right";
    const stand = other(side);
    const body = [freeFoot(side), lean(35), leg(stand, { hip_flexion: 42, knee_flexion: 15 }), arms(hanging(35, 90))];
    return rep("glute_kickback", build(...body, leg(side, { hip_flexion: 50, knee_flexion: 60 })), build(...body, leg(side, { hip_flexion: 28, knee_flexion: 15 })), ["knee in", "leg back"], prm, { unilateral: true });
  },
  back_extension(ex, prm) {
    const hold = ex.equipment === "NONE" ? { shoulder_plane: 90, shoulder_elevation: 40, elbow_flexion: 140, forearm_pronation: 170 } : hanging(70, 170);
    const body = [support("prone", 0.95), legs({})];
    return rep("back_extension", build(...body, lean(50), legs({ hip_flexion: 5 }), arms(hold)), build(...body, lean(120), legs({ hip_flexion: 75 }), arms(hold)), ["body in line", "hinged"], prm);
  },
  calf_raise(_ex, prm) {
    const st = stanceOf({ ...prm, stance: "hip" });
    const ankle = ({ partial: -20, full: -32, deep: -42 } as const)[prm.range];
    return rep("calf_raise", build(legs(st), arms(hanging(0, 90))), build(heelsFree, legs({ ...st, ankle_dorsiflexion: ankle }), arms(hanging(0, 90))), ["heels down", "heels up"], prm);
  },
  calf_raise_seated(_ex, prm) {
    const body = [support("seated", 0.55), heelsFree, onToes(0), arms({ shoulder_plane: 90, shoulder_elevation: 25, elbow_flexion: 70, forearm_pronation: 170 })];
    return rep("calf_raise_seated", build(...body, legs({ hip_flexion: 88, knee_flexion: 88, ankle_dorsiflexion: 5 })), build(...body, legs({ hip_flexion: 88, knee_flexion: 88, ankle_dorsiflexion: -32 })), ["heels down", "heels up"], prm);
  },
  calf_press(_ex, prm) {
    const body = [support("seated", 0.5), lean(-40), heelsFree, arms(hanging(0, 90))];
    return rep("calf_press", build(...body, legs({ hip_flexion: 45, knee_flexion: 8, ankle_dorsiflexion: 8 })), build(...body, legs({ hip_flexion: 45, knee_flexion: 8, ankle_dorsiflexion: -32 })), ["toes up", "toes pressed"], prm);
  },
  hip_abduction(_ex, prm) {
    const body = [support("seated", 0.62), lean(-5), heelsFree, arms(hanging(0, 90))];
    return rep("hip_abduction", build(...body, legs({ hip_flexion: 85, knee_flexion: 85, hip_abduction: 3 })), build(...body, legs({ hip_flexion: 85, knee_flexion: 85, hip_abduction: 38 })), ["knees together", "knees out"], prm);
  },
  hip_adduction(_ex, prm) {
    const body = [support("seated", 0.62), lean(-5), heelsFree, arms(hanging(0, 90))];
    return rep("hip_adduction", build(...body, legs({ hip_flexion: 85, knee_flexion: 85, hip_abduction: 38 })), build(...body, legs({ hip_flexion: 85, knee_flexion: 85, hip_abduction: 3 })), ["knees out", "knees together"], prm);
  },
  hip_thrust(_ex, prm) {
    const a = { shoulder_plane: 40, shoulder_elevation: 25, elbow_flexion: 40, forearm_pronation: 170 };
    const down = build(support("supine", 0.3), lean(-62), feetDown, legs({ hip_flexion: 62, hip_abduction: 6, knee_flexion: 105 }), arms(a));
    const up = build(support("supine", 0.55), lean(-90), feetDown, legs({ hip_flexion: 0, hip_abduction: 6, knee_flexion: 88 }), arms(a));
    return rep("hip_thrust", down, up, ["hips down", "hips up"], prm);
  },
  crunch(ex, prm) {
    const hands = { shoulder_plane: 40, shoulder_elevation: 130, elbow_flexion: 135, shoulder_rotation: 50, forearm_pronation: 90 };
    const body = [support("supine", 0.14), lean(-90), feetDown, legs({ hip_flexion: 40, knee_flexion: 85 })];
    if (/decline/i.test(ex.name)) return rep("crunch", build(support("supine", 0.6), lean(-75), legs({ hip_flexion: 30, knee_flexion: 70 }), arms(hands)), build(support("supine", 0.6), lean(-60), legs({ hip_flexion: 30, knee_flexion: 70 }), spine({ flexion: 30 }, { flexion: 18 }), arms(hands)), ["back", "curled"], prm);
    if (/reverse/i.test(ex.name)) {
      const b = [support("supine", 0.18), lean(-90), arms(hanging(0, 170))];
      return rep("crunch", build(...b, legs({ hip_flexion: 70, knee_flexion: 85 })), build(...b, spine({ flexion: 28 }), legs({ hip_flexion: 118, knee_flexion: 95 })), ["knees over the hips", "hips curled"], prm);
    }
    if (/bicycle|cross-body/i.test(ex.name)) {
      const side = (s: "left" | "right") => build(support("supine", 0.14), lean(-90), spine({ flexion: 22 }, { flexion: 15, twist: s === "left" ? 25 : -25 }), arms(hands), leg(s, { hip_flexion: 100, knee_flexion: 90 }), leg(other(s), { hip_flexion: 30, knee_flexion: 15 }));
      return loop("crunch", [side("left"), side("right")], ["twist left", "twist right"]);
    }
    if (/jackknife/i.test(ex.name)) {
      const b = [support("supine", 0.14), lean(-90)];
      return rep("crunch", build(...b, arms({ shoulder_plane: 90, shoulder_elevation: 165, forearm_pronation: 90 }), legs({ hip_flexion: 8 })), build(...b, spine({ flexion: 30 }, { flexion: 20 }), arms({ shoulder_plane: 90, shoulder_elevation: 100, forearm_pronation: 90 }), legs({ hip_flexion: 100, knee_flexion: 5 })), ["long", "folded"], prm);
    }
    if (/cable/i.test(ex.name)) {
      const a = { shoulder_plane: 85, shoulder_elevation: 145, elbow_flexion: 135, forearm_pronation: 90 };
      const b = [support("kneeling"), onKnees, legs({ knee_flexion: 90, hip_flexion: 12, ankle_dorsiflexion: -40 }), arms(a)];
      return rep("crunch", build(...b, lean(12)), build(...b, lean(22), spine({ flexion: 30 }, { flexion: 20 })), ["upright", "curled"], prm);
    }
    if (/machine/i.test(ex.name)) {
      const b = [support("seated", 0.5), feetDown, legs({ hip_flexion: 88, knee_flexion: 88 }), arms({ shoulder_plane: 85, shoulder_elevation: 120, elbow_flexion: 130, forearm_pronation: 90 })];
      return rep("crunch", build(...b), build(...b, lean(15), spine({ flexion: 30 }, { flexion: 20 })), ["upright", "curled"], prm);
    }
    if (/ab wheel/i.test(ex.name)) {
      const a = { shoulder_plane: 90, forearm_pronation: 170 };
      return rep("ab_wheel", build(support("kneeling"), onKnees, lean(35), legs({ knee_flexion: 117, hip_flexion: 62, ankle_dorsiflexion: -40 }), spine({ flexion: 15 }), arms({ ...a, shoulder_elevation: 90 })), build(support("kneeling"), onKnees, lean(72), legs({ knee_flexion: 23, hip_flexion: 5, ankle_dorsiflexion: -40 }), arms({ ...a, shoulder_elevation: 155 })), ["rolled in", "rolled out"], prm);
    }
    return rep("crunch", build(...body, arms(hands)), build(...body, spine({ flexion: 30 }, { flexion: 18 }), head({ pitch: 15 }), arms(hands)), ["back", "curled"], prm);
  },
  leg_raise(ex, prm) {
    const knees = /knee/i.test(ex.name);
    const up = knees ? { hip_flexion: 105, knee_flexion: 95 } : { hip_flexion: 85, knee_flexion: 5 };
    if (/hanging|captain/i.test(ex.name)) {
      const a = { shoulder_plane: 45, shoulder_elevation: 170, forearm_pronation: 170 };
      const body = [support("hanging", 1.4), goal({ point: "hands", ref: "shoulder", height_m: 0.75, by: "pelvis" }), arms(a)];
      const pose = (l: Partial<LegAngles>) => build(...body, legs(l));
      return rep("leg_raise_hanging", pose({ hip_flexion: 5, knee_flexion: 8 }), pose({ ...up, knee_flexion: Math.max(up.knee_flexion, 8) }), ["legs down", "raised"], prm);
    }
    const bench = ex.position === "BACKWARD_TILT";
    const body = [support("supine", bench ? 0.5 : 0.14), lean(-90), arms(hanging(0, 170))];
    return rep("leg_raise", build(...body, legs({ hip_flexion: 8, knee_flexion: knees ? 30 : 5 })), build(...body, legs(up)), ["legs long", "raised"], prm);
  },
  push_up(ex, prm) {
    const wide = /wide/i.test(ex.name) || prm.grip === "wide";
    const plane = wide ? 55 : 80;
    const handHeight = ex.position === "INCLINE" ? 0.45 : 0;
    const toes = ex.position === "DECLINE" ? 0.45 : 0;
    const hand = { forearm_pronation: 170, wrist_flexion: -60 };
    const shared = [support("prone", 0.4), onToes(toes), handsFlat, legs({ ankle_dorsiflexion: 30 })];
    const top = build(...shared, arms({ ...hand, shoulder_plane: plane, shoulder_elevation: 78 }), goal({ point: "hands", ref: "floor", height_m: handHeight, by: "pitch" }));
    const bottom = build(...shared, planted, arms({ ...hand, shoulder_plane: plane - 30, shoulder_elevation: 45, elbow_flexion: 90 }), goal({ point: "shoulders", height_m: handHeight + 0.2, by: "pitch" }));
    return rep("push_up", top, bottom, ["arms long", "chest down"], prm);
  },
  plank(_ex, prm) {
    const hold = (dip: number) =>
      build(support("prone", 0.3), onToes(0), legs({ ankle_dorsiflexion: 30 }), arms({ shoulder_plane: 85, shoulder_elevation: 80, elbow_flexion: 88, forearm_pronation: 120, wrist_flexion: 0 }), goal({ point: "shoulders", height_m: 0.34 - dip, by: "pitch" }));
    return rep("plank", hold(0), hold(0.01), ["hold", "hold"], prm);
  },
  mountain_climber() {
    const hand = { forearm_pronation: 170, wrist_flexion: -60, shoulder_plane: 80, shoulder_elevation: 78 };
    const side = (s: "left" | "right") => build(support("prone", 0.4), onToes(0), handsFlat, planted, goal({ point: "hands", ref: "floor", by: "pitch" }), arms(hand), legs({ ankle_dorsiflexion: 30 }), leg(s, { hip_flexion: 95, knee_flexion: 100, ankle_dorsiflexion: 20 }));
    return loop("mountain_climber", [side("left"), side("right")], ["left knee in", "right knee in"], { moving: true });
  },
  pull_up(ex, prm) {
    const width = prm.grip === "wide" || /wide/i.test(ex.name) ? 25 : 45;
    const pron = palms(ex, 170);
    const legsBent = legs({ hip_flexion: 12, knee_flexion: 45 });
    const hang = build(support("hanging", 1.3), legsBent, arms({ shoulder_plane: width, shoulder_elevation: 170, forearm_pronation: pron }), goal({ point: "hands", ref: "shoulder", height_m: 0.75, by: "pelvis" }));
    const top = build(support("hanging", 1.3), legsBent, planted, arms({ shoulder_plane: width, shoulder_elevation: 40, elbow_flexion: 130, forearm_pronation: pron, scapula_protraction: -15 }), goal({ point: "shoulders", ref: "shoulder", height_m: 0.58, by: "pelvis" }));
    return rep("pull_up", hang, top, ["hanging", "chin over the bar"], { ...prm, up_s: 1.5, down_s: 2 });
  },
  pulldown(ex, prm) {
    const body = [support("seated", 0.5), feetDown, legs({ hip_flexion: 88, knee_flexion: 88 })];
    const width = prm.grip === "wide" || /wide/i.test(ex.name) ? 25 : prm.grip === "narrow" ? 70 : 45;
    const pron = palms(ex, 170);
    return rep("pulldown", build(...body, lean(-5), arms({ shoulder_plane: width, shoulder_elevation: 165, forearm_pronation: pron })), build(...body, lean(-12), arms({ shoulder_plane: width, shoulder_elevation: 40, elbow_flexion: 125, forearm_pronation: pron, scapula_protraction: -12 })), ["arms up", "pulled"], prm);
  },
  straight_arm_pulldown(_ex, prm) {
    const body = [lean(25), legs({ ...stanceOf({ ...prm, stance: "hip" }), hip_flexion: 34, knee_flexion: 12 })];
    return rep("straight_arm_pulldown", build(...body, arms({ shoulder_plane: 85, shoulder_elevation: 130, elbow_flexion: 8, forearm_pronation: 170 })), build(...body, arms({ shoulder_plane: 85, shoulder_elevation: 28, elbow_flexion: 8, forearm_pronation: 170 })), ["arms up", "pulled down"], prm);
  },
  dip(ex, prm) {
    const pitch = /chest/i.test(ex.name) ? 25 : 8;
    const a = { forearm_pronation: 90 };
    const legsBent = legs({ hip_flexion: pitch + 30, knee_flexion: 95, ankle_dorsiflexion: -20 });
    const top = build(support("hanging", 1.15), lean(pitch), legsBent, arms({ ...a, ...hanging(pitch, 90) }), goal({ point: "hands", ref: "hip", height_m: 0.2, by: "pelvis" }));
    const bottom = build(support("hanging", 0.95), lean(pitch + 8), legsBent, planted, arms({ ...a, shoulder_plane: -90, shoulder_elevation: 40, elbow_flexion: 90 }), goal({ point: "shoulders", ref: "hip", height_m: 0.4, by: "pelvis" }));
    return rep("dip", top, bottom, ["arms long", "bottom"], prm);
  },
  bench_dip(_ex, prm) {
    const a = { shoulder_plane: -90, forearm_pronation: 90, wrist_flexion: -50 };
    const pose = (height: number, elevation: number, elbow: number, plant: boolean) => build(support("seated", height), feetDown, lean(5), legs({ hip_flexion: 70, knee_flexion: 40 }), arms({ ...a, shoulder_elevation: elevation, elbow_flexion: elbow }), ...(plant ? [planted] : []));
    return rep("bench_dip", pose(0.5, 22, 5, false), pose(0.3, 52, 90, true), ["arms long", "bottom"], prm);
  },
  twist_seated() {
    const hold = { shoulder_plane: 90, shoulder_elevation: 62, elbow_flexion: 70, forearm_pronation: 90 };
    const side = (t: number) => build(support("seated", 0.16), feetDown, lean(-38), legs({ hip_flexion: 92, knee_flexion: 125 }), spine({ twist: t * 0.2 }, { twist: t * 0.8 }), arms(hold));
    return loop("twist_seated", [side(35), side(-35)], ["turned left", "turned right"], { moving: true });
  },
  twist_standing(_ex, prm) {
    const st = stanceOf({ ...prm, stance: "shoulder" });
    const a = { shoulder_plane: 90, shoulder_elevation: 85, forearm_pronation: 90 };
    const side = (t: number) => build(legs(st), spine({ twist: t * 0.2 }, { twist: t * 0.8 }), arms(a));
    return loop("twist_standing", [side(35), side(-35)], ["turned left", "turned right"], { moving: true });
  },
  external_rotation(_ex, prm) {
    const st = stanceOf({ ...prm, stance: "hip" });
    const a = { shoulder_plane: 90, shoulder_elevation: 5, elbow_flexion: 90, forearm_pronation: 90 };
    return rep("external_rotation", build(legs(st), arm("left", hanging(0, 90)), arm("right", { ...a, shoulder_rotation: -40 })), build(legs(st), arm("left", hanging(0, 90)), arm("right", { ...a, shoulder_rotation: 50 })), ["hand in", "hand out"], prm, { unilateral: true });
  },
  high_knees() {
    const side = (s: "left" | "right") => build(stepping, leg(s, { hip_flexion: 95, knee_flexion: 100, ankle_dorsiflexion: -10 }), freeFoot(s), arm(s, { shoulder_plane: -90, shoulder_elevation: 25, elbow_flexion: 90, forearm_pronation: 90 }), arm(other(s), { shoulder_plane: 90, shoulder_elevation: 35, elbow_flexion: 90, forearm_pronation: 90 }));
    return loop("high_knees", [side("left"), side("right")], ["left knee up", "right knee up"], { moving: true });
  },
  jumping_jacks() {
    const closed = build(stepping, arms(hanging(0, 90)), legs({ hip_abduction: 2 }));
    const open = build(stepping, arms({ shoulder_plane: 5, shoulder_elevation: 165, forearm_pronation: 90 }), legs({ hip_abduction: 25, hip_rotation: 15 }));
    return { ...loop("jumping_jacks", [closed, open], ["closed", "open"]), airborne: true, moving: true };
  },
  jump_tuck(_ex, prm) {
    const crouch = build(lean(30), legs({ hip_flexion: 95, knee_flexion: 90 }), arms({ shoulder_plane: -90, shoulder_elevation: 25, elbow_flexion: 20, forearm_pronation: 90 }));
    const tuck = build(heelsFree, legs({ hip_flexion: 105, knee_flexion: 115 }), lean(5), arms({ shoulder_plane: 90, shoulder_elevation: 60, elbow_flexion: 60, forearm_pronation: 90 }));
    return rep("jump_tuck", crouch, tuck, ["crouch", "tuck"], prm, { airborne: true, moving: true });
  },
  gait(ex) {
    const run = /running/i.test(ex.name);
    const [hip, knee, elbow, swing] = run ? [55, 90, 90, 30] : [28, 22, 15, 18];
    const side = (s: "left" | "right") => build(stepping, lean(run ? 8 : 2), leg(s, { hip_flexion: hip, knee_flexion: knee, ankle_dorsiflexion: 5 }), leg(other(s), { hip_flexion: -8, knee_flexion: run ? 15 : 5 }), freeFoot(s), arm(s, { shoulder_plane: -90, shoulder_elevation: swing, elbow_flexion: elbow, forearm_pronation: 90 }), arm(other(s), { shoulder_plane: 90, shoulder_elevation: swing, elbow_flexion: elbow, forearm_pronation: 90 }));
    return loop("gait", [side("left"), side("right")], ["left leg forward", "right leg forward"], { moving: true });
  },
  cycling() {
    const hold = { shoulder_plane: 90, shoulder_elevation: 62, elbow_flexion: 15, forearm_pronation: 170 };
    const side = (s: "left" | "right") => build(support("seated", 1.0), lean(35), heelsFree, leg(s, { hip_flexion: 95, knee_flexion: 100 }), leg(other(s), { hip_flexion: 50, knee_flexion: 30 }), arms(hold));
    return loop("cycling", [side("left"), side("right")], ["left leg up", "right leg up"], { moving: true });
  },
  rowing_machine(_ex, prm) {
    const catchPose = build(support("seated", 0.48), lean(15), heelsFree, legs({ hip_flexion: 115, knee_flexion: 115 }), arms({ shoulder_plane: 88, shoulder_elevation: 75, forearm_pronation: 170 }));
    const finish = build(support("seated", 0.48), lean(-15), heelsFree, legs({ hip_flexion: 70, knee_flexion: 8 }), arms({ shoulder_plane: -90, shoulder_elevation: 18, elbow_flexion: 110, forearm_pronation: 170 }));
    return rep("rowing_machine", catchPose, finish, ["catch", "finish"], prm, { moving: true });
  },
  resting(_ex, prm) {
    const stand = build(legs(stanceOf({ ...prm, stance: "hip" })), arms(hanging(0, 90)));
    return rep("resting", stand, stand, ["standing", "standing"], prm);
  },
};

/** Which template an exercise uses, from what the catalog says about it. */
export function templateFor(ex: TemplateExercise): string {
  const n = ex.name.toLowerCase();
  const by = (re: RegExp) => re.test(n);
  switch (ex.movement) {
    case "SQUAT": return by(/bulgarian/) ? "split_squat" : "squat";
    case "LUNGE": return "lunge";
    case "DEADLIFT": return by(/romanian/) ? "romanian_deadlift" : by(/good morning/) ? "good_morning" : by(/rack pull/) ? "rack_pull" : by(/pull-through/) ? "pull_through" : "deadlift";
    case "ROW": return by(/upright/) ? "upright_row" : by(/face pull/) ? "face_pull" : by(/bent-over/) ? "bent_row" : "seated_row";
    case "CURL":
      if (by(/leg curl/)) return ex.position === "PRONE" ? "leg_curl_prone" : "leg_curl_seated";
      if (by(/nordic/)) return "nordic";
      if (by(/behind/)) return "curl_behind";
      if (by(/overhead/)) return "curl_overhead";
      if (by(/concentration/)) return "curl_concentration";
      if (by(/incline/)) return "curl_incline";
      if (by(/preacher/)) return "curl_preacher";
      if (by(/lying/)) return "curl_lying";
      if (by(/machine/)) return "curl_machine";
      return "curl";
    case "PRESS":
      if (by(/leg press/)) return "leg_press";
      if (by(/machine chest/)) return "chest_press_machine";
      return by(/shoulder|arnold/) ? "press_overhead" : "bench_press";
    case "FLY": return "fly";
    case "REVERSE_FLY": return "reverse_fly";
    case "RAISE": return "raise";
    case "SHRUG": return "shrug";
    case "PUSH-DOWN": return "pushdown";
    case "EXTENSION":
      if (by(/back extension/)) return "back_extension";
      if (by(/glute kickback/)) return "glute_kickback";
      if (by(/skull/)) return "skull_crusher";
      if (by(/leg extension/)) return "leg_extension";
      if (by(/kickback/)) return "triceps_kickback";
      if (by(/machine/)) return "triceps_machine";
      return "triceps_overhead";
    case "CALF RAISE": return by(/seated/) ? "calf_raise_seated" : by(/press/) ? "calf_press" : "calf_raise";
    case "ABDUCTION": return "hip_abduction";
    case "ADDUCTION": return "hip_adduction";
    case "HIP THRUST": return "hip_thrust";
    case "CRUNCH": return "crunch";
    case "LEG RAISE": return "leg_raise";
    case "PUSH-UP": return "push_up";
    case "HOLD": return "plank";
    case "PULL-UP": return "pull_up";
    case "PULL-DOWN": return by(/straight-arm/) ? "straight_arm_pulldown" : "pulldown";
    case "DIP": return by(/bench/) ? "bench_dip" : "dip";
    case "TWIST": return ex.position === "NEUTRAL" ? "twist_seated" : "twist_standing";
    case "ROTATION": return "external_rotation";
    case "CARDIO":
      if (by(/high knees/)) return "high_knees";
      if (by(/jumping jacks/)) return "jumping_jacks";
      if (by(/knee tuck/)) return "jump_tuck";
      if (by(/mountain climber/)) return "mountain_climber";
      if (by(/cycling/)) return "cycling";
      if (by(/rowing/)) return "rowing_machine";
      if (by(/resting/)) return "resting";
      return "gait";
    default: return "resting";
  }
}

export const TEMPLATE_IDS = Object.keys(T);

/** The key poses of an exercise for these parameters. Deterministic: same input, same clip. */
export function buildTemplate(ex: TemplateExercise, params: Partial<TemplateParams> = {}): BuiltTemplate {
  return T[templateFor(ex)](ex, { ...DEFAULT_PARAMS, ...params });
}
