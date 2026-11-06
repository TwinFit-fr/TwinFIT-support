import { staffGql } from "@/lib/staff-gql";
import {
  STUDIO_ACTIVATE_VECTOR,
  STUDIO_AVATARS,
  STUDIO_CATALOG,
  STUDIO_CREATE_AVATAR,
  STUDIO_CREATE_DEFAULT_AVATAR,
  STUDIO_DELETE_VECTOR,
  STUDIO_ENQUEUE,
  STUDIO_SETTINGS,
  STUDIO_UPDATE_VECTOR,
  STUDIO_VECTOR,
  STUDIO_VECTORS,
} from "./graphql";
import type {
  BaseAvatar,
  MovementVector,
  NewAvatarInput,
  NewVectorInput,
  StudioExercise,
  StudioSettings,
  TaxonomyRef,
  VectorFormat,
  VectorStatus,
} from "./types";

type RawExercise = {
  id: string;
  exo_id: number;
  display_name: string;
  primary_muscle_group: TaxonomyRef | null;
  target_muscle: TaxonomyRef | null;
  movement_type: TaxonomyRef | null;
  equipment: TaxonomyRef | null;
  support_equipment: TaxonomyRef | null;
  localizations: { description: string | null }[];
};

type RawVectorStat = { exercise_id: string; status: VectorStatus; active: boolean };

const NO_VECTORS: StudioExercise["vectors"] = { total: 0, ready: 0, queued: 0, failed: 0, active: false };

/** The catalog as the sidebar lists it (see STUDIO_CATALOG). */
export async function listStudioExercises(token: string): Promise<StudioExercise[]> {
  const data = await staffGql<{
    catalog_exercises: RawExercise[];
    images_exercise_images: { exo_id: number; image_url: string }[];
    animation_studio_movement_vectors: RawVectorStat[];
  }>(token, STUDIO_CATALOG);

  const thumbs = new Map(data.images_exercise_images.map((row) => [row.exo_id, row.image_url]));
  const stats = new Map<string, StudioExercise["vectors"]>();
  for (const v of data.animation_studio_movement_vectors) {
    const s = stats.get(v.exercise_id) ?? { ...NO_VECTORS };
    s.total += 1;
    if (v.status === "ready") s.ready += 1;
    else if (v.status === "error") s.failed += 1;
    else s.queued += 1;
    if (v.active) s.active = true;
    stats.set(v.exercise_id, s);
  }

  return data.catalog_exercises.map((e) => ({
    id: e.id,
    exo_id: e.exo_id,
    display_name: e.display_name,
    description: e.localizations[0]?.description?.trim() ?? "",
    group: e.primary_muscle_group,
    target_muscle: e.target_muscle,
    movement_type: e.movement_type,
    equipment: e.equipment,
    support_equipment: e.support_equipment,
    thumbnail_url: thumbs.get(e.exo_id) ?? null,
    vectors: stats.get(e.id) ?? NO_VECTORS,
  }));
}

export async function listAvatars(token: string): Promise<BaseAvatar[]> {
  const data = await staffGql<{ animation_studio_base_avatars: BaseAvatar[] }>(token, STUDIO_AVATARS);
  return data.animation_studio_base_avatars;
}

export async function createAvatar(token: string, input: NewAvatarInput): Promise<BaseAvatar> {
  const data = await staffGql<{ insert_animation_studio_base_avatars_one: BaseAvatar }>(
    token,
    input.is_default ? STUDIO_CREATE_DEFAULT_AVATAR : STUDIO_CREATE_AVATAR,
    { object: { ...input, active: true } },
  );
  return data.insert_animation_studio_base_avatars_one;
}

export async function getStudioSettings(token: string): Promise<StudioSettings> {
  const data = await staffGql<{ animation_studio_settings: StudioSettings[] }>(token, STUDIO_SETTINGS);
  const settings = data.animation_studio_settings[0];
  if (!settings) throw new Error("animation_studio.settings has no row");
  return settings;
}

export async function listVectors(token: string, exerciseId: string): Promise<MovementVector[]> {
  const data = await staffGql<{ animation_studio_movement_vectors: MovementVector[] }>(
    token,
    STUDIO_VECTORS,
    { exerciseId },
  );
  return data.animation_studio_movement_vectors;
}

export async function getVector(token: string, id: string): Promise<MovementVector | null> {
  const data = await staffGql<{ animation_studio_movement_vectors_by_pk: MovementVector | null }>(
    token,
    STUDIO_VECTOR,
    { id },
  );
  return data.animation_studio_movement_vectors_by_pk;
}

export async function createVector(token: string, input: NewVectorInput): Promise<MovementVector> {
  const data = await staffGql<{ insert_animation_studio_movement_vectors_one: MovementVector }>(
    token,
    STUDIO_ENQUEUE,
    { object: input },
  );
  return data.insert_animation_studio_movement_vectors_one;
}

/** Columns staff may change on a vector (Hasura update permission). */
export type VectorPatch = Partial<{
  prompt: string;
  status: VectorStatus;
  error: string | null;
  not_before: string | null;
  file_id: string | null;
  vector_url: string | null;
  format: VectorFormat;
  fps: number | null;
  frame_count: number | null;
  duration_ms: number | null;
  model: string | null;
  usage: Record<string, unknown> | null;
  active: boolean;
}>;

export async function updateVector(token: string, id: string, set: VectorPatch): Promise<MovementVector> {
  const data = await staffGql<{ update_animation_studio_movement_vectors_by_pk: MovementVector | null }>(
    token,
    STUDIO_UPDATE_VECTOR,
    { id, set },
  );
  const row = data.update_animation_studio_movement_vectors_by_pk;
  if (!row) throw new Error("Movement vector not found");
  return row;
}

export async function activateVector(token: string, vector: Pick<MovementVector, "id" | "exercise_id" | "avatar_id">): Promise<MovementVector> {
  const data = await staffGql<{ set: MovementVector | null }>(token, STUDIO_ACTIVATE_VECTOR, {
    id: vector.id,
    exerciseId: vector.exercise_id,
    avatarId: vector.avatar_id,
  });
  if (!data.set) throw new Error("Movement vector not found");
  return data.set;
}

export async function deleteVector(token: string, id: string): Promise<{ id: string; file_id: string | null } | null> {
  const data = await staffGql<{ delete_animation_studio_movement_vectors_by_pk: { id: string; file_id: string | null } | null }>(
    token,
    STUDIO_DELETE_VECTOR,
    { id },
  );
  return data.delete_animation_studio_movement_vectors_by_pk;
}
