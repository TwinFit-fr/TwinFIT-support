import { staffGql } from "@/lib/staff-gql";
import { DEFAULT_GENERATION_PARAMS } from "./capabilities";
import { assembleImagePrompt, selectedPrompts } from "./prompt";
import type {
  ExerciseImage,
  ExerciseImageBoardItem,
  ExerciseImageDetail,
  GenerationSnapshot,
  ImagePrompt,
  ImagePromptKind,
  ImageSettings,
} from "./types";

const IMAGE_FIELDS = `
  id
  exo_id
  file_id
  image_url
  position
  active
  model
  prompt
  params
  usage
  created_by
  created_at
  updated_at
`;

const PROMPT_FIELDS = `
  id
  kind
  position
  name
  content
  inserted_at
  updated_at
`;

type RawExercise = {
  id: string;
  exo_id: number;
  display_name: string;
  active: boolean;
  primary_muscle_group: { id: string; name: string } | null;
  equipment: { id: string; name: string } | null;
  localizations: { locale: string; display_name: string; description: string | null }[];
};

function englishDescription(localizations: RawExercise["localizations"]): string {
  const en = localizations.find((item) => item.locale === "en");
  return en?.description?.trim() || localizations.find((item) => item.description)?.description || "";
}

function boardStatus(images: ExerciseImage[]): ExerciseImageBoardItem["status"] {
  const active = images.filter((img) => img.active && img.position != null);
  if (active.length >= 3) return "complete";
  if (active.length > 0) return "partial";
  if (images.length > 0) return "inactive_only";
  return "empty";
}

function toBoardItem(exercise: RawExercise, images: ExerciseImage[]): ExerciseImageBoardItem {
  const active = images
    .filter((img) => img.active && img.position != null)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const preview =
    active[0] ??
    images.find((img) => img.active) ??
    images[0] ??
    null;
  return {
    id: exercise.id,
    exo_id: exercise.exo_id,
    display_name: exercise.display_name,
    active: exercise.active,
    primary_muscle_group: exercise.primary_muscle_group,
    equipment: exercise.equipment,
    description: englishDescription(exercise.localizations) || null,
    image_count: images.length,
    active_count: active.length,
    active_positions: active.map((img) => img.position as number),
    active_frames: active.map((img) => ({
      position: img.position as number,
      image_url: img.image_url,
    })),
    preview_image: preview,
    status: boardStatus(images),
  };
}

export async function listImageExercises(token: string): Promise<ExerciseImageBoardItem[]> {
  const data = await staffGql<{
    catalog_exercises: RawExercise[];
    images_exercise_images: ExerciseImage[];
  }>(
    token,
    `query {
      catalog_exercises(order_by: [{ exo_id: asc }]) {
        id
        exo_id
        display_name
        active
        primary_muscle_group { id name }
        equipment { id name }
        localizations { locale display_name description }
      }
      images_exercise_images(order_by: [{ created_at: desc }]) {
        ${IMAGE_FIELDS}
      }
    }`,
  );

  const byExo = new Map<number, ExerciseImage[]>();
  for (const img of data.images_exercise_images ?? []) {
    const list = byExo.get(img.exo_id) ?? [];
    list.push(img);
    byExo.set(img.exo_id, list);
  }

  return (data.catalog_exercises ?? []).map((ex) =>
    toBoardItem(ex, byExo.get(ex.exo_id) ?? []),
  );
}

export async function getImageExercise(
  token: string,
  exoId: number,
): Promise<ExerciseImageDetail | null> {
  const data = await staffGql<{
    catalog_exercises: RawExercise[];
    images_exercise_images: ExerciseImage[];
  }>(
    token,
    `query($exoId: Int!) {
      catalog_exercises(where: { exo_id: { _eq: $exoId } }, limit: 1) {
        id
        exo_id
        display_name
        active
        primary_muscle_group { id name }
        equipment { id name }
        localizations { locale display_name description }
      }
      images_exercise_images(
        where: { exo_id: { _eq: $exoId } }
        order_by: [{ active: desc }, { position: asc_nulls_last }, { created_at: desc }]
      ) {
        ${IMAGE_FIELDS}
      }
    }`,
    { exoId },
  );

  const exercise = data.catalog_exercises?.[0];
  if (!exercise) return null;

  const images = data.images_exercise_images ?? [];
  const [prompts, settings] = await Promise.all([listImagePrompts(token), loadSettings(token)]);
  const chosen = selectedPrompts(settings, prompts, 0);

  return {
    ...toBoardItem(exercise, images),
    images,
    assembled_prompt: assembleImagePrompt({
      systemContent: chosen.system?.content ?? "",
      positionContent: chosen.position?.content ?? "",
      background_color: settings.params.background_color,
      name: exercise.display_name,
      description: englishDescription(exercise.localizations),
      exo_id: exercise.exo_id,
      id: exercise.id,
    }),
    localizations: exercise.localizations ?? [],
  };
}

