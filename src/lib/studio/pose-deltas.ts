// Pose angles to bone rotations: how far each bone turns from the anatomical position, in the character frame.
import * as THREE from "three";
import { swingAxis, type ArmAngles, type LegAngles, type PoseAngles } from "./anatomy.ts";
import type { Logical } from "./pose-bones.ts";
import { mul, qx, qy, qz, rad } from "./pose-math.ts";
import type { Rig } from "./pose-types.ts";

/** How much of raising the arm the clavicle takes: about 6° at 120° of elevation (Ludewig 2009). */
export const CLAVICLE_RISE = 0.05;

/**
 * Rotation of every bone away from the anatomical position, in the character frame, each one
 * relative to its parent (s = +1 left side, -1 right side). All zeros gives identity everywhere.
 */
export function characterDeltas(p: PoseAngles, rig: Rig): Partial<Record<Logical, THREE.Quaternion>> {
  const arm = (a: ArmAngles, s: 1 | -1, shoulder: Logical) => {
    const axis = new THREE.Vector3(...swingAxis(a.shoulder_plane, s));
    // Plane and elevation are one swing of the arm, then the rotation about it: the ISB sequence
    // without its singularity at the anatomical position, where the plane simply stops mattering.
    const humerus = mul(new THREE.Quaternion().setFromAxisAngle(axis, rad(a.shoulder_elevation)), qy(s * a.shoulder_rotation));
    const girdle = mul(qz(s * (a.scapula_elevation + a.shoulder_elevation * CLAVICLE_RISE)), qy(-s * a.scapula_protraction));
    return {
      girdle,
      // The clavicle carries the arm, and the humerus keeps its direction against the thorax.
      upper: rig.names[shoulder] ? girdle.clone().invert().multiply(humerus) : humerus,
      fore: mul(qx(-a.elbow_flexion), qy(-s * a.forearm_pronation)),
      hand: mul(qx(-a.wrist_flexion), qz(s * a.wrist_deviation)),
    };
  };
  // Flexion first, abduction on the axis it leaves, rotation last (the ISB order for the hip):
  // abducting a flexed thigh moves the knee out instead of turning the shank.
  const leg = (l: LegAngles, s: 1 | -1) => ({
    upper: mul(qx(-l.hip_flexion), qz(s * l.hip_abduction), qy(s * l.hip_rotation)),
    lower: qx(l.knee_flexion),
    foot: mul(qx(-l.ankle_dorsiflexion), qz(-s * l.ankle_inversion)),
  });
  const la = arm(p.left_arm, 1, "LeftShoulder");
  const ra = arm(p.right_arm, -1, "RightShoulder");
  const ll = leg(p.left_leg, 1);
  const rl = leg(p.right_leg, -1);
  const segment = (a: PoseAngles["lumbar"], share: number) => mul(qx(a.flexion * share), qz(-a.lateral * share), qy(a.twist * share));
  const deltas: Partial<Record<Logical, THREE.Quaternion>> = {
    Hips: mul(qy(p.hips.yaw), qx(p.hips.pitch), qz(p.hips.roll)),
    Neck: mul(qx(p.head.pitch * 0.4), qy(p.head.yaw * 0.4), qz(-p.head.lateral * 0.4)),
    Head: mul(qx(p.head.pitch * 0.6), qy(p.head.yaw * 0.6), qz(-p.head.lateral * 0.6)),
    LeftShoulder: la.girdle,
    LeftArm: la.upper,
    LeftForeArm: la.fore,
    LeftHand: la.hand,
    RightShoulder: ra.girdle,
    RightArm: ra.upper,
    RightForeArm: ra.fore,
    RightHand: ra.hand,
    LeftUpLeg: ll.upper,
    LeftLeg: ll.lower,
    LeftFoot: ll.foot,
    RightUpLeg: rl.upper,
    RightLeg: rl.lower,
    RightFoot: rl.foot,
  };
  // The lowest spine bone is the lumbar spine, the rest share the thoracic: by height, not by
  // name (Meshy numbers them the other way up). A short spine does all of it in what it has.
  const spine = rig.spine;
  if (spine.length === 1) deltas[spine[0]] = mul(segment(p.lumbar, 1), segment(p.thoracic, 1));
  else spine.forEach((logical, i) => (deltas[logical] = i === 0 ? segment(p.lumbar, 1) : segment(p.thoracic, 1 / (spine.length - 1))));
  return deltas;
}
