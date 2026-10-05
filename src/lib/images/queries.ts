import { staffGql } from "@/lib/staff-gql";
import { DEFAULT_GENERATION_PARAMS } from "./capabilities";
import { exerciseDetails, type ExerciseTaxonomy } from "./prompt";
import { MID_POSITION, SUBJECTS, framePositionsFor, resolveTwoFrames } from "./types";
import type {
  ExerciseImage,
  ExerciseImageBoardItem,
  ExerciseImageDetail,
  GenerationSnapshot,
  ImagePrompt,
  ImageSettings,
  ImageStyle,
  StylePrompts,
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
  style_id
  kind
  position
  content
  inserted_at
  updated_at
`;

const STYLE_FIELDS = `
  id
  code
  name
  published
  is_default
  params
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

async function getDefaultStyle(token: string): Promise<ImageStyle | null> {
  const data = await staffGql<{ images_styles: ImageStyle[] }>(
    token,
    `query {
      images_styles(where: { is_default: { _eq: true } }, limit: 1) { ${STYLE_FIELDS} }
    }`,
  );
  const row = data.images_styles?.[0];
  return row ? normalizeStyle(row) : null;
}

/** Build the required slots from a style's prompt rows. */
export function getStylePrompts(prompts: ImagePrompt[]): StylePrompts {
  const system = prompts.find((p) => p.kind === "system");
  const start = prompts.find((p) => p.kind === "position" && p.position === 0);
  const mid = prompts.find((p) => p.kind === "position" && p.position === 1);
  const end = prompts.find((p) => p.kind === "position" && p.position === 2);
  const support = prompts.find((p) => p.kind === "support");
  const muscleBase = prompts.find((p) => p.kind === "muscle_base");
  const muscleMap = prompts.find((p) => p.kind === "muscle_map");
  if (!system || !start || !mid || !end || !support || !muscleBase || !muscleMap) {
    throw new Error("Style is missing one or more required prompt slots");
  }
  return { system, start, mid, end, support, muscleBase, muscleMap };
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
  } else {
    source = await getDefaultStyle(token);
  }
  const sourcePrompts = source ? await listImagePrompts(token, source.id) : [];
  if (sourcePrompts.length === 0) {
    throw new Error("No source prompts to clone (need a default style or copyFromStyleId)");
  }
  const slots = getStylePrompts(sourcePrompts);

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
        is_default: false,
        params: source?.params ?? DEFAULT_GENERATION_PARAMS,
        logo_in_exercises: source?.logo_in_exercises ?? false,
        updated_at: new Date().toISOString(),
        updated_by: getUserIdFromToken(token),
      },
    },
  );
  const created = normalizeStyle(data.insert_images_styles_one);

  const clones = Object.values(slots).map((p) => ({
    style_id: created.id,
    kind: p.kind,
    position: p.position,
    content: p.content,
  }));
  await staffGql(
    token,
    `mutation($objects: [images_prompts_insert_input!]!) {
      insert_images_prompts(objects: $objects) { affected_rows }
    }`,
    { objects: clones },
  );

  return created;
}

