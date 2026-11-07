import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { NEUTRAL_POSE, poseClipFromDraft, posesFromClip, setPoseValue, upgradePoseClip, type PoseAngles, type PoseClipJson } from "./anatomy.ts";
import { buildMannequin } from "./mannequin.ts";
import { buildPoseClip, captureRestPose, solveWorld, type RestPose } from "./pose-clip.ts";

type Joint = { name: string; parent: string | null; at: [number, number, number] };

/**
 * A rig with everything that made the Meshy avatar come out crooked: centimetres under an Armature
 * scaled 0.01, each bone's own Y along the bone, arms 17° below the horizontal and a little
 * forward, knees bent at rest, feet turned out, the trunk leaning back, a hand whose palm is
 * turned 30° from facing down, a spine numbered upside down (Spine2 lowest, as Meshy does) and an
 * elbow that "bends" upwards: a joint misplaced by the auto-rigger, not a hinge. Positions in metres.
 */
function crookedRig(): { model: THREE.Object3D; palms: Record<"Left" | "Right", THREE.Vector3> } {
  const joints: Joint[] = [
    { name: "Hips", parent: null, at: [0, 0.95, 0] },
    { name: "Spine2", parent: "Hips", at: [0, 1.07, -0.01] },
    { name: "Spine1", parent: "Spine2", at: [0, 1.19, -0.02] },
    { name: "Spine", parent: "Spine1", at: [0, 1.31, -0.03] },
    { name: "Neck", parent: "Spine", at: [0, 1.46, -0.045] },
    { name: "Head", parent: "Neck", at: [0, 1.55, -0.05] },
  ];
  for (const [side, s] of [["Left", 1], ["Right", -1]] as const) {
    const arm = (len: number, down: number, fwd: number) => [s * len * Math.cos(down), -len * Math.sin(down), fwd] as const;
    const sh: [number, number, number] = [s * 0.18, 1.42, -0.04];
    const up = arm(0.28, THREE.MathUtils.degToRad(17), 0.0);
    const el: [number, number, number] = [sh[0] + up[0], sh[1] + up[1], sh[2] + up[2]];
    const fo = arm(0.26, 0, 0.03); // straight on, so the "bend" points up
    const wr: [number, number, number] = [el[0] + fo[0], el[1] + fo[1], el[2] + fo[2]];
    joints.push(
      { name: `${side}Arm`, parent: "Spine", at: sh },
      { name: `${side}ForeArm`, parent: `${side}Arm`, at: el },
      { name: `${side}Hand`, parent: `${side}ForeArm`, at: wr },
      { name: `${side}UpLeg`, parent: "Hips", at: [s * 0.09, 0.87, 0] },
      { name: `${side}Leg`, parent: `${side}UpLeg`, at: [s * 0.11, 0.49, 0.06] }, // knee forward: bent
      { name: `${side}Foot`, parent: `${side}Leg`, at: [s * 0.12, 0.09, -0.02] },
      { name: `${side}ToeBase`, parent: `${side}Foot`, at: [s * 0.12 + s * 0.035, 0.03, 0.13] }, // turned out
    );
  }
  const byName = new Map(joints.map((j) => [j.name, j]));
  const childOf = (name: string) => joints.find((j) => j.parent === name);
  const world = (j: Joint) => {
    const child = childOf(j.name);
    const to = child ? new THREE.Vector3(...child.at) : new THREE.Vector3(...j.at).sub(new THREE.Vector3(...byName.get(j.parent!)!.at)).add(new THREE.Vector3(...j.at));
    const axis = to.sub(new THREE.Vector3(...j.at)).normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  };
  const root = new THREE.Group();
  const armature = new THREE.Group();
  armature.name = "Armature";
  armature.scale.setScalar(0.01);
  root.add(armature);
  const bones = new Map<string, THREE.Bone>();
  for (const j of joints) {
    const bone = new THREE.Bone();
    bone.name = j.name;
    const q = world(j);
    if (j.parent) {
      const parent = byName.get(j.parent)!;
      const pq = world(parent);
      bone.position.set(...j.at).sub(new THREE.Vector3(...parent.at)).applyQuaternion(pq.clone().invert()).multiplyScalar(100);
      bone.quaternion.copy(pq.clone().invert().multiply(q));
      bones.get(j.parent)!.add(bone);
    } else {
      bone.position.set(...j.at).multiplyScalar(100);
      bone.quaternion.copy(q);
      armature.add(bone);
    }
    bones.set(j.name, bone);
  }
  // Two flat hands: wide across, thin along the palm's normal, in the mesh's own (bind) space.
  const positions: number[] = [];
  const index: number[] = [];
  const weight: number[] = [];
  const skeletonBones = [...bones.values()];
  const palms = {} as Record<"Left" | "Right", THREE.Vector3>;
  for (const side of ["Left", "Right"] as const) {
    const wrist = new THREE.Vector3(...byName.get(`${side}Hand`)!.at);
    const fore = wrist.clone().sub(new THREE.Vector3(...byName.get(`${side}ForeArm`)!.at)).normalize();
    const down = new THREE.Vector3(0, -1, 0).addScaledVector(fore, fore.y).normalize();
    const palm = down.clone().applyAxisAngle(fore, THREE.MathUtils.degToRad(30));
    palms[side] = palm;
    const across = fore.clone().cross(palm).normalize();
    const bone = skeletonBones.indexOf(bones.get(`${side}Hand`)!);
    for (let i = 0; i < 40; i += 1) {
      const p = wrist.clone()
        .addScaledVector(fore, 0.02 + (i % 8) * 0.02)
        .addScaledVector(across, ((Math.floor(i / 8) % 5) - 2) * 0.02)
        .addScaledVector(palm, (i % 2 ? 1 : -1) * 0.006)
        .multiplyScalar(100);
      positions.push(p.x, p.y, p.z);
      index.push(bone, 0, 0, 0);
      weight.push(1, 0, 0, 0);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(index, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weight, 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
  armature.add(mesh);
  root.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(skeletonBones));
  return { model: root, palms };
}

function mannequin(): THREE.Object3D {
  const root = new THREE.Group();
  root.add(buildMannequin(1.75));
  root.updateMatrixWorld(true);
  return root;
}

type Solved = ReturnType<typeof solveWorld>;
const CTX = { twoHanded: false, grip: null, sockets: [] };

/** Both rigs, with what the checks need: a solver and the palm's rest direction per side. */
function rigs() {
  const crooked = crookedRig();
  const plain = mannequin();
  const entry = (name: string, model: THREE.Object3D, palms: Record<"Left" | "Right", THREE.Vector3>) => {
    const rest: RestPose = captureRestPose(model);
    return { name, rest, model, palms, solve: (pose: PoseAngles): Solved => solveWorld(model, rest, pose, CTX) };
  };
  const down = new THREE.Vector3(0, -1, 0);
  return [entry("mannequin (T-pose)", plain, { Left: down, Right: down }), entry("crooked rig (Meshy-like)", crooked.model, crooked.palms)];
}

const dir = (s: Solved, a: keyof Solved, b: keyof Solved) => s[b]!.position.clone().sub(s[a]!.position).normalize();
const deg = (a: THREE.Vector3, b: THREE.Vector3) => THREE.MathUtils.radToDeg(a.angleTo(b));
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize();
const near = (a: THREE.Vector3, b: THREE.Vector3, what: string, tolerance = 1) => assert.ok(deg(a, b) < tolerance, `${what}: ${deg(a, b).toFixed(2)}° off (${a.toArray().map((n) => n.toFixed(3))})`);
const pose = (...edits: [string, number][]) => edits.reduce((p, [path, v]) => setPoseValue(p, path, v), NEUTRAL_POSE);
const SIDES = [["Left", "left", 1], ["Right", "right", -1]] as const;

/** The way the palm faces in a solved pose: its rest direction carried by the hand bone. */
function palmOf(r: ReturnType<typeof rigs>[number], s: Solved, side: "Left" | "Right") {
  const name = r.model.getObjectByProperty("isBone", true) ? [...r.rest.keys()].find((n) => n.endsWith(`${side}Hand`))! : "";
  const rest = r.rest.get(name)!.world;
  return r.palms[side].clone().applyQuaternion(rest.clone().invert()).applyQuaternion(s[`${side}Hand`]!.quaternion);
}

describe("the anatomical position", () => {
  for (const r of rigs()) {
    it(`all zeros is the anatomical position on the ${r.name}`, () => {
      const s = r.solve(NEUTRAL_POSE);
      for (const [S] of SIDES) {
        near(dir(s, `${S}Arm`, `${S}ForeArm`), V(0, -1, 0), `${S} upper arm`);
        near(dir(s, `${S}ForeArm`, `${S}Hand`), V(0, -1, 0), `${S} forearm`);
        near(palmOf(r, s, S), V(0, 0, 1), `${S} palm`);
        near(dir(s, `${S}UpLeg`, `${S}Leg`), V(0, -1, 0), `${S} thigh`);
        near(dir(s, `${S}Leg`, `${S}Foot`), V(0, -1, 0), `${S} shank`);
        near(new THREE.Vector3(0, 1, 0).applyQuaternion(s[`${S}Foot`]!.quaternion.clone().multiply(r.rest.get([...r.rest.keys()].find((n) => n.endsWith(`${S}Foot`))!)!.world.clone().invert())), V(0, 1, 0), `${S} sole`);
      }
      near(dir(s, "Hips", "Neck"), V(0, 1, 0), "trunk");
    });
  }
});

describe("pure motions go where their name says, on both sides", () => {
  for (const r of rigs()) {
    for (const [S, side, x] of SIDES) {
      const arm = `${side}_arm`;
      const leg = `${side}_leg`;
      it(`${S} arm on the ${r.name}`, () => {
        near(dir(r.solve(pose([`${arm}.shoulder_flexion`, 90])), `${S}Arm`, `${S}ForeArm`), V(0, 0, 1), "flexion 90");
        near(dir(r.solve(pose([`${arm}.shoulder_flexion`, 180])), `${S}Arm`, `${S}ForeArm`), V(0, 1, 0), "flexion 180");
        near(dir(r.solve(pose([`${arm}.shoulder_flexion`, -45])), `${S}Arm`, `${S}ForeArm`), V(0, -1, -1), "extension 45");
        near(dir(r.solve(pose([`${arm}.shoulder_abduction`, 90])), `${S}Arm`, `${S}ForeArm`), V(x, 0, 0), "abduction 90");
        near(dir(r.solve(pose([`${arm}.shoulder_abduction`, 180])), `${S}Arm`, `${S}ForeArm`), V(0, 1, 0), "abduction 180");
        near(dir(r.solve(pose([`${arm}.elbow_flexion`, 90])), `${S}ForeArm`, `${S}Hand`), V(0, 0, 1), "elbow 90");
        const external = r.solve(pose([`${arm}.shoulder_rotation`, 90], [`${arm}.elbow_flexion`, 90]));
        near(dir(external, `${S}Arm`, `${S}ForeArm`), V(0, -1, 0), "external rotation leaves the humerus alone");
        near(dir(external, `${S}ForeArm`, `${S}Hand`), V(x, 0, 0), "external rotation swings the forearm out");
        near(palmOf(r, r.solve(pose([`${arm}.forearm_pronation`, 90])), S), V(-x, 0, 0), "pronation 90: palm to the body");
        near(dir(r.solve(pose([`${arm}.forearm_pronation`, 90])), `${S}ForeArm`, `${S}Hand`), V(0, -1, 0), "pronation leaves the forearm's direction");
      });
      it(`${S} leg on the ${r.name}`, () => {
        // Hip and knee on one leg, the other carries the body.
        near(dir(r.solve(pose([`${leg}.hip_flexion`, 90])), `${S}UpLeg`, `${S}Leg`), V(0, 0, 1), "hip flexion 90");
        near(dir(r.solve(pose([`${leg}.hip_abduction`, 45])), `${S}UpLeg`, `${S}Leg`), V(x, -1, 0), "hip abduction 45");
        near(dir(r.solve(pose([`${leg}.knee_flexion`, 90])), `${S}Leg`, `${S}Foot`), V(0, 0, -1), "knee 90");
        const turned = r.solve(pose([`${leg}.hip_flexion`, 90], [`${leg}.knee_flexion`, 90], [`${leg}.hip_rotation`, 30]));
        near(dir(turned, `${S}UpLeg`, `${S}Leg`), V(0, 0, 1), "hip rotation leaves the femur");
        near(dir(turned, `${S}Leg`, `${S}Foot`), V(-x * Math.sin(Math.PI / 6), -Math.cos(Math.PI / 6), 0), "external rotation swings the shank in");
        // Abducting a flexed thigh moves the knee out (it used to turn the shank instead).
        const wide = dir(r.solve(pose([`${leg}.hip_flexion`, 90], [`${leg}.hip_abduction`, 20])), `${S}UpLeg`, `${S}Leg`);
        assert.ok(wide.x * x > 0.3, `knee goes out: ${wide.x}`);
      });
    }
    it(`hips.roll raises the left hip on the ${r.name}`, () => {
      const s = solveWorld(r.model, r.rest, { ...NEUTRAL_POSE, orientation: "seated", hips: { ...NEUTRAL_POSE.hips, roll: 20 } }, CTX);
      assert.ok(s.LeftUpLeg!.position.y > s.RightUpLeg!.position.y);
    });
  }
});

describe("standing on the feet", () => {
  const squat = (p: PoseAngles, pitch: number, hip: number, knee: number) => {
    let q = setPoseValue(p, "hips.pitch", pitch);
    for (const side of ["left", "right"]) q = setPoseValue(setPoseValue(q, `${side}_leg.hip_flexion`, hip), `${side}_leg.knee_flexion`, knee);
    return q;
  };
  /** Sole flatness and distance of each ankle from where the anatomical position keeps it. */
  const feet = (r: ReturnType<typeof rigs>[number], s: Solved) => {
    const home = r.solve(NEUTRAL_POSE);
    return SIDES.map(([S]) => {
      const name = [...r.rest.keys()].find((n) => n.endsWith(`${S}Foot`))!;
      const rest = r.rest.get(name)!;
      return {
        tilt: deg(new THREE.Vector3(0, 1, 0).applyQuaternion(s[`${S}Foot`]!.quaternion.clone().multiply(rest.world.clone().invert())), V(0, 1, 0)),
        slide: s[`${S}Foot`]!.position.distanceTo(home[`${S}Foot`]!.position),
        height: s[`${S}Foot`]!.position.y - rest.worldPosition.y,
      };
    });
  };

  for (const r of rigs()) {
    it(`a squat, a deadlift and a hinge keep the soles down on the ${r.name}`, () => {
      for (const [pitch, hip, knee] of [[35, 125, 110], [55, 120, 70], [60, 75, 20], [20, 40, 10]]) {
        const s = r.solve(squat(NEUTRAL_POSE, pitch, hip, knee));
        for (const f of feet(r, s)) {
          assert.ok(f.tilt < 0.5, `sole tilted ${f.tilt.toFixed(1)}° at ${pitch}/${hip}/${knee}`);
          assert.ok(Math.abs(f.height) < 0.002, `ankle ${f.height.toFixed(3)} m off the floor height`);
          assert.ok(f.slide < 0.002, `foot slid ${f.slide.toFixed(3)} m`);
        }
      }
    });

    it(`the legs place the pelvis: a hinge sends it back on the ${r.name}`, () => {
      const stand = r.solve(NEUTRAL_POSE);
      const hinge = r.solve(squat(NEUTRAL_POSE, 60, 75, 20));
      // The hip joints, not the Hips bone: it sits above them and goes forward as the pelvis tilts.
      assert.ok(hinge.LeftUpLeg!.position.z < stand.LeftUpLeg!.position.z - 0.05);
      assert.ok(hinge.LeftUpLeg!.position.y < stand.LeftUpLeg!.position.y);
    });

    it(`moving the pelvis by hand leaves the feet where they are on the ${r.name}`, () => {
      const base = squat(NEUTRAL_POSE, 20, 60, 60);
      const free = r.solve(base);
      const moved = r.solve(setPoseValue(base, "hips.forward_m", -0.08));
      assert.ok(Math.abs(moved.Hips!.position.z - (free.Hips!.position.z - 0.08)) < 0.02, "pelvis went back");
      for (const f of feet(r, moved)) assert.ok(f.slide < 0.01 && f.tilt < 0.5, `feet held: ${f.slide.toFixed(3)} m, ${f.tilt.toFixed(1)}°`);
      const lower = r.solve(setPoseValue(base, "hips.height_m", free.Hips!.position.y - 0.1));
      assert.ok(Math.abs(lower.Hips!.position.y - (free.Hips!.position.y - 0.1)) < 0.02, "pelvis went down");
      for (const f of feet(r, lower)) assert.ok(f.slide < 0.01, `feet held: ${f.slide.toFixed(3)} m`);
    });

    it(`a raised leg keeps its own ankle and the other foot carries the body on the ${r.name}`, () => {
      const s = r.solve(pose(["left_leg.hip_flexion", 90], ["left_leg.knee_flexion", 90], ["left_leg.ankle_dorsiflexion", -30]));
      const [left, right] = feet(r, s);
      assert.ok(left.tilt > 25, `raised foot pointed: ${left.tilt.toFixed(1)}°`);
      assert.ok(right.tilt < 0.5 && Math.abs(right.height) < 0.002 && right.slide < 0.002, "the standing foot stays");
    });

    it(`heels up keeps the toes on the floor on the ${r.name}`, () => {
      const up: PoseAngles = { ...pose(["left_leg.ankle_dorsiflexion", -30], ["right_leg.ankle_dorsiflexion", -30]), feet_flat: false };
      const flat = r.solve(NEUTRAL_POSE);
      const s = r.solve(up);
      assert.ok(s.Hips!.position.y > flat.Hips!.position.y + 0.02, "the body rises");
    });

    it(`between keyframes the feet stay down on the ${r.name}`, () => {
      const low = squat(NEUTRAL_POSE, 35, 125, 110);
      const clip = buildPoseClip(r.model, poseClipFromDraft({ poses: [NEUTRAL_POSE, low], mode: "pingpong", durationS: 2, fps: 30, twoHanded: false, grip: null, meta: {} }), r.rest);
      const mixer = new THREE.AnimationMixer(r.model);
      mixer.clipAction(clip).play();
      const footName = [...r.rest.keys()].find((n) => n.endsWith("LeftFoot"))!;
      const foot = r.model.getObjectByName(footName)!;
      const heights: number[] = [];
      const start = new THREE.Vector3();
      let slide = 0;
      for (let t = 0; t <= 2; t += 0.05) {
        mixer.setTime(t);
        r.model.updateMatrixWorld(true);
        const p = foot.getWorldPosition(new THREE.Vector3());
        if (t === 0) start.copy(p);
        heights.push(p.y);
        slide = Math.max(slide, Math.hypot(p.x - start.x, p.z - start.z));
      }
      mixer.stopAllAction();
      mixer.uncacheRoot(r.model);
      assert.ok(Math.max(...heights) - Math.min(...heights) < 0.004, `ankle moved ${(Math.max(...heights) - Math.min(...heights)).toFixed(3)} m`);
      assert.ok(slide < 0.004, `foot slid ${slide.toFixed(3)} m`);
    });
  }
});

describe("a stance through a clip", () => {
  const STANCE = { hip_abduction: 8, hip_rotation: 10 };
  const legs = (p: PoseAngles, kv: Record<string, number>) => {
    for (const side of ["left", "right"]) for (const [k, v] of Object.entries(kv)) p = setPoseValue(p, `${side}_leg.${k}`, v);
    return p;
  };
  const top = legs(NEUTRAL_POSE, STANCE);
  const bottom = legs(setPoseValue(NEUTRAL_POSE, "hips.pitch", 35), { ...STANCE, hip_flexion: 125, knee_flexion: 110 });

  for (const r of rigs()) {
    it(`a wide squat keeps both feet planted, keys and frames, on the ${r.name}`, () => {
      const clip = buildPoseClip(r.model, poseClipFromDraft({ poses: [top, bottom], mode: "pingpong", durationS: 2, fps: 30, twoHanded: false, grip: null, meta: {} }), r.rest);
      const mixer = new THREE.AnimationMixer(r.model);
      mixer.clipAction(clip).play();
      for (const S of ["Left", "Right"]) {
        const foot = r.model.getObjectByName([...r.rest.keys()].find((n) => n.endsWith(`${S}Foot`))!)!;
        let start: THREE.Vector3 | null = null;
        let worst = 0;
        for (let t = 0; t <= 2; t += 0.05) {
          mixer.setTime(t);
          r.model.updateMatrixWorld(true);
          const p = foot.getWorldPosition(new THREE.Vector3());
          start ??= p.clone();
          worst = Math.max(worst, p.distanceTo(start));
        }
        assert.ok(worst < 0.02, `${S} foot moved ${worst.toFixed(3)} m through the rep`);
      }
      mixer.stopAllAction();
      mixer.uncacheRoot(r.model);
    });

    it(`a foot that really steps is let go on the ${r.name}`, () => {
      const lunge = setPoseValue(setPoseValue(NEUTRAL_POSE, "left_leg.hip_flexion", 70), "left_leg.knee_flexion", 70);
      const ctx = { ...CTX, stance: NEUTRAL_POSE };
      const s = solveWorld(r.model, r.rest, lunge, ctx);
      const free = r.solve(lunge);
      assert.ok(s.LeftFoot!.position.distanceTo(free.LeftFoot!.position) < 0.01);
    });
  }
});

describe("the prompt's worked examples", () => {
  const both = (p: PoseAngles, limb: "arm" | "leg", kv: Record<string, number>) => {
    for (const side of ["left", "right"]) for (const [k, v] of Object.entries(kv)) p = setPoseValue(p, `${side}_${limb}.${k}`, v);
    return p;
  };
  const hips = (o: Partial<PoseAngles["hips"]>, orientation: PoseAngles["orientation"] = "standing"): PoseAngles => ({ ...NEUTRAL_POSE, orientation, hips: { ...NEUTRAL_POSE.hips, ...o } });

  for (const r of rigs()) {
    it(`come out as they say on the ${r.name}`, () => {
      const press = r.solve(both(NEUTRAL_POSE, "arm", { shoulder_abduction: 80, shoulder_flexion: 20, shoulder_rotation: 90, elbow_flexion: 110, forearm_pronation: 90 }));
      near(dir(press, "LeftForeArm", "LeftHand"), V(0, 1, 0), "press: forearm vertical", 15);
      near(palmOf(r, press, "Left"), V(0, 0, 1), "press: palm forward", 25);
      near(palmOf(r, r.solve(both(NEUTRAL_POSE, "arm", { shoulder_flexion: 90, forearm_pronation: 170 })), "Left"), V(0, -1, 0), "front raise: palm down", 12);
      near(palmOf(r, r.solve(both(NEUTRAL_POSE, "arm", { shoulder_abduction: 90, forearm_pronation: 90 })), "Left"), V(0, -1, 0), "lateral raise: palm down");

      const squat = r.solve(both(hips({ pitch: 35 }), "leg", { hip_flexion: 125, knee_flexion: 110 }));
      near(dir(squat, "LeftUpLeg", "LeftLeg"), V(0, 0, 1), "squat: thigh parallel to the floor", 2);

      const rdl = r.solve(both(both(hips({ pitch: 60 }), "leg", { hip_flexion: 75, knee_flexion: 20 }), "arm", { shoulder_flexion: 60 }));
      near(dir(rdl, "LeftArm", "LeftForeArm"), V(0, -1, 0), "RDL: arms hang vertical", 2);

      const plank = r.solve(both({ ...hips({ pitch: 70, height_m: 0.4 }, "prone") }, "arm", { shoulder_flexion: 70 }));
      near(dir(plank, "LeftArm", "LeftForeArm"), V(0, -1, 0), "plank: arms vertical", 2);
      assert.ok(Math.abs(plank.LeftHand!.position.y) < 0.12, `plank: hands near the floor (${plank.LeftHand!.position.y.toFixed(2)})`);
      assert.ok(Math.abs(plank.LeftFoot!.position.y) < 0.2, `plank: feet near the floor (${plank.LeftFoot!.position.y.toFixed(2)})`);

      const bench = r.solve(both(both(hips({ pitch: -90, height_m: 0.55 }, "supine"), "leg", { knee_flexion: 90 }), "arm", { shoulder_flexion: 90 }));
      near(dir(bench, "LeftArm", "LeftForeArm"), V(0, 1, 0), "bench: arms up", 2);
      assert.ok(bench.LeftFoot!.position.y < 0.2, `bench: feet on the floor (${bench.LeftFoot!.position.y.toFixed(2)})`);
    });
  }
});

describe("a bar in both hands", () => {
  for (const r of rigs()) {
    it(`pronated, the hands reach the bar and the palms face back on the ${r.name}`, () => {
      const p: PoseAngles = { ...NEUTRAL_POSE, implement: { height_m: 1.0, forward_m: 0.3, grip_width_m: 0.5 } };
      const s = solveWorld(r.model, r.rest, p, { twoHanded: true, grip: "STANDARD", sockets: [] });
      for (const [S, , x] of SIDES) {
        assert.ok(s[`${S}Hand`]!.position.distanceTo(new THREE.Vector3(x * 0.25, 1.0, 0.3)) < 0.002, `${S} hand on the bar`);
        const fore = dir(s, `${S}ForeArm`, `${S}Hand`);
        const want = new THREE.Vector3(1, 0, 0).cross(fore).normalize();
        near(palmOf(r, s, S), want, `${S} palm`, 2);
      }
    });
  }
});

describe("saved clips", () => {
  const v1: PoseClipJson = {
    kind: "pose-angles",
    fps: 30,
    duration: 1,
    loop: false,
    keyframes: [{ t: 0, position: 0, angles: { ...NEUTRAL_POSE, left_arm: { ...NEUTRAL_POSE.left_arm, forearm_pronation: 0 }, right_arm: { ...NEUTRAL_POSE.right_arm, forearm_pronation: -90 } } }],
  };

  it("version 1 forearms move to the anatomical zero, once", () => {
    const up = upgradePoseClip(v1);
    assert.equal(up.version, 2);
    assert.equal(up.keyframes[0].angles.left_arm.forearm_pronation, 90);
    assert.equal(up.keyframes[0].angles.right_arm.forearm_pronation, 0);
    assert.equal(upgradePoseClip(up), up);
    assert.equal(posesFromClip(v1).poses[0].left_arm.forearm_pronation, 90);
  });
});
