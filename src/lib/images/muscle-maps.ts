import { staffGql } from "@/lib/staff-gql";
import {
  type MuscleMapTarget,
  bodyRegionTarget,
  muscleGroupTarget,
  muscleTarget,
} from "./prompt";
import {
  MUSCLE_MAP_CROPS,
  MUSCLE_MAP_TARGET_COLUMN,
  MUSCLE_MAP_VIEWS,
  muscleMapCardSlot,
  muscleMapSlotKey,
  muscleMapSlots,
  muscleMapTargetColumns,
  muscleMapTargetKey,
  muscleMapTargetOf,
} from "./types";
import type {
  MuscleMapBoard,
  MuscleMapBoardRow,
  MuscleMapBoardTarget,
  MuscleMapChoices,
  MuscleMapImage,
  MuscleMapSlot,
  MuscleMapSnapshot,
  MuscleMapTargetRef,
} from "./types";

const MUSCLE_MAP_FIELDS = `
  id
  style_id
  muscle_id
  muscle_group_id
  body_region_id
  view
  crop
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

type CatalogRegion = CatalogMuscle & {
  muscle_groups: CatalogGroup[];
};

type BoardMuscle = CatalogMuscle & MuscleMapChoices;
type BoardGroup = BoardMuscle & {
  body_region_id: string;
  group_muscles: { role: string; muscle: BoardMuscle }[];
};

const MAP_CHOICE_FIELDS = "map_views map_crops map_view map_crop";
const BOARD_MUSCLE_FIELDS = `id code name description active ${MAP_CHOICE_FIELDS}`;

const GROUP_FIELDS = `
  id code name description active
  group_muscles(order_by: { muscle: { sort_order: asc } }) {
    role
    muscle { id code name description active }
  }
`;

const REGION_FIELDS = `
  id code name description active
  muscle_groups(order_by: [{ sort_order: asc }, { code: asc }]) { ${GROUP_FIELDS} }
