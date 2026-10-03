import { staffGql } from "@/lib/staff-gql";
import { DEFAULT_GENERATION_PARAMS } from "./capabilities";
import { exerciseDetails, type ExerciseTaxonomy } from "./prompt";
import { MID_POSITION, SUBJECTS, framePositionsFor } from "./types";
import type {
  ExerciseImage,
  ExerciseImageBoardItem,
  ExerciseImageDetail,
  GenerationSnapshot,
  ImagePrompt,
  ImagePromptKind,
  ImageSettings,
  ImageStyle,
  Subject,
  SubjectFrameStatus,
} from "./types";

const IMAGE_FIELDS = `
  id
  style_id
  exo_id
  subject
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

const STYLE_FIELDS = `
  id
  code
  name
  published
  params
  system_prompt_id
  start_prompt_id
  mid_prompt_id
  end_prompt_id
  support_prompt_id
  logo_file_id
  logo_in_exercises
  inserted_at
  updated_at
  updated_by
  characters { subject file_id }
  supports {
    support_equipment_id
    file_id
    support_equipment { id code name description active }
  }
`;

const EXERCISE_FIELDS = `
  id
  exo_id
  display_name
  active
  primary_muscle_group { id name }
  equipment { id code name }
  support_equipment { id code name description }
  position { code name }
  grip { code name description }
  variation { code name }
  localizations { locale display_name description }
