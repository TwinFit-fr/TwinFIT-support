// Calibration of a rig to the anatomical position: one correction per bone, measured from its own joints and mesh.
import * as THREE from "three";
import type { Logical } from "./pose-bones.ts";
import { DOWN, Y, Z, arc, frameDelta, perpendicular, rad } from "./pose-math.ts";
import type { RestPose } from "./rest-pose.ts";

/**
 * Which way is front on a limb at rest. A bent elbow or knee says it (the joint hinges in that
 * plane), when the bend is large enough to be a bend and lies close to the avatar's front; a
 * straight limb takes that front. Closeness matters: an auto-rigger places joints inside the mesh
 * and its elbows "bend" 18° upwards with the arm straight, which is no hinge at all.
 */
function limbFront(axis: THREE.Vector3, next: THREE.Vector3, bendsForward: boolean): THREE.Vector3 {
  const front = perpendicular(Z, axis).normalize();
  const bend = perpendicular(next, axis).multiplyScalar(bendsForward ? 1 : -1);
  if (axis.angleTo(next) < rad(8) || bend.lengthSq() < 1e-8) return front;
  bend.normalize();
  return bend.dot(front) > 0.85 ? bend : front;
}

/**
 * The way the palm faces at rest, from the flat shape of the hand's own vertices: the thin axis
 * across the hand, signed by `hint`. Null when the mesh does not say (no vertices on the hand, a
 * mitten with no flat side).
 */
function restPalm(model: THREE.Object3D, hand: string, axis: THREE.Vector3, hint: THREE.Vector3): THREE.Vector3 | null {
  const e1 = perpendicular(Math.abs(axis.y) < 0.9 ? Y : Z, axis).normalize();
  const e2 = axis.clone().cross(e1);
  const points: [number, number][] = [];
  const v = new THREE.Vector3();
  model.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const index = mesh.skeleton.bones.findIndex((b) => b.name === hand);
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    if (index < 0 || !position || !skinIndex || !skinWeight) return;
    const turn = mesh.getWorldQuaternion(new THREE.Quaternion());
    for (let i = 0; i < position.count; i += 1) {
      for (let k = 0; k < 4; k += 1) {
        if (skinIndex.getComponent(i, k) === index && skinWeight.getComponent(i, k) > 0.5) {
          v.fromBufferAttribute(position, i).applyQuaternion(turn);
          points.push([v.dot(e1), v.dot(e2)]);
          break;
        }
      }
    }
  });
  if (points.length < 12) return null;
  const [mx, my] = points.reduce(([a, b], [x, y]) => [a + x / points.length, b + y / points.length], [0, 0]);
  let xx = 0, yy = 0, xy = 0;
  for (const [x, y] of points) {
    xx += (x - mx) ** 2;
    yy += (y - my) ** 2;
    xy += (x - mx) * (y - my);
  }
  const half = (xx + yy) / 2;
  const spread = Math.hypot((xx - yy) / 2, xy);
  if (half <= 0 || Math.sqrt(Math.max(half - spread, 0) / (half + spread)) > 0.75) return null;
  const wide = Math.atan2(2 * xy, xx - yy) / 2;
  const thin = e1.clone().multiplyScalar(-Math.sin(wide)).addScaledVector(e2, Math.cos(wide));
  return thin.dot(hint) < 0 ? thin.negate() : thin;
}

/**
 * The correction of each bone, from the rig's own joints: limb segments straight down, the front
 * of the arm and leg forward, palms forward, feet parallel, the spine upright. Measured from
 * directions and frames, never by subtracting angles: rotations do not commute, and a rig resting
 * with lowered arms and bent knees would come out crooked.
 */
export function calibrate(model: THREE.Object3D, rest: RestPose, names: Partial<Record<Logical, string>>): Map<string, THREE.Quaternion> {
  const correction = new Map<string, THREE.Quaternion>();
  const at = (logical: Logical) => (names[logical] ? rest.get(names[logical]!)?.worldPosition : undefined);
  const set = (logical: Logical, q: THREE.Quaternion) => {
    if (names[logical]) correction.set(names[logical]!, q);
  };
  const direction = (a: THREE.Vector3, b: THREE.Vector3) => b.clone().sub(a).normalize();

  for (const side of ["Left", "Right"] as const) {
    const shoulder = at(`${side}Arm`), elbow = at(`${side}ForeArm`), wrist = at(`${side}Hand`);
    if (shoulder && elbow && wrist) {
      const upper = direction(shoulder, elbow);
      const fore = direction(elbow, wrist);
      set(`${side}Arm`, frameDelta(upper, limbFront(upper, fore, true), DOWN, Z));
      // Rigs rest with the palms down (T, A); a rig resting with the arms down has them forward.
      const down = perpendicular(DOWN, fore);
      const palmHint = (down.lengthSq() > 0.1 ? down : perpendicular(Z, fore)).normalize();
      // The nudge forward only settles the sign of a palm the mesh shows edge-on to the floor.
      const palm = restPalm(model, names[`${side}Hand`]!, fore, palmHint.clone().addScaledVector(Z, 0.2)) ?? palmHint;
      const forearm = frameDelta(fore, palm, DOWN, Z);
      set(`${side}ForeArm`, forearm);
      set(`${side}Hand`, forearm.clone());
    }
    const hip = at(`${side}UpLeg`), knee = at(`${side}Leg`), ankle = at(`${side}Foot`);
    if (hip && knee && ankle) {
      const thigh = direction(hip, knee);
      const shank = direction(knee, ankle);
      const front = limbFront(thigh, shank, false);
      set(`${side}UpLeg`, frameDelta(thigh, front, DOWN, Z));
      set(`${side}Leg`, frameDelta(shank, perpendicular(front, shank).normalize(), DOWN, Z));
      // The sole already lies on the floor at rest: only the heading of the foot changes.
      const toe = at(`${side}ToeBase`);
      const heading = perpendicular(toe ? toe.clone().sub(ankle) : front, Y);
      const foot = heading.lengthSq() > 1e-8 ? arc(heading.normalize(), Z) : new THREE.Quaternion();
      set(`${side}Foot`, foot);
      set(`${side}ToeBase`, foot.clone());
    }
  }
  // The spine turns about its lowest bone, so that the neck ends up right above the pelvis. By
  // height, not by name: Meshy numbers its spine the other way up (Spine02 is the lowest).
  const pelvis = at("Hips");
  const spine = (["Spine", "Spine1", "Spine2"] as const).flatMap((l) => at(l) ?? []).sort((a, b) => a.y - b.y);
  const base = spine[0] ?? pelvis;
  const top = at("Neck") ?? spine[spine.length - 1];
  if (pelvis && base && top && base !== top) {
    const upright = arc(direction(base, top), direction(base, new THREE.Vector3(pelvis.x, top.y, pelvis.z)));
    for (const logical of ["Spine", "Spine1", "Spine2", "Neck", "LeftShoulder", "RightShoulder"] as const) set(logical, upright.clone());
  }
  return correction;
}