export async function getExerciseSummary(token: string, exoId: number): Promise<RawExercise | null> {
  const data = await staffGql<{ catalog_exercises: RawExercise[] }>(
    token,
    `query($exoId: Int!) {
      catalog_exercises(where: { exo_id: { _eq: $exoId } }, limit: 1) {
        id
        exo_id
        display_name
        active
        primary_muscle_group { id name }
        equipment { id name }
        localizations { locale display_name description }
      }
    }`,
    { exoId },
  );
  return data.catalog_exercises?.[0] ?? null;
}

export async function listImagePrompts(token: string): Promise<ImagePrompt[]> {
  const data = await staffGql<{ images_prompts: ImagePrompt[] }>(
    token,
    `query {
      images_prompts(order_by: [{ kind: asc }, { position: asc_nulls_first }, { name: asc }]) {
        ${PROMPT_FIELDS}
      }
    }`,
  );
  return data.images_prompts ?? [];
}

export async function getImagePrompt(token: string, id: string): Promise<ImagePrompt | null> {
  const data = await staffGql<{ images_prompts_by_pk: ImagePrompt | null }>(
    token,
    `query($id: uuid!) { images_prompts_by_pk(id: $id) { ${PROMPT_FIELDS} } }`,
    { id },
  );
  return data.images_prompts_by_pk;
}

export async function createImagePrompt(
  token: string,
  input: {
    kind: ImagePromptKind;
    position?: number | null;
    name: string;
    content: string;
  },
): Promise<ImagePrompt> {
  const position = input.kind === "position" ? (input.position ?? null) : null;
  if (input.kind === "position" && position == null) {
    throw new Error("position is required for position prompts");
  }
  const data = await staffGql<{ insert_images_prompts_one: ImagePrompt }>(
    token,
    `mutation($object: images_prompts_insert_input!) {
      insert_images_prompts_one(object: $object) { ${PROMPT_FIELDS} }
    }`,
    {
      object: {
        kind: input.kind,
        position,
        name: input.name,
        content: input.content,
      },
    },
  );
  return data.insert_images_prompts_one;
}

export async function updateImagePrompt(
  token: string,
  id: string,
  input: { name?: string; content?: string },
): Promise<ImagePrompt> {
  const data = await staffGql<{ update_images_prompts_by_pk: ImagePrompt }>(
    token,
    `mutation($id: uuid!, $set: images_prompts_set_input!) {
      update_images_prompts_by_pk(pk_columns: { id: $id }, _set: $set) { ${PROMPT_FIELDS} }
    }`,
    {
      id,
      set: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        updated_at: new Date().toISOString(),
      },
    },
  );
  return data.update_images_prompts_by_pk;
}

export async function deleteImagePrompt(token: string, id: string): Promise<void> {
  const prompts = await listImagePrompts(token);
  const current = prompts.find((p) => p.id === id);
  if (!current) throw new Error("Prompt not found");
  const sameKind = prompts.filter(
    (p) => p.kind === current.kind && p.position === current.position,
  );
  if (sameKind.length <= 1) {
    throw new Error("Cannot delete the last prompt of this kind/position");
  }
  await staffGql(
    token,
    `mutation($id: uuid!) { delete_images_prompts_by_pk(id: $id) { id } }`,
    { id },
  );
}

const SETTINGS_FIELDS = `
  params
  system_prompt_id
  start_prompt_id
  mid_prompt_id
  end_prompt_id
  man_reference_file_id
  woman_reference_file_id
  updated_at
  updated_by
`;

/** Settings row with params merged over defaults, so keys added later always have a value. */
export async function loadSettings(token: string): Promise<ImageSettings> {
  const data = await staffGql<{ images_settings_by_pk: ImageSettings | null }>(
    token,
    `query { images_settings_by_pk(id: true) { ${SETTINGS_FIELDS} } }`,
  );
  const row = data.images_settings_by_pk;
  if (!row) {
    throw new Error("Image settings row is missing (run backend migrations 1790000000024/25)");
  }
  return { ...row, params: { ...DEFAULT_GENERATION_PARAMS, ...(row.params ?? {}) } };
}

export async function updateImageSettings(
  token: string,
  set: Partial<Omit<ImageSettings, "updated_at" | "updated_by">>,
): Promise<ImageSettings> {
  const data = await staffGql<{ update_images_settings_by_pk: ImageSettings | null }>(
    token,
    `mutation($set: images_settings_set_input!) {
      update_images_settings_by_pk(pk_columns: { id: true }, _set: $set) { ${SETTINGS_FIELDS} }
    }`,
    {
      set: {
        ...set,
        updated_at: new Date().toISOString(),
        updated_by: getUserIdFromToken(token),
      },
    },
  );
  if (!data.update_images_settings_by_pk) {
    throw new Error("Image settings row is missing (run backend migrations 1790000000024/25)");
  }
  return data.update_images_settings_by_pk;
}

