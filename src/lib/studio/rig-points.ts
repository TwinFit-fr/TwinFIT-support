/**
 * The attachment points (sockets) of an avatar as the rig editor shows them: a name people read
 * ("Left hand" for hand_l), where the point was put when the avatar was made (detected from the
 * rig's bone names for a Meshy avatar, built with the mannequin), and whether it still sits
 * there. The detection rule lives here, shared by the server that stores it and the editor that
 * offers to go back to it. Pure, for node:test.
 */

import type { AvatarSocket, Vec3 } from "./types";

type CanonicalMap = Partial<Record<string, string>>;

/** Sockets on a rig's own bone names (canonical name → the rig's name): hands, upper back, hips. */
export function socketsForBones(bones: CanonicalMap): AvatarSocket[] {
  const sockets: AvatarSocket[] = [];
  if (bones.LeftHand) sockets.push({ id: "hand_l", bone: bones.LeftHand, offset: [0.05, 0, 0] });
  if (bones.RightHand) sockets.push({ id: "hand_r", bone: bones.RightHand, offset: [-0.05, 0, 0] });
  const spine = bones.Spine2 ?? bones.Spine1;
  if (spine) sockets.push({ id: "back", bone: spine, offset: [0, 0, -0.16] });
  if (bones.Hips) sockets.push({ id: "feet", bone: bones.Hips, offset: [0, -0.95, 0] });
  return sockets;
}

/** The mannequin's sockets for a body `heightM` tall (its proportions are those of a 1.75 m body, scaled). */
export const MANNEQUIN_BASE_HEIGHT = 1.75;
export function mannequinSockets(heightM: number): AvatarSocket[] {
  const k = heightM / MANNEQUIN_BASE_HEIGHT;
  return [
    { id: "hand_l", bone: "mixamorigLeftHand", offset: [0.05 * k, 0, 0] },
    { id: "hand_r", bone: "mixamorigRightHand", offset: [-0.05 * k, 0, 0] },
    { id: "back", bone: "mixamorigSpine2", offset: [0, 0, -0.16 * k] },
    { id: "feet", bone: "mixamorigHips", offset: [0, -0.98 * k, 0] },
  ];
}

/**
 * Where each socket was put automatically when this avatar was made, by id; null when the avatar
 * carries nothing to tell (an upload with hand-written sockets). Read from what is already stored
 * on the avatar: the bone map of a Meshy build, the height of a mannequin.
 */
export function detectedSockets(avatar: { params?: Record<string, unknown> | null; height_m?: number | null }): Record<string, AvatarSocket> | null {
  const params = avatar.params ?? {};
  let list: AvatarSocket[] | null = null;
  if (params.bones && typeof params.bones === "object") list = socketsForBones(params.bones as CanonicalMap);
  else if (params.generated === "mannequin") list = mannequinSockets(avatar.height_m && avatar.height_m > 0 ? avatar.height_m : MANNEQUIN_BASE_HEIGHT);
  if (!list || !list.length) return null;
  return Object.fromEntries(list.map((s) => [s.id, s]));
}

/** Half a millimetre and a tenth of a degree: what the editor shows and writes, so closer than this is the same place. */
const SAME_M = 0.0005;
const SAME_DEG = 0.1;

const vec = (v: readonly number[] | undefined, n: 3 | 4): number[] => (v && v.length === n ? [...v] : n === 3 ? [0, 0, 0] : [0, 0, 0, 1]);

/** Do two sockets sit at the same place on the same bone (offset and rotation, rounding aside)? */
export function sameSocket(a: AvatarSocket, b: AvatarSocket): boolean {
  if (a.bone !== b.bone) return false;
  const oa = vec(a.offset, 3);
  const ob = vec(b.offset, 3);
  if (oa.some((v, i) => Math.abs(v - ob[i]) > SAME_M)) return false;
  const ra = a.rotation?.length === 4 ? vec(a.rotation, 4) : vec(a.rotation, 3);
  const rb = b.rotation?.length === 4 ? vec(b.rotation, 4) : vec(b.rotation, 3);
  if (ra.length !== rb.length) return false;
  return ra.every((v, i) => Math.abs(v - rb[i]) <= (ra.length === 4 ? 1e-4 : SAME_DEG));
}

/**
 * Where a socket comes from: "detected" still sits where it was put automatically, "moved" was
 * put automatically and has been moved since (it can be reset), "manual" was added by hand.
 */
export type SocketOrigin = "detected" | "moved" | "manual";
export function socketOrigin(socket: AvatarSocket, detected: Record<string, AvatarSocket> | null): SocketOrigin {
  const auto = detected?.[socket.id];
  if (!auto) return "manual";
  return sameSocket(socket, auto) ? "detected" : "moved";
}

const SIDE: Record<string, string> = { l: "Left", r: "Right", left: "Left", right: "Right" };

/** A socket id as people read it: hand_l → "Left hand", upper_back → "Upper back", feet → "Feet". */
export function socketLabel(id: string): string {
  const parts = id.split(/[_\s-]+/).filter(Boolean);
  if (!parts.length) return id;
  let side = "";
  const last = parts[parts.length - 1].toLowerCase();
  const first = parts[0].toLowerCase();
  if (parts.length > 1 && SIDE[last]) {
    side = SIDE[last];
    parts.pop();
  } else if (parts.length > 1 && SIDE[first]) {
    side = SIDE[first];
    parts.shift();
  }
  const words = parts.join(" ").toLowerCase();
  const text = side ? `${side} ${words}` : words;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** An equipment key (`load:DUMBBELL`) as people read it: "Dumbbell". */
export function equipmentLabel(key: string): string {
  const code = key.includes(":") ? key.slice(key.indexOf(":") + 1) : key;
  const text = code.replace(/[_-]+/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** What the rig editor's fields accept: an offset within two metres of its bone, a rotation within a half turn. */
export const OFFSET_LIMIT_MM = 2000;
export const ROTATION_LIMIT_DEG = 180;

/** Steps of the gizmo and of a pointer drag while Snap is on. */
export const SNAP_MM = 5;
export const SNAP_DEG = 15;

/** Metres (stored) to the millimetres the fields show, and back; both free of float noise. */
export const toMm = (m: number): number => Math.round(m * 10000) / 10;
export const fromMm = (mm: number): number => Math.round(mm * 10) / 10000;

/** A position snapped to the nearest step, metres in and out. */
export function snapOffset(offset: Vec3, stepMm = SNAP_MM): Vec3 {
  const step = stepMm / 1000;
  return offset.map((v) => Math.round(Math.round(v / step) * step * 10000) / 10000) as Vec3;
}

/** A dragged position as stored: millimetre precision. */
export function roundOffset(offset: Vec3): Vec3 {
  return offset.map((v) => Math.round(v * 1000) / 1000) as Vec3;
}
