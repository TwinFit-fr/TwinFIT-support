import { staffGql } from "@/lib/staff-gql";
import {
  STUDIO_ACTIVATE_EQUIPMENT_MODEL,
  STUDIO_ACTIVATE_VECTOR,
  STUDIO_AVATAR,
  STUDIO_AVATARS,
  STUDIO_AVATARS_PROCESSING,
  STUDIO_STYLE_CHARACTER,
  STUDIO_CLAIM,
  STUDIO_CLAIM_EQUIPMENT_FINISH,
  STUDIO_CREATE_EQUIPMENT_MODEL,
  STUDIO_DELETE_EQUIPMENT_MODEL,
  STUDIO_EQUIPMENT,
  STUDIO_EQUIPMENT_MODEL,
  STUDIO_EQUIPMENT_PROCESSING,
  STUDIO_UPDATE_AVATAR,
  STUDIO_UPDATE_EQUIPMENT_MODEL,
  STUDIO_CATALOG,
  STUDIO_CREATE_AVATAR,
  STUDIO_CREATE_DEFAULT_AVATAR,
  STUDIO_DELETE_VECTOR,
  STUDIO_ENQUEUE,
  STUDIO_SETTINGS,
  STUDIO_UPDATE_VECTOR,
  STUDIO_VECTOR,
  STUDIO_VECTORS,
  STUDIO_EXERCISE_FRAMES,
  STUDIO_WORKER_EXERCISE,
  STUDIO_WORKER_POSES,
} from "./graphql";
import type {
  BaseAvatar,
  EquipmentKind,
  EquipmentModel,
  EquipmentProvider,
  MovementVector,
  StudioEquipment,
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
  // A default must be a ready avatar: a processing one is made default when it finishes.
  const ready = (input.status ?? "ready") === "ready";
  const data = await staffGql<{ insert_animation_studio_base_avatars_one: BaseAvatar }>(
    token,
    input.is_default && ready ? STUDIO_CREATE_DEFAULT_AVATAR : STUDIO_CREATE_AVATAR,
    { object: { ...input, is_default: input.is_default && ready, active: true } },
  );
  return data.insert_animation_studio_base_avatars_one;
}

export type AvatarPatch = Partial<
  Pick<BaseAvatar, "name" | "height_m" | "sockets" | "params" | "active" | "file_id" | "model_url" | "status" | "progress" | "task_id" | "rig_task_id" | "error" | "usage" | "is_default">
>;

export async function listProcessingAvatars(token: string): Promise<BaseAvatar[]> {
  const data = await staffGql<{ animation_studio_base_avatars: BaseAvatar[] }>(token, STUDIO_AVATARS_PROCESSING);
  return data.animation_studio_base_avatars;
}

/** The file id of the default style's character reference image for a subject, or null. */
export async function getStyleCharacterFileId(token: string, subject: string): Promise<string | null> {
  const data = await staffGql<{ images_style_characters: { subject: string; file_id: string }[] }>(token, STUDIO_STYLE_CHARACTER, { subject });
  return data.images_style_characters[0]?.file_id ?? null;
}

