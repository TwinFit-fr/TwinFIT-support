import { staffGql } from "@/lib/staff-gql";
import { type MuscleMapTarget, muscleGroupTarget, muscleTarget } from "./prompt";
import { MUSCLE_MAP_VIEWS } from "./types";
import type {
  MuscleMapBoardRow,
  MuscleMapBoardTarget,
  MuscleMapImage,
  MuscleMapSnapshot,
  MuscleMapTargetRef,
  MuscleMapView,
} from "./types";

const MUSCLE_MAP_FIELDS = `
  id
  style_id
  muscle_id
  muscle_group_id
  view
  file_id
  image_url
  active
  model
  prompt
  params
  usage
  created_by
  created_at
  updated_at
`;

type CatalogMuscle = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
};

type CatalogGroup = CatalogMuscle & {
  group_muscles: { role: string; muscle: CatalogMuscle }[];
};

const GROUP_FIELDS = `
  id code name description active
  group_muscles(order_by: { muscle: { sort_order: asc } }) {
    role
    muscle { id code name description active }
  }
`;

/** Hasura filter selecting the maps of one target. */
function targetWhere(ref: MuscleMapTargetRef) {
  return ref.kind === "muscle"
    ? { muscle_id: { _eq: ref.id } }
    : { muscle_group_id: { _eq: ref.id } };
}

function targetOf(image: MuscleMapImage): MuscleMapTargetRef {
  return image.muscle_id
    ? { kind: "muscle", id: image.muscle_id }
    : { kind: "muscle_group", id: image.muscle_group_id as string };
}

function boardTarget(
  ref: MuscleMapTargetRef,
  row: CatalogMuscle,
  images: MuscleMapImage[],
): MuscleMapBoardTarget {
  const active: MuscleMapBoardTarget["active"] = {};
  for (const image of images) {
    if (image.active) active[image.view] = image;
  }
  const activeCount = MUSCLE_MAP_VIEWS.filter((view) => active[view]).length;
  return {
    ...ref,
    code: row.code,
    name: row.name,
    description: row.description,
    images,
    active,
    status:
      activeCount === MUSCLE_MAP_VIEWS.length
        ? "complete"
        : activeCount > 0
          ? "partial"
          : images.length > 0
            ? "inactive_only"
            : "empty",
  };
}

/** Active groups with the muscles whose home they are, then muscles without a home. */
export async function listMuscleMapBoard(
  token: string,
  styleId: string,
): Promise<MuscleMapBoardRow[]> {
  const data = await staffGql<{
    catalog_muscle_groups: CatalogGroup[];
    catalog_muscles: CatalogMuscle[];
    images_muscle_map_images: MuscleMapImage[];
  }>(
    token,
    `query($styleId: uuid!) {
      catalog_muscle_groups(
        where: { active: { _eq: true } }
        order_by: [{ sort_order: asc }, { code: asc }]
      ) { ${GROUP_FIELDS} }
      catalog_muscles(
        where: { active: { _eq: true } }
        order_by: [{ sort_order: asc }, { code: asc }]
      ) { id code name description active }
      images_muscle_map_images(
        where: { style_id: { _eq: $styleId } }
        order_by: [{ created_at: desc }]
      ) { ${MUSCLE_MAP_FIELDS} }
    }`,
    { styleId },
  );

  const imagesByTarget = new Map<string, MuscleMapImage[]>();
  for (const image of data.images_muscle_map_images ?? []) {
    const ref = targetOf(image);
    const key = `${ref.kind}:${ref.id}`;
    imagesByTarget.set(key, [...(imagesByTarget.get(key) ?? []), image]);
  }
  const target = (ref: MuscleMapTargetRef, row: CatalogMuscle) =>
    boardTarget(ref, row, imagesByTarget.get(`${ref.kind}:${ref.id}`) ?? []);

  const housed = new Set<string>();
  const rows: MuscleMapBoardRow[] = (data.catalog_muscle_groups ?? []).map((group) => {
    const muscles = group.group_muscles
      .filter((link) => link.role === "target" && link.muscle.active)
      .map((link) => {
        housed.add(link.muscle.id);
        return target({ kind: "muscle", id: link.muscle.id }, link.muscle);
      });
    return { group: target({ kind: "muscle_group", id: group.id }, group), muscles };
  });
  const homeless = (data.catalog_muscles ?? []).filter((m) => !housed.has(m.id));
  if (homeless.length) {
    rows.push({
      group: null,
      muscles: homeless.map((m) => target({ kind: "muscle", id: m.id }, m)),
    });
  }
  return rows;
}