`;

/** Hasura filter selecting the maps of one target. */
function targetWhere(ref: MuscleMapTargetRef) {
  return { [MUSCLE_MAP_TARGET_COLUMN[ref.kind]]: { _eq: ref.id } };
}

function targetOf(image: MuscleMapImage): MuscleMapTargetRef {
  const ref = muscleMapTargetOf(image);
  if (!ref) throw new Error(`Muscle map ${image.id} has no target`);
  return ref;
}

function boardTarget(
  ref: MuscleMapTargetRef,
  row: BoardMuscle,
  card: MuscleMapSlot,
  images: MuscleMapImage[],
): MuscleMapBoardTarget {
  const slots = muscleMapSlots(row.map_views, row.map_crops);
  const active: MuscleMapBoardTarget["active"] = {};
  for (const image of images) {
    if (image.active) active[muscleMapSlotKey(image)] = image;
  }
  const activeCount = slots.filter((slot) => active[muscleMapSlotKey(slot)]).length;
  return {
    ...ref,
    code: row.code,
    name: row.name,
    description: row.description,
    slots,
    card,
    images,
    active,
    status:
      activeCount === slots.length
        ? "complete"
        : activeCount > 0
          ? "partial"
          : images.length > 0
            ? "inactive_only"
            : "empty",
  };
}

/**
 * Active body regions (their catalog cards), then active groups with the muscles whose home
 * they are, then muscles without a home. Each target has the maps its catalog row allows.
 */
export async function listMuscleMapBoard(token: string, styleId: string): Promise<MuscleMapBoard> {
  const data = await staffGql<{
    catalog_body_regions: BoardMuscle[];
    catalog_muscle_groups: BoardGroup[];
    catalog_muscles: BoardMuscle[];
    images_muscle_map_images: MuscleMapImage[];
  }>(
    token,
    `query($styleId: uuid!) {
      catalog_body_regions(
        where: { active: { _eq: true } }
        order_by: [{ sort_order: asc }, { code: asc }]
      ) { ${BOARD_MUSCLE_FIELDS} }
      catalog_muscle_groups(
        where: { active: { _eq: true } }
        order_by: [{ sort_order: asc }, { code: asc }]
      ) {
        ${BOARD_MUSCLE_FIELDS} body_region_id
        group_muscles(order_by: { muscle: { sort_order: asc } }) {
          role
          muscle { ${BOARD_MUSCLE_FIELDS} }
        }
      }
      catalog_muscles(
        where: { active: { _eq: true } }
        order_by: [{ sort_order: asc }, { code: asc }]
      ) { ${BOARD_MUSCLE_FIELDS} }
      images_muscle_map_images(
        where: { style_id: { _eq: $styleId } }
        order_by: [{ created_at: desc }]
      ) { ${MUSCLE_MAP_FIELDS} }
    }`,
    { styleId },
  );

  const imagesByTarget = new Map<string, MuscleMapImage[]>();
  for (const image of data.images_muscle_map_images ?? []) {
    const key = muscleMapTargetKey(targetOf(image));
    imagesByTarget.set(key, [...(imagesByTarget.get(key) ?? []), image]);
  }
  const target = (ref: MuscleMapTargetRef, row: BoardMuscle, inherited?: MuscleMapSlot | null) =>
    boardTarget(
      ref,
      row,
      muscleMapCardSlot(row, inherited),
      imagesByTarget.get(muscleMapTargetKey(ref)) ?? [],
    );

  const regions = (data.catalog_body_regions ?? []).map((region) =>
    target({ kind: "body_region", id: region.id }, region),
  );
  const regionCard = new Map(regions.map((region) => [region.id, region.card]));

  const housed = new Set<string>();
  const rows: MuscleMapBoardRow[] = (data.catalog_muscle_groups ?? []).map((group) => {
    // A group's card falls back to its region's, a muscle's to its home group's.
    const groupTarget = target(
      { kind: "muscle_group", id: group.id },
      group,
      regionCard.get(group.body_region_id),
    );
    const muscles = group.group_muscles
      .filter((link) => link.role === "target" && link.muscle.active)
      .map((link) => {
        housed.add(link.muscle.id);
        return target({ kind: "muscle", id: link.muscle.id }, link.muscle, groupTarget.card);
      });
    return { group: groupTarget, muscles };
  });
  const homeless = (data.catalog_muscles ?? []).filter((m) => !housed.has(m.id));
  if (homeless.length) {
    rows.push({
      group: null,
      muscles: homeless.map((m) => target({ kind: "muscle", id: m.id }, m)),
    });
  }
  return { regions, rows };
}

/** Catalog data a map prompt needs; null when the target does not exist. */
export async function getMuscleMapTarget(
  token: string,
  ref: MuscleMapTargetRef,
): Promise<(MuscleMapTarget & { code: string }) | null> {
  switch (ref.kind) {
    case "muscle": {
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
    case "muscle_group": {
      const data = await staffGql<{ catalog_muscle_groups_by_pk: CatalogGroup | null }>(
        token,
        `query($id: uuid!) { catalog_muscle_groups_by_pk(id: $id) { ${GROUP_FIELDS} } }`,
        { id: ref.id },
      );
      const group = data.catalog_muscle_groups_by_pk;
      return group ? { ...muscleGroupTarget(group), code: group.code } : null;
    }
    case "body_region": {
      const data = await staffGql<{ catalog_body_regions_by_pk: CatalogRegion | null }>(
        token,
        `query($id: uuid!) { catalog_body_regions_by_pk(id: $id) { ${REGION_FIELDS} } }`,
        { id: ref.id },
      );
      const region = data.catalog_body_regions_by_pk;
      return region ? { ...bodyRegionTarget(region), code: region.code } : null;
    }
  }
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
    slot: MuscleMapSlot;
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
        ...muscleMapTargetColumns(input.target),
        view: input.slot.view,
        crop: input.slot.crop,
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

/** Deactivate the active map of (style, target, view, crop), except `exceptId`. */
export async function clearActiveMuscleMap(
  token: string,
  styleId: string,
  target: MuscleMapTargetRef,
  slot: MuscleMapSlot,
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
        view: { _eq: slot.view },
        crop: { _eq: slot.crop },
        active: { _eq: true },
        ...targetWhere(target),
        ...(exceptId ? { id: { _neq: exceptId } } : {}),
      },
    },
  );
}

/** Make `image` the active map of its target, view and crop (or deactivate it). */
export async function setMuscleMapActive(
  token: string,
  image: MuscleMapImage,
  active: boolean,
): Promise<MuscleMapImage> {
  if (active) {
    await clearActiveMuscleMap(token, image.style_id, targetOf(image), image, image.id);
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

/**
 * The view × crop pairs some active region, group or muscle has maps for: the bases a style
 * needs. In canonical order.
 */
export async function listUsedMuscleMapSlots(token: string): Promise<MuscleMapSlot[]> {
  const choices = `where: { active: { _eq: true } }) { map_views map_crops }`;
  const data = await staffGql<
    Record<"catalog_body_regions" | "catalog_muscle_groups" | "catalog_muscles", MuscleMapChoices[]>
  >(
    token,
    `query {
      catalog_body_regions(${choices}
      catalog_muscle_groups(${choices}
      catalog_muscles(${choices}
    }`,
  );
  const used = new Set(
    [...data.catalog_body_regions, ...data.catalog_muscle_groups, ...data.catalog_muscles]
      .flatMap((row) => muscleMapSlots(row.map_views, row.map_crops))
      .map(muscleMapSlotKey),
  );
  return muscleMapSlots(MUSCLE_MAP_VIEWS, MUSCLE_MAP_CROPS).filter((slot) =>
    used.has(muscleMapSlotKey(slot)),
  );
}
