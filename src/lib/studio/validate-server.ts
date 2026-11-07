import * as THREE from "three";
import type { PoseClipJson } from "./anatomy";
import { buildMannequin } from "./mannequin";
import { captureRestPose, type RestPose } from "./pose-clip";
import { validatePoseClip, type PoseValidation } from "./pose-validate";

export type DraftCheck = PoseValidation;

const standIns = new Map<number, { model: THREE.Object3D; rest: RestPose }>();

/**
 * The server has no avatar loaded, and a body's rules hardly depend on which one: clips are
 * checked on the mannequin at the avatar's height. The viewer checks again on the real rig.
 */
export function validateOnStandIn(clip: PoseClipJson, heightM: number | null): DraftCheck {
  const height = Math.round((heightM ?? 1.75) * 100) / 100;
  let standIn = standIns.get(height);
  if (!standIn) {
    const model = new THREE.Group();
    model.add(buildMannequin(height));
    model.updateMatrixWorld(true);
    standIn = { model, rest: captureRestPose(model) };
    standIns.set(height, standIn);
  }
  return validatePoseClip(standIn.model, clip, standIn.rest);
}