/** Catalog data a map prompt needs; null when the target does not exist. */
export async function getMuscleMapTarget(
  token: string,
  ref: MuscleMapTargetRef,
): Promise<(MuscleMapTarget & { code: string }) | null> {
  if (ref.kind === "muscle") {
    const data = await staffGql<{ catalog_muscles_by_pk: CatalogMuscle | null }>(
      token,
      `query($id: uuid!) {
        catalog_muscles_by_pk(id: $id) { id code name description active }
      }`,
      { id: ref.id },
    );
    const muscle = data.catalog_muscles_by_pk;
    return muscle ? { ...muscleTarget(muscle), code: muscle.code } : null;
  }
  const data = await staffGql<{ catalog_muscle_groups_by_pk: CatalogGroup | null }>(
    token,
    `query($id: uuid!) { catalog_muscle_groups_by_pk(id: $id) { ${GROUP_FIELDS} } }`,
    { id: ref.id },
  );
  const group = data.catalog_muscle_groups_by_pk;
  return group ? { ...muscleGroupTarget(group), code: group.code } : null;
}

export async function getMuscleMapImage(
  token: string,
  id: string,
): Promise<MuscleMapImage | null> {
  const data = await staffGql<{ images_muscle_map_images_by_pk: MuscleMapImage | null }>(
    token,
    `query($id: uuid!) { images_muscle_map_images_by_pk(id: $id) { ${MUSCLE_MAP_FIELDS} } }`,
    { id },
  );
  return data.images_muscle_map_images_by_pk;
}

export async function insertMuscleMapImage(
  token: string,
  input: {
    style_id: string;
    target: MuscleMapTargetRef;
    view: MuscleMapView;
    file_id: string;
    image_url: string;
    model: string;
    prompt: string;
    params: MuscleMapSnapshot;
    usage?: Record<string, unknown> | null;
    created_by?: string | null;
    /** False for a candidate: kept in history, the active map stays. */
    active?: boolean;
  },
): Promise<MuscleMapImage> {
  const data = await staffGql<{ insert_images_muscle_map_images_one: MuscleMapImage }>(
    token,
    `mutation($object: images_muscle_map_images_insert_input!) {
      insert_images_muscle_map_images_one(object: $object) { ${MUSCLE_MAP_FIELDS} }
    }`,
    {
      object: {
        style_id: input.style_id,
        muscle_id: input.target.kind === "muscle" ? input.target.id : null,
        muscle_group_id: input.target.kind === "muscle_group" ? input.target.id : null,
        view: input.view,
        file_id: input.file_id,
        image_url: input.image_url,
        model: input.model,
        prompt: input.prompt,
        params: input.params,
        usage: input.usage ?? null,
        created_by: input.created_by ?? null,
        active: input.active ?? true,
      },
    },
  );
  return data.insert_images_muscle_map_images_one;
}

/** Deactivate the active map of (style, target, view), except `exceptId`. */
export async function clearActiveMuscleMap(
  token: string,
  styleId: string,
  target: MuscleMapTargetRef,
  view: MuscleMapView,
  exceptId?: string,
): Promise<void> {
  await staffGql(
    token,
    `mutation($where: images_muscle_map_images_bool_exp!) {
      update_images_muscle_map_images(where: $where, _set: { active: false }) { affected_rows }
    }`,
    {
      where: {
        style_id: { _eq: styleId },
        view: { _eq: view },
        active: { _eq: true },
        ...targetWhere(target),
        ...(exceptId ? { id: { _neq: exceptId } } : {}),
      },
    },
  );
}

/** Make `image` the active map of its target and view (or deactivate it). */
export async function setMuscleMapActive(
  token: string,
  image: MuscleMapImage,
  active: boolean,
): Promise<MuscleMapImage> {
  if (active) {
    await clearActiveMuscleMap(token, image.style_id, targetOf(image), image.view, image.id);
  }
  const data = await staffGql<{ update_images_muscle_map_images_by_pk: MuscleMapImage }>(
    token,
    `mutation($id: uuid!, $active: Boolean!) {
      update_images_muscle_map_images_by_pk(pk_columns: { id: $id }, _set: { active: $active }) {
        ${MUSCLE_MAP_FIELDS}
      }
    }`,
    { id: image.id, active },
  );
  return data.update_images_muscle_map_images_by_pk;
}

export async function deleteMuscleMapImageRow(token: string, id: string): Promise<void> {
  const data = await staffGql<{ delete_images_muscle_map_images_by_pk: { id: string } | null }>(
    token,
    `mutation($id: uuid!) { delete_images_muscle_map_images_by_pk(id: $id) { id } }`,
    { id },
  );
  if (!data.delete_images_muscle_map_images_by_pk) {
    throw new Error("Muscle map was not deleted (deactivate it first)");
  }
}

export async function countStyleMuscleMaps(token: string, styleId: string): Promise<number> {
  const data = await staffGql<{
    images_muscle_map_images_aggregate: { aggregate: { count: number } | null };
  }>(
    token,
    `query($styleId: uuid!) {
      images_muscle_map_images_aggregate(where: { style_id: { _eq: $styleId } }) {
        aggregate { count }
      }
    }`,
    { styleId },
  );
  return data.images_muscle_map_images_aggregate.aggregate?.count ?? 0;
}