export async function updateAvatar(token: string, id: string, set: AvatarPatch): Promise<BaseAvatar> {
  const data = await staffGql<{ update_animation_studio_base_avatars_by_pk: BaseAvatar | null }>(token, STUDIO_UPDATE_AVATAR, { id, set });
  const row = data.update_animation_studio_base_avatars_by_pk;
  if (!row) throw new Error("Avatar not found");
  return row;
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

// ---------------------------------------------------------------------------
// Equipment models
// ---------------------------------------------------------------------------

type RawCatalogEquipment = { code: string; name: string; description: string | null };

/** Catalog implements and supports with their reference image and models, in catalog order. */
export async function listEquipment(token: string): Promise<StudioEquipment[]> {
  const data = await staffGql<{
    catalog_equipment: RawCatalogEquipment[];
    catalog_support_equipment: RawCatalogEquipment[];
    images_equipment_images: { kind: EquipmentKind; code: string; image_url: string }[];
    animation_studio_equipment_models: EquipmentModel[];
  }>(token, STUDIO_EQUIPMENT);

  const refs = new Map(data.images_equipment_images.map((r) => [`${r.kind}:${r.code}`, r.image_url]));
  const models = new Map<string, EquipmentModel[]>();
  for (const m of data.animation_studio_equipment_models) {
    const key = `${m.kind}:${m.code}`;
    models.set(key, [...(models.get(key) ?? []), m]);
  }
  const entry = (kind: EquipmentKind) => (row: RawCatalogEquipment): StudioEquipment => ({
    kind,
    code: row.code,
    name: row.name,
    description: row.description,
    reference_image_url: refs.get(`${kind}:${row.code}`) ?? null,
    models: models.get(`${kind}:${row.code}`) ?? [],
  });
  return [...data.catalog_equipment.map(entry("load")), ...data.catalog_support_equipment.map(entry("support"))];
}

export async function getEquipmentModel(token: string, id: string): Promise<EquipmentModel | null> {
  const data = await staffGql<{ animation_studio_equipment_models_by_pk: EquipmentModel | null }>(
    token,
    STUDIO_EQUIPMENT_MODEL,
    { id },
  );
  return data.animation_studio_equipment_models_by_pk;
}

export async function listProcessingEquipmentModels(token: string): Promise<EquipmentModel[]> {
  const data = await staffGql<{ animation_studio_equipment_models: EquipmentModel[] }>(
    token,
    STUDIO_EQUIPMENT_PROCESSING,
  );
  return data.animation_studio_equipment_models;
}

export type NewEquipmentModelInput = {
  kind: EquipmentKind;
  code: string;
  name: string;
  provider: EquipmentProvider;
  task_id?: string | null;
  source_image_url?: string | null;
  prompt?: string | null;
  status?: VectorStatus;
  params: Record<string, unknown>;
};

export async function createEquipmentModel(token: string, input: NewEquipmentModelInput): Promise<EquipmentModel> {
  const data = await staffGql<{ insert_animation_studio_equipment_models_one: EquipmentModel }>(
    token,
    STUDIO_CREATE_EQUIPMENT_MODEL,
    { object: input },
  );
  return data.insert_animation_studio_equipment_models_one;
}

export type EquipmentModelPatch = Partial<{
  name: string;
  task_id: string | null;
  source_image_url: string | null;
  prompt: string | null;
  status: VectorStatus;
  progress: number;
  error: string | null;
  file_id: string | null;
  model_url: string | null;
  thumbnail_file_id: string | null;
  thumbnail_url: string | null;
  params: Record<string, unknown>;
  usage: Record<string, unknown> | null;
  active: boolean;
}>;

export async function updateEquipmentModel(token: string, id: string, set: EquipmentModelPatch): Promise<EquipmentModel> {
  const data = await staffGql<{ update_animation_studio_equipment_models_by_pk: EquipmentModel | null }>(
    token,
    STUDIO_UPDATE_EQUIPMENT_MODEL,
    { id, set },
  );
  const row = data.update_animation_studio_equipment_models_by_pk;
  if (!row) throw new Error("Equipment model not found");
  return row;
}

/** True when this request won the right to finish the task (see STUDIO_CLAIM_EQUIPMENT_FINISH). */
export async function claimEquipmentFinish(token: string, id: string): Promise<boolean> {
  const data = await staffGql<{ update_animation_studio_equipment_models: { affected_rows: number } }>(
    token,
    STUDIO_CLAIM_EQUIPMENT_FINISH,
    { id },
  );
  return data.update_animation_studio_equipment_models.affected_rows === 1;
}

export async function activateEquipmentModel(
  token: string,
  model: Pick<EquipmentModel, "id" | "kind" | "code">,
): Promise<EquipmentModel> {
  const data = await staffGql<{ set: EquipmentModel | null }>(token, STUDIO_ACTIVATE_EQUIPMENT_MODEL, {
    id: model.id,
    kind: model.kind,
    code: model.code,
  });
  if (!data.set) throw new Error("Equipment model not found");
  return data.set;
}

export async function deleteEquipmentModel(
  token: string,
  id: string,
): Promise<{ id: string; file_id: string | null; thumbnail_file_id: string | null } | null> {
  const data = await staffGql<{
    delete_animation_studio_equipment_models_by_pk: { id: string; file_id: string | null; thumbnail_file_id: string | null } | null;
  }>(token, STUDIO_DELETE_EQUIPMENT_MODEL, { id });
  return data.delete_animation_studio_equipment_models_by_pk;
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

/** The next runnable pending vector marked processing, or null (see claim_movement_vector). */
export async function claimMovementVector(token: string): Promise<MovementVector | null> {
  const data = await staffGql<{ animation_studio_claim_movement_vector: MovementVector[] }>(token, STUDIO_CLAIM);
  return data.animation_studio_claim_movement_vector[0] ?? null;
}

export async function getAvatar(token: string, id: string): Promise<BaseAvatar | null> {
  const data = await staffGql<{ animation_studio_base_avatars_by_pk: BaseAvatar | null }>(token, STUDIO_AVATAR, { id });
  return data.animation_studio_base_avatars_by_pk;
}

export type WorkerExercise = { id: string; exo_id: number; display_name: string; description: string; grip: string | null };

export async function getWorkerExercise(token: string, id: string): Promise<WorkerExercise | null> {
  const data = await staffGql<{
    catalog_exercises_by_pk: {
      id: string;
      exo_id: number;
      display_name: string;
      grip: { code: string } | null;
      localizations: { description: string | null }[];
    } | null;
  }>(token, STUDIO_WORKER_EXERCISE, { id });
  const row = data.catalog_exercises_by_pk;
  if (!row) return null;
  return {
    id: row.id,
    exo_id: row.exo_id,
    display_name: row.display_name,
    description: row.localizations[0]?.description?.trim() ?? "",
    grip: row.grip?.code ?? null,
  };
}

export async function getExercisePoses(token: string, exoId: number): Promise<{ position: number; pose: string }[]> {
  const data = await staffGql<{ images_exercise_poses: { position: number; pose: string }[] }>(token, STUDIO_WORKER_POSES, { exoId });
  return data.images_exercise_poses;
}

export async function getExerciseFrames(token: string, exoId: number, subject: string): Promise<{ position: number; image_url: string }[]> {
  const data = await staffGql<{ images_exercise_images: { position: number; image_url: string }[] }>(token, STUDIO_EXERCISE_FRAMES, { exoId, subject });
  return data.images_exercise_images;
}
