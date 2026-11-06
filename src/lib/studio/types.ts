/** Nhost Storage bucket of the 3D Studio (avatars and movement clips). */
export const STUDIO_BUCKET = "3d-workspace";

export type VectorStatus = "pending" | "processing" | "ready" | "error";
export type VectorFormat = "glb" | "gltf" | "bvh" | "json";
export type AvatarSubject = "neutral" | "man" | "woman";
export type AvatarRig = "mixamo" | "vrm" | "custom";

export const VECTOR_FORMATS: readonly VectorFormat[] = ["glb", "gltf", "bvh", "json"];
export const AVATAR_SUBJECTS: readonly AvatarSubject[] = ["neutral", "man", "woman"];
export const AVATAR_RIGS: readonly AvatarRig[] = ["mixamo", "vrm", "custom"];

export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];

/** One attachment point of an avatar (animation_studio.base_avatars.sockets). */
export type AvatarSocket = {
  id: string;
  bone: string;
  offset?: Vec3;
  rotation?: Vec3 | Vec4;
};

/** One piece of equipment in the scene (animation_studio.movement_vectors.equipment.items). */
export type EquipmentItem = {
  kind: "load" | "support";
  code: string;
  socket?: string;
  count?: number;
  weight_kg?: number;
  model_url?: string;
};

export type MovementEquipment = { items?: EquipmentItem[] } & Record<string, unknown>;

export type PipelineParams = {
  fps?: number;
  duration_s?: number;
  loop?: boolean;
  seed?: number;
  model?: string;
} & Record<string, unknown>;

export type BaseAvatar = {
  id: string;
  code: string;
  name: string;
  subject: AvatarSubject;
  file_id: string;
  model_url: string;
  rig: AvatarRig;
  height_m: number | null;
  sockets: AvatarSocket[];
  params: Record<string, unknown>;
  active: boolean;
  is_default: boolean;
  inserted_at: string;
  updated_at: string;
};

export type MovementVector = {
  id: string;
  seq: number;
  exercise_id: string;
  avatar_id: string;
  prompt: string;
  equipment: MovementEquipment;
  params: PipelineParams;
  status: VectorStatus;
  attempts: number;
  max_attempts: number;
  not_before: string | null;
  error: string | null;
  file_id: string | null;
  vector_url: string | null;
  format: VectorFormat;
  fps: number | null;
  frame_count: number | null;
  duration_ms: number | null;
  model: string | null;
  usage: Record<string, unknown> | null;
  active: boolean;
  created_by: string | null;
  inserted_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
  avatar: { id: string; code: string; subject: AvatarSubject } | null;
};

export type StudioSettings = {
  max_concurrency: number;
  stale_after_minutes: number;
  pipeline: PipelineParams;
  prompt_template: string;
  updated_at: string;
};

export type TaxonomyRef = { code: string; name: string };

/** A catalog exercise as the Studio sidebar lists it. */
export type StudioExercise = {
  id: string;
  exo_id: number;
  display_name: string;
  description: string;
  group: TaxonomyRef | null;
  target_muscle: TaxonomyRef | null;
  movement_type: TaxonomyRef | null;
  equipment: TaxonomyRef | null;
  support_equipment: TaxonomyRef | null;
  /** Start frame of the default style (man), when the Images tool has one. */
  thumbnail_url: string | null;
  vectors: { total: number; ready: number; queued: number; failed: number; active: boolean };
};

export type NewVectorInput = {
  exercise_id: string;
  avatar_id: string;
  prompt: string;
  equipment: MovementEquipment;
  params: PipelineParams;
  format: VectorFormat;
};

export type NewAvatarInput = {
  code: string;
  name: string;
  subject: AvatarSubject;
  file_id: string;
  model_url: string;
  rig: AvatarRig;
  height_m: number | null;
  sockets: AvatarSocket[];
  params: Record<string, unknown>;
  is_default: boolean;
};

export const VECTOR_STATUS_LABEL: Record<VectorStatus, string> = {
  pending: "Queued",
  processing: "Generating",
  ready: "Ready",
  error: "Failed",
};

export function isQueued(status: VectorStatus): boolean {
  return status === "pending" || status === "processing";
}