`;

type TaxonomyRef = {
  code: string | null;
  name: string;
  description?: string | null;
} | null;

type RawExercise = ExerciseTaxonomy & {
  id: string;
  exo_id: number;
  display_name: string;
  active: boolean;
  primary_muscle_group: { id: string; name: string } | null;
  equipment: ({ id: string } & NonNullable<TaxonomyRef>) | null;
  support_equipment: ({ id: string } & NonNullable<TaxonomyRef>) | null;
  position: TaxonomyRef;
  grip: TaxonomyRef;
  variation: TaxonomyRef;
  localizations: { locale: string; display_name: string; description: string | null }[];
};

function englishDescription(localizations: RawExercise["localizations"]): string {
  const en = localizations.find((item) => item.locale === "en");
  return (
    en?.description?.trim() || localizations.find((item) => item.description)?.description || ""
  );
}

function subjectStatus(
  images: ExerciseImage[],
  subject: Subject,
  framePositions: number[],
): SubjectFrameStatus {
  const subjectImages = images.filter((img) => img.subject === subject);
  const active = subjectImages
    .filter((img) => img.active && img.position != null && framePositions.includes(img.position))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const activePositions = new Set(active.map((img) => img.position));
  let status: SubjectFrameStatus["status"] = "empty";
  if (framePositions.every((p) => activePositions.has(p))) status = "complete";
  else if (active.length > 0) status = "partial";
  else if (subjectImages.length > 0) status = "inactive_only";
  return {
    subject,
    active_count: active.length,
    active_positions: active.map((img) => img.position as number),
    active_frames: active.map((img) => ({
      position: img.position as number,
      image_url: img.image_url,
    })),
    preview_image: active[0] ?? subjectImages.find((img) => img.active) ?? subjectImages[0] ?? null,
    status,
  };
}

function boardStatus(
  bySubject: SubjectFrameStatus[],
  images: ExerciseImage[],
): ExerciseImageBoardItem["status"] {
  if (bySubject.every((s) => s.status === "complete")) return "complete";
  if (bySubject.some((s) => s.status === "complete" || s.status === "partial")) return "partial";
  if (images.length > 0) return "inactive_only";
  return "empty";
}

function toBoardItem(
  exercise: RawExercise,
  images: ExerciseImage[],
  twoFrames: boolean,
): ExerciseImageBoardItem {
  const framePositions = framePositionsFor(twoFrames);
  const bySubject = SUBJECTS.map((subject) => subjectStatus(images, subject, framePositions));
  const active = images
    .filter((img) => img.active && img.position != null && framePositions.includes(img.position))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const preview =
    bySubject.find((s) => s.subject === "man")?.preview_image ??
    bySubject.find((s) => s.preview_image)?.preview_image ??
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
    by_subject: bySubject,
    prompt_details: exerciseDetails(exercise),
    two_frames: twoFrames,
    frame_positions: framePositions,
    status: boardStatus(bySubject, images),
  };
}

function normalizeStyle(row: ImageStyle): ImageStyle {
  return {
    ...row,
    params: { ...DEFAULT_GENERATION_PARAMS, ...(row.params ?? {}) },
    characters: row.characters ?? [],
    supports: row.supports ?? [],
  };
}

export async function listStyles(token: string): Promise<ImageStyle[]> {
  const data = await staffGql<{ images_styles: ImageStyle[] }>(
    token,
    `query {
      images_styles(order_by: [{ code: asc }]) { ${STYLE_FIELDS} }
    }`,
  );
  return (data.images_styles ?? []).map(normalizeStyle);
}

export async function getStyle(token: string, styleId: string): Promise<ImageStyle | null> {
  const data = await staffGql<{ images_styles_by_pk: ImageStyle | null }>(
    token,
    `query($id: uuid!) { images_styles_by_pk(id: $id) { ${STYLE_FIELDS} } }`,
    { id: styleId },
  );
  return data.images_styles_by_pk ? normalizeStyle(data.images_styles_by_pk) : null;
}

export async function getStyleByCode(token: string, code: string): Promise<ImageStyle | null> {
  const data = await staffGql<{ images_styles: ImageStyle[] }>(
    token,
    `query($code: String!) {
      images_styles(where: { code: { _eq: $code } }, limit: 1) { ${STYLE_FIELDS} }
    }`,
    { code },
  );
  const row = data.images_styles?.[0];
  return row ? normalizeStyle(row) : null;
}

export async function createStyle(
  token: string,
  input: {
    code: string;
    name: string;
    copyFromStyleId?: string | null;
  },
): Promise<ImageStyle> {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]*$/.test(code)) {
    throw new Error("Style code must be SCREAMING_SNAKE (e.g. TWINFIT)");
  }
  let source: ImageStyle | null = null;
  if (input.copyFromStyleId) {
    source = await getStyle(token, input.copyFromStyleId);
    if (!source) throw new Error("Source style not found");
  }
  const data = await staffGql<{ insert_images_styles_one: ImageStyle }>(
    token,
    `mutation($object: images_styles_insert_input!) {
      insert_images_styles_one(object: $object) { ${STYLE_FIELDS} }
    }`,
    {
      object: {
        code,
        name: input.name.trim() || code,
        published: false,
        params: source?.params ?? DEFAULT_GENERATION_PARAMS,
        system_prompt_id: source?.system_prompt_id ?? null,
        start_prompt_id: source?.start_prompt_id ?? null,
        mid_prompt_id: source?.mid_prompt_id ?? null,
        end_prompt_id: source?.end_prompt_id ?? null,
        support_prompt_id: source?.support_prompt_id ?? null,
        logo_in_exercises: source?.logo_in_exercises ?? false,
        updated_at: new Date().toISOString(),
        updated_by: getUserIdFromToken(token),
      },
    },
  );
  return normalizeStyle(data.insert_images_styles_one);
}

export async function updateStyle(
  token: string,
  styleId: string,
  set: Partial<
    Pick<
      ImageStyle,
      | "name"
      | "published"
      | "params"
      | "system_prompt_id"
      | "start_prompt_id"
      | "mid_prompt_id"
      | "end_prompt_id"
      | "support_prompt_id"
      | "logo_file_id"
      | "logo_in_exercises"
    >
  >,
): Promise<ImageStyle> {
  const data = await staffGql<{ update_images_styles_by_pk: ImageStyle | null }>(
    token,
    `mutation($id: uuid!, $set: images_styles_set_input!) {
      update_images_styles_by_pk(pk_columns: { id: $id }, _set: $set) { ${STYLE_FIELDS} }
    }`,
    {
      id: styleId,
      set: {
        ...set,
        updated_at: new Date().toISOString(),
        updated_by: getUserIdFromToken(token),
      },
    },
  );
  if (!data.update_images_styles_by_pk) throw new Error("Style not found");
  return normalizeStyle(data.update_images_styles_by_pk);
}

export async function deleteStyle(token: string, styleId: string): Promise<void> {
  const settings = await loadSettings(token);
  if (settings.default_style_id === styleId) {
    throw new Error("Cannot delete the default style");
  }
  const data = await staffGql<{
    images_exercise_images_aggregate: { aggregate: { count: number } | null };
  }>(
    token,
    `query($styleId: uuid!) {
      images_exercise_images_aggregate(where: { style_id: { _eq: $styleId } }) {
        aggregate { count }
      }
    }`,
    { styleId },
  );
  if ((data.images_exercise_images_aggregate.aggregate?.count ?? 0) > 0) {
    throw new Error("Cannot delete a style that still has frames");
  }
  await staffGql(token, `mutation($id: uuid!) { delete_images_styles_by_pk(id: $id) { id } }`, {
    id: styleId,
  });
}

export async function listImageExercises(
  token: string,
  styleId: string,
): Promise<ExerciseImageBoardItem[]> {
  const data = await staffGql<{
    catalog_exercises: RawExercise[];
    images_exercise_images: ExerciseImage[];
    images_exercise_options: { exo_id: number; two_frames: boolean }[];
  }>(
    token,
    `query($styleId: uuid!) {
      images_exercise_options(where: { two_frames: { _eq: true } }) { exo_id two_frames }
      catalog_exercises(order_by: [{ exo_id: asc }]) {
        ${EXERCISE_FIELDS}
      }
      images_exercise_images(
        where: { style_id: { _eq: $styleId } }
        order_by: [{ created_at: desc }]
      ) {
        ${IMAGE_FIELDS}
      }
    }`,
    { styleId },
  );

  const byExo = new Map<number, ExerciseImage[]>();
  for (const img of data.images_exercise_images ?? []) {
    const list = byExo.get(img.exo_id) ?? [];
    list.push(img);
    byExo.set(img.exo_id, list);
  }

  const twoFrames = new Set((data.images_exercise_options ?? []).map((o) => o.exo_id));
  return (data.catalog_exercises ?? []).map((ex) =>
    toBoardItem(ex, byExo.get(ex.exo_id) ?? [], twoFrames.has(ex.exo_id)),
  );
}

export async function getImageExercise(
  token: string,
  exoId: number,
  styleId: string,
): Promise<ExerciseImageDetail | null> {
  const data = await staffGql<{
    catalog_exercises: RawExercise[];
    images_exercise_images: ExerciseImage[];
    images_exercise_options_by_pk: { two_frames: boolean } | null;
  }>(
    token,
    `query($exoId: Int!, $styleId: uuid!) {
      images_exercise_options_by_pk(exo_id: $exoId) { two_frames }
      catalog_exercises(where: { exo_id: { _eq: $exoId } }, limit: 1) {
        ${EXERCISE_FIELDS}
      }
      images_exercise_images(
        where: { exo_id: { _eq: $exoId }, style_id: { _eq: $styleId } }
        order_by: [{ active: desc }, { position: asc_nulls_last }, { created_at: desc }]
      ) {
        ${IMAGE_FIELDS}
      }
    }`,
    { exoId, styleId },
  );

  const exercise = data.catalog_exercises?.[0];
  if (!exercise) return null;

  const images = data.images_exercise_images ?? [];
  return {
    ...toBoardItem(exercise, images, Boolean(data.images_exercise_options_by_pk?.two_frames)),
    images,
    localizations: exercise.localizations ?? [],
  };
}

export async function getExerciseSummary(
  token: string,
  exoId: number,
): Promise<RawExercise | null> {
  const data = await staffGql<{ catalog_exercises: RawExercise[] }>(
    token,
    `query($exoId: Int!) {
      catalog_exercises(where: { exo_id: { _eq: $exoId } }, limit: 1) {
        ${EXERCISE_FIELDS}
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
  await staffGql(token, `mutation($id: uuid!) { delete_images_prompts_by_pk(id: $id) { id } }`, {
    id,
  });
}

export async function loadSettings(token: string): Promise<ImageSettings> {
  const data = await staffGql<{ images_settings_by_pk: ImageSettings | null }>(
    token,
    `query {
      images_settings_by_pk(id: true) {
        default_style_id
        max_concurrency
        updated_at
        updated_by
      }
    }`,
  );
  const row = data.images_settings_by_pk;
  if (!row) {
    throw new Error("Image settings row is missing (run backend migration 1790000000027)");
  }
  return row;
}

export async function updateImageSettings(
  token: string,
  set: Partial<Pick<ImageSettings, "default_style_id" | "max_concurrency">>,
): Promise<ImageSettings> {
  const data = await staffGql<{ update_images_settings_by_pk: ImageSettings | null }>(
    token,
    `mutation($set: images_settings_set_input!) {
      update_images_settings_by_pk(pk_columns: { id: true }, _set: $set) {
        default_style_id
        max_concurrency
        updated_at
        updated_by
      }
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
    throw new Error("Image settings row is missing (run backend migration 1790000000027)");
  }
  return data.update_images_settings_by_pk;
}

export async function insertExerciseImage(
  token: string,
  input: {
    style_id: string;
    exo_id: number;
    subject: Subject;
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
        style_id: input.style_id,
        exo_id: input.exo_id,
        subject: input.subject,
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

export async function isTwoFrameExercise(token: string, exoId: number): Promise<boolean> {
  const data = await staffGql<{ images_exercise_options_by_pk: { two_frames: boolean } | null }>(
    token,
    `query($exoId: Int!) { images_exercise_options_by_pk(exo_id: $exoId) { two_frames } }`,
    { exoId },
  );
  return Boolean(data.images_exercise_options_by_pk?.two_frames);
}

/** Enabling two frames also deactivates the Mid frame so the sequence is Start + End. */
export async function setTwoFrames(token: string, exoId: number, twoFrames: boolean) {
  await staffGql(
    token,
    `mutation($object: images_exercise_options_insert_input!) {
      insert_images_exercise_options_one(
        object: $object
        on_conflict: {
          constraint: exercise_options_pkey
          update_columns: [two_frames, updated_at, updated_by]
        }
      ) { exo_id }
    }`,
    {
      object: {
        exo_id: exoId,
        two_frames: twoFrames,
        updated_at: new Date().toISOString(),
        updated_by: getUserIdFromToken(token),
      },
    },
  );
  if (twoFrames) {
    // Clear Mid for every style/subject of this exercise.
    await staffGql(
      token,
      `mutation($exoId: Int!, $position: smallint!, $updatedAt: timestamptz!) {
        update_images_exercise_images(
          where: {
            exo_id: { _eq: $exoId }
            position: { _eq: $position }
            active: { _eq: true }
          }
          _set: { active: false, position: null, updated_at: $updatedAt }
        ) { affected_rows }
      }`,
      { exoId, position: MID_POSITION, updatedAt: new Date().toISOString() },
    );
  }
}

export async function getActiveImageAtPosition(
  token: string,
  styleId: string,
  exoId: number,
  subject: Subject,
  position: number,
): Promise<ExerciseImage | null> {
  const data = await staffGql<{ images_exercise_images: ExerciseImage[] }>(
    token,
    `query($styleId: uuid!, $exoId: Int!, $subject: String!, $position: smallint!) {
      images_exercise_images(
        where: {
          style_id: { _eq: $styleId }
          exo_id: { _eq: $exoId }
          subject: { _eq: $subject }
          position: { _eq: $position }
          active: { _eq: true }
        }
        limit: 1
      ) { ${IMAGE_FIELDS} }
    }`,
    { styleId, exoId, subject, position },
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

/** Deactivate any other active image occupying the same (style, exo, subject, position). */
export async function clearActivePosition(
  token: string,
  styleId: string,
  exoId: number,
  subject: Subject,
  position: number,
  exceptId?: string,
): Promise<void> {
  const where = exceptId
    ? `{
        style_id: { _eq: $styleId }
        exo_id: { _eq: $exoId }
        subject: { _eq: $subject }
        position: { _eq: $position }
        active: { _eq: true }
        id: { _neq: $exceptId }
      }`
    : `{
        style_id: { _eq: $styleId }
        exo_id: { _eq: $exoId }
        subject: { _eq: $subject }
        position: { _eq: $position }
        active: { _eq: true }
      }`;
  const vars = exceptId
    ? "$styleId: uuid!, $exoId: Int!, $subject: String!, $position: smallint!, $exceptId: uuid!, $updatedAt: timestamptz!"
    : "$styleId: uuid!, $exoId: Int!, $subject: String!, $position: smallint!, $updatedAt: timestamptz!";
  await staffGql(
    token,
    `mutation(${vars}) {
      update_images_exercise_images(
        where: ${where}
        _set: { active: false, position: null, updated_at: $updatedAt }
      ) { affected_rows }
    }`,
    {
      styleId,
      exoId,
      subject,
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
    return payload["https://hasura.io/jwt/claims"]?.["x-hasura-user-id"] ?? payload.sub ?? null;
  } catch {
    return null;
  }
}

export async function listActiveSupportEquipment(
  token: string,
): Promise<{ id: string; code: string; name: string; description: string | null }[]> {
  const data = await staffGql<{
    catalog_support_equipment: {
      id: string;
      code: string;
      name: string;
      description: string | null;
    }[];
  }>(
    token,
    `query {
      catalog_support_equipment(
        where: { active: { _eq: true } }
        order_by: [{ sort_order: asc }, { code: asc }]
      ) { id code name description }
    }`,
  );
  return data.catalog_support_equipment ?? [];
}
