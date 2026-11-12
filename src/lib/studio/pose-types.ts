// Shapes the pose solvers share: the calibrated rig and its feet, what a solve takes (context) and gives back.
import type * as THREE from "three";
import type { PoseAngles } from "./anatomy.ts";
import type { Logical } from "./pose-bones.ts";
import type { RestPose } from "./rest-pose.ts";
import type { AvatarSocket } from "./types";

export type Solved = {
  local: Map<string, THREE.Quaternion>;
  hipsPosition: THREE.Vector3;
  /** Where the pelvis went from its rest position, world metres. */
  hipsOffset: THREE.Vector3;
  /** How much each foot (rig.feet order) carries the body, 0 to 1; empty when not standing. */
  support: number[];
};

/** What a clip needs beyond the angles: whether the arms reach a two-handed implement, and how. */
export type SolveContext = {
  twoHanded: boolean;
  grip: string | null;
  sockets: AvatarSocket[];
  /** The clip's first pose: where the feet are planted for the poses that follow. */
  stance?: PoseAngles;
  /** A drag trying a pose: a free foot is left where its angles put it, even under the floor, so the search can see that and keep it out itself. */
  trial?: boolean;
};

/** A foot of the rig and where it belongs: its floor heights at rest, its place in the anatomical position. */
type RigFoot = {
  side: "left" | "right";
  logical: "LeftFoot" | "RightFoot";
  name: string;
  thigh: string;
  shank: string;
  toe: string | null;
  /** The furthest bone of the foot, for what must stay above the floor. */
  tip: string;
  ankleRestY: number;
  toeRestY: number;
  tipRestY: number;
  home: THREE.Vector3;
};

export type Rig = {
  names: Partial<Record<Logical, string>>;
  rest: RestPose;
  /** Rest world rotation of each bone's parent (identity for a bone under a non-bone node). */
  parentWorld: Map<string, THREE.Quaternion>;
  hipsRestY: number;
  /** World rotation taking each bone from rest to the anatomical position. */
  correction: Map<string, THREE.Quaternion>;
  /** The correction of each bone's nearest calibrated ancestor (what its parent already turned). */
  parentCorrection: Map<string, THREE.Quaternion>;
  /** World rotation of each calibrated bone in the anatomical position. */
  anatomical: Map<string, THREE.Quaternion>;
  feet: RigFoot[];
  /** Where each first pose leaves the body (see plantedBody). */
  planted: WeakMap<PoseAngles, Planted>;
  /** Spine bones from the lowest up. */
  spine: Logical[];
  /** Arm chains, left and right: what `plant_hands` holds. */
  arms: { side: "left" | "right"; upper: string; fore: string; hand: string }[];
  /** Heights of the rig standing at rest, for what depends on its proportions. */
  heights: { knee: number; hip: number; shoulder: number };
};

export type Planted = { feet: (THREE.Vector3 | null)[]; toes: (THREE.Vector3 | null)[]; knees: (THREE.Vector3 | null)[]; hands: (THREE.Vector3 | null)[] };

export type WorldTransform = { pos: THREE.Vector3; quat: THREE.Quaternion };