export async function insertExerciseImage(
  token: string,
  input: {
    exo_id: number;
    file_id: string;
    image_url: string;
    model: string;
    prompt: string;
    params: GenerationSnapshot;
    usage?: Record<string, unknown> | null;
    created_by?: string | null;
    position?: number | null;
    active?: boolean;
  },
): Promise<ExerciseImage> {
  const data = await staffGql<{ insert_images_exercise_images_one: ExerciseImage }>(
    token,
    `mutation($object: images_exercise_images_insert_input!) {
      insert_images_exercise_images_one(object: $object) { ${IMAGE_FIELDS} }
    }`,
    {
      object: {
        exo_id: input.exo_id,
        file_id: input.file_id,
        image_url: input.image_url,
        model: input.model,
        prompt: input.prompt,
        params: input.params,
        usage: input.usage ?? null,
        created_by: input.created_by ?? null,
        position: input.position ?? null,
        active: Boolean(input.active),
      },
    },
  );
  return data.insert_images_exercise_images_one;
}

export async function getActiveImageAtPosition(
  token: string,
  exoId: number,
  position: number,
): Promise<ExerciseImage | null> {
  const data = await staffGql<{ images_exercise_images: ExerciseImage[] }>(
    token,
    `query($exoId: Int!, $position: smallint!) {
      images_exercise_images(
        where: { exo_id: { _eq: $exoId }, position: { _eq: $position }, active: { _eq: true } }
        limit: 1
      ) { ${IMAGE_FIELDS} }
    }`,
    { exoId, position },
  );
  return data.images_exercise_images?.[0] ?? null;
}

export async function getExerciseImage(token: string, id: string): Promise<ExerciseImage | null> {
  const data = await staffGql<{ images_exercise_images_by_pk: ExerciseImage | null }>(
    token,
    `query($id: uuid!) { images_exercise_images_by_pk(id: $id) { ${IMAGE_FIELDS} } }`,
    { id },
  );
  return data.images_exercise_images_by_pk;
}

export async function updateExerciseImage(
  token: string,
  id: string,
  set: Partial<{
    position: number | null;
    active: boolean;
    updated_at: string;
  }>,
): Promise<ExerciseImage> {
  const data = await staffGql<{ update_images_exercise_images_by_pk: ExerciseImage }>(
    token,
    `mutation($id: uuid!, $set: images_exercise_images_set_input!) {
      update_images_exercise_images_by_pk(pk_columns: { id: $id }, _set: $set) { ${IMAGE_FIELDS} }
    }`,
    {
      id,
      set: {
        ...set,
        updated_at: set.updated_at ?? new Date().toISOString(),
      },
    },
  );
  return data.update_images_exercise_images_by_pk;
}

/** Deactivate any other active image occupying the same (exo_id, position). */
export async function clearActivePosition(
  token: string,
  exoId: number,
  position: number,
  exceptId?: string,
): Promise<void> {
  const where = exceptId
    ? `{
        exo_id: { _eq: $exoId }
        position: { _eq: $position }
        active: { _eq: true }
        id: { _neq: $exceptId }
      }`
    : `{
        exo_id: { _eq: $exoId }
        position: { _eq: $position }
        active: { _eq: true }
      }`;
  const vars = exceptId
    ? "$exoId: Int!, $position: smallint!, $exceptId: uuid!, $updatedAt: timestamptz!"
    : "$exoId: Int!, $position: smallint!, $updatedAt: timestamptz!";
  await staffGql(
    token,
    `mutation(${vars}) {
      update_images_exercise_images(
        where: ${where}
        _set: { active: false, position: null, updated_at: $updatedAt }
      ) { affected_rows }
    }`,
    {
      exoId,
      position,
      ...(exceptId ? { exceptId } : {}),
      updatedAt: new Date().toISOString(),
    },
  );
}

export async function deleteExerciseImageRow(token: string, id: string): Promise<void> {
  const data = await staffGql<{ delete_images_exercise_images_by_pk: { id: string } | null }>(
    token,
    `mutation($id: uuid!) { delete_images_exercise_images_by_pk(id: $id) { id } }`,
    { id },
  );
  if (!data.delete_images_exercise_images_by_pk) {
    throw new Error("Image was not deleted (only images without a position can be deleted)");
  }
}

export function getUserIdFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    ) as { sub?: string; "https://hasura.io/jwt/claims"?: { "x-hasura-user-id"?: string } };
    return (
      payload["https://hasura.io/jwt/claims"]?.["x-hasura-user-id"] ??
      payload.sub ??
      null
    );
  } catch {
    return null;
  }
}