export async function updateStyle(
  token: string,
  styleId: string,
  set: Partial<
    Pick<
      ImageStyle,
      "name" | "published" | "is_default" | "params" | "logo_file_id" | "logo_in_exercises"
    >
  >,
): Promise<ImageStyle> {
  const current = await getStyle(token, styleId);
  if (!current) throw new Error("Style not found");

  if (current.is_default && set.published === false) {
    throw new Error("Cannot unpublish the default style");
  }
  if (current.is_default && set.is_default === false) {
    throw new Error("Cannot unset default without choosing another default style");
  }
  if (set.is_default === true) {
    set = { ...set, published: true };
  }

  if (set.is_default === true) {
    await staffGql(
      token,
      `mutation($updatedAt: timestamptz!, $updatedBy: uuid) {
        update_images_styles(
          where: { is_default: { _eq: true } }
          _set: { is_default: false, updated_at: $updatedAt, updated_by: $updatedBy }
        ) { affected_rows }
      }`,
      {
        updatedAt: new Date().toISOString(),
        updatedBy: getUserIdFromToken(token),
      },
    );
  }

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
  const style = await getStyle(token, styleId);
  if (!style) throw new Error("Style not found");
  if (style.is_default) {
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
      images_exercise_options { exo_id two_frames }
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

  const options = new Map(
    (data.images_exercise_options ?? []).map((o) => [o.exo_id, o.two_frames] as const),
  );
  return (data.catalog_exercises ?? []).map((ex) => {
    const images = byExo.get(ex.exo_id) ?? [];
    return toBoardItem(
      ex,
      images,
      resolveTwoFrames(options.get(ex.exo_id), images.length > 0),
    );
  });
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
    ...toBoardItem(
      exercise,
      images,
      resolveTwoFrames(data.images_exercise_options_by_pk?.two_frames, images.length > 0),
    ),
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

export async function listImagePrompts(
  token: string,
  styleId?: string,
): Promise<ImagePrompt[]> {
  if (styleId) {
    const data = await staffGql<{ images_prompts: ImagePrompt[] }>(
      token,
      `query($styleId: uuid!) {
        images_prompts(
          where: { style_id: { _eq: $styleId } }
          order_by: [{ kind: asc }, { position: asc_nulls_first }]
        ) { ${PROMPT_FIELDS} }
      }`,
      { styleId },
    );
    return data.images_prompts ?? [];
  }
  const data = await staffGql<{ images_prompts: ImagePrompt[] }>(
    token,
    `query {
      images_prompts(order_by: [{ kind: asc }, { position: asc_nulls_first }]) {
        ${PROMPT_FIELDS}
      }
    }`,
  );
  return data.images_prompts ?? [];
}

export async function listImagePromptsForStyle(
  token: string,
  styleId: string,
): Promise<StylePrompts> {
  return getStylePrompts(await listImagePrompts(token, styleId));
}

export async function getImagePrompt(token: string, id: string): Promise<ImagePrompt | null> {
  const data = await staffGql<{ images_prompts_by_pk: ImagePrompt | null }>(
    token,
    `query($id: uuid!) { images_prompts_by_pk(id: $id) { ${PROMPT_FIELDS} } }`,
    { id },
  );
  return data.images_prompts_by_pk;
}

export async function updateImagePrompt(
  token: string,
  id: string,
  input: { content?: string },
): Promise<ImagePrompt> {
  const data = await staffGql<{ update_images_prompts_by_pk: ImagePrompt }>(
    token,
    `mutation($id: uuid!, $set: images_prompts_set_input!) {
      update_images_prompts_by_pk(pk_columns: { id: $id }, _set: $set) { ${PROMPT_FIELDS} }
    }`,
    {
      id,
      set: {
        ...(input.content !== undefined ? { content: input.content } : {}),
        updated_at: new Date().toISOString(),
      },
    },
  );
  return data.update_images_prompts_by_pk;
}

export async function loadSettings(token: string): Promise<ImageSettings> {
  const data = await staffGql<{ images_settings_by_pk: ImageSettings | null }>(
    token,
    `query {
      images_settings_by_pk(id: true) {
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
  set: Partial<Pick<ImageSettings, "max_concurrency">>,
): Promise<ImageSettings> {
  const data = await staffGql<{ update_images_settings_by_pk: ImageSettings | null }>(
    token,
    `mutation($set: images_settings_set_input!) {
      update_images_settings_by_pk(pk_columns: { id: true }, _set: $set) {
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

export async function isTwoFrameExercise(
  token: string,
  exoId: number,
  styleId?: string,
): Promise<boolean> {
  const data = await staffGql<{
    images_exercise_options_by_pk: { two_frames: boolean } | null;
    images_exercise_images_aggregate: { aggregate: { count: number } | null };
  }>(
    token,
    `query($exoId: Int!, $styleWhere: images_exercise_images_bool_exp!) {
      images_exercise_options_by_pk(exo_id: $exoId) { two_frames }
      images_exercise_images_aggregate(where: $styleWhere) { aggregate { count } }
    }`,
    {
      exoId,
      styleWhere: styleId
        ? { exo_id: { _eq: exoId }, style_id: { _eq: styleId } }
        : { exo_id: { _eq: exoId } },
    },
  );
  return resolveTwoFrames(
    data.images_exercise_options_by_pk?.two_frames,
    (data.images_exercise_images_aggregate.aggregate?.count ?? 0) > 0,
  );
}

/** Persist two_frames=true for empty exercises so the default sticks after the first image. */
export async function ensureTwoFramesDefault(
  token: string,
  exoId: number,
  styleId: string,
): Promise<boolean> {
  const data = await staffGql<{
    images_exercise_options_by_pk: { two_frames: boolean } | null;
    images_exercise_images_aggregate: { aggregate: { count: number } | null };
  }>(
    token,
    `query($exoId: Int!, $styleId: uuid!) {
      images_exercise_options_by_pk(exo_id: $exoId) { two_frames }
      images_exercise_images_aggregate(
        where: { exo_id: { _eq: $exoId }, style_id: { _eq: $styleId } }
      ) { aggregate { count } }
    }`,
    { exoId, styleId },
  );
  if (data.images_exercise_options_by_pk != null) {
    return data.images_exercise_options_by_pk.two_frames;
  }
  const hasImages = (data.images_exercise_images_aggregate.aggregate?.count ?? 0) > 0;
  if (!hasImages) {
    await setTwoFrames(token, exoId, true);
    return true;
  }
  return false;
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
