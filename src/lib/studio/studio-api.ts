// The browser's calls to the Studio's own /api/studio routes: every route path, the SWR keys of the
// list routes, and one function per endpoint and method that hands the request to the fetch it is given.
import { EQUIPMENT_KEY } from "./equipment.ts";
import type { AvatarSocket, EquipmentItem, EquipmentKind, PipelineParams, Vec3 } from "./types";

/**
 * The fetch every call goes through: the staff fetch of use-staff-fetch.ts (adds the token, parses
 * the JSON answer, throws the route's error). Each function returns what it returns, untouched.
 */
export type StudioFetch = (input: string, init?: RequestInit) => Promise<unknown>;

const AVATARS = "/api/studio/avatars";
const VECTORS = "/api/studio/vectors";

/** SWR keys of the list routes (also what the fetcher requests). */
export const STUDIO_EXERCISES_KEY = "/api/studio/exercises";
export const STUDIO_AVATARS_KEY = AVATARS;
export const STUDIO_SETTINGS_KEY = "/api/studio/settings";
export const STORAGE_ORPHANS_KEY = "/api/studio/storage/orphans";

/** The movement vectors of one exercise. */
export function vectorsKey(exerciseId: string): string {
  return `${VECTORS}?exercise=${exerciseId}`;
}

/** The catalog reference of one exercise for a subject (man or woman frames). */
export function exerciseReferenceKey(exoId: number, subject: string): string {
  return `${STUDIO_EXERCISES_KEY}/reference?exo=${exoId}&subject=${subject}`;
}

// Avatars

/** Register a base avatar: a FormData upload as is, anything else as JSON. */
export function createAvatar(staffFetch: StudioFetch, body: FormData | object) {
  return staffFetch(AVATARS, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body) });
}

export type AvatarPatch =
  | { name: string | number | undefined }
  | { height_m: string | number | undefined }
  | { action: "set_default" | "retry" }
  | { sockets: AvatarSocket[] };

export function patchAvatar(staffFetch: StudioFetch, id: string, body: AvatarPatch) {
  return staffFetch(`${AVATARS}/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteAvatar(staffFetch: StudioFetch, id: string) {
  return staffFetch(`${AVATARS}/${id}`, { method: "DELETE" });
}

// Equipment models

export type EquipmentStart = { kind: EquipmentKind; code: string; prompt: string | null; image_data_url?: string | null };

/** Start a Meshy build (JSON) or upload a model (FormData with file, kind and code). */
export function createEquipment(staffFetch: StudioFetch, body: FormData | EquipmentStart) {
  return staffFetch(EQUIPMENT_KEY, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body) });
}

export type EquipmentPatch =
  | { action: "activate" | "deactivate" }
  | { action: "placement"; size_m: number; offset: Vec3 | undefined; rotation: Vec3 | undefined };

export function patchEquipment(staffFetch: StudioFetch, id: string, body: EquipmentPatch) {
  return staffFetch(`${EQUIPMENT_KEY}/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteEquipment(staffFetch: StudioFetch, id: string) {
  return staffFetch(`${EQUIPMENT_KEY}/${id}`, { method: "DELETE" });
}

// Movement vectors

export function listVectors(staffFetch: StudioFetch, exerciseId: string) {
  return staffFetch(vectorsKey(exerciseId));
}

export type VectorRequest = {
  exercise_id: string;
  avatar_id: string;
  prompt: string;
  equipment: { items: EquipmentItem[] };
  params: PipelineParams;
};

/** Enqueue an AI generation. */
export function createVector(staffFetch: StudioFetch, body: VectorRequest) {
  return staffFetch(VECTORS, { method: "POST", body: JSON.stringify(body) });
}

/** A finished clip as a new ready row (FormData: file, fields). */
export function uploadVector(staffFetch: StudioFetch, form: FormData) {
  return staffFetch(`${VECTORS}/upload`, { method: "POST", body: form });
}

/** A clip stored as the result of an existing row (FormData: file, optional meta). */
export function postVectorResult(staffFetch: StudioFetch, id: string, form: FormData) {
  return staffFetch(`${VECTORS}/${id}/result`, { method: "POST", body: form });
}

export type VectorPatch = { action: "fail"; error: string } | { action: "edit"; prompt: string } | { action: "activate" | "deactivate" | "requeue" };

export function patchVector(staffFetch: StudioFetch, id: string, body: VectorPatch) {
  return staffFetch(`${VECTORS}/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteVector(staffFetch: StudioFetch, id: string) {
  return staffFetch(`${VECTORS}/${id}`, { method: "DELETE" });
}

// Pose editor

export type PoseDraftRequest = {
  exercise_id: string;
  avatar_id: string;
  items: EquipmentItem[];
  two_handed: boolean;
  instructions: string | null;
  pose_count: number | null;
};

/** The language-model pose draft; the signal cancels it. */
export function draftPoses(staffFetch: StudioFetch, body: PoseDraftRequest, signal: AbortSignal) {
  return staffFetch("/api/studio/poses/draft", {
    method: "POST",
    signal,
    body: JSON.stringify(body),
  });
}

// Settings, storage, worker

export type SettingsPatch = { max_concurrency: number; stale_after_minutes: number; prompt_template: string; pipeline: PipelineParams };

export function patchSettings(staffFetch: StudioFetch, body: SettingsPatch) {
  return staffFetch(STUDIO_SETTINGS_KEY, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/** Sweep the unused files in storage. */
export function deleteStorageOrphans(staffFetch: StudioFetch) {
  return staffFetch(STORAGE_ORPHANS_KEY, { method: "DELETE" });
}

/** One worker tick: claim and process up to `max` queued rows. */
export function tickWorker(staffFetch: StudioFetch, body: { max: number }) {
  return staffFetch("/api/studio/worker", { method: "POST", body: JSON.stringify(body) });
}
