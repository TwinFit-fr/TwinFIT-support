import { staffGql } from "@/lib/staff-gql";
import type {
  MapBase,
  MapMask,
  MapMuscle,
  MapView,
  MaskMethod,
  MaskParams,
  MuscleMapBoard,
  MuscleMapSettings,
  Rect,
} from "./types";

/** GraphQL of schema `muscle_map` (staff only). Reads nothing from `images`. */

const SETTINGS_FIELDS = `
  target_color secondary_color key_color generation base_prompt mask_prompt updated_at
`;
const MUSCLE_FIELDS = `muscle_id view muscle { id code name description active }`;
const BASE_FIELDS = `
  id view file_id image_url width height active model prompt params created_at
`;
const MASK_FIELDS = `
  id base_id muscle_id view file_id source_file_id image_url rect method active model prompt
  params created_at
`;

export async function getBoard(token: string): Promise<MuscleMapBoard> {
  const data = await staffGql<{
    muscle_map_settings_by_pk: MuscleMapSettings | null;
    muscle_map_muscles: MapMuscle[];
    muscle_map_bases: MapBase[];
    muscle_map_masks: MapMask[];
    catalog_muscles: MuscleMapBoard["catalog_muscles"];
  }>(
    token,
    `query MuscleMapBoard {
      muscle_map_settings_by_pk(id: true) { ${SETTINGS_FIELDS} }
      muscle_map_muscles { ${MUSCLE_FIELDS} }
      muscle_map_bases(order_by: { created_at: desc }) { ${BASE_FIELDS} }
      muscle_map_masks(order_by: { created_at: desc }) { ${MASK_FIELDS} }
      catalog_muscles(order_by: { code: asc }) { id code name active }
    }`,
  );
  if (!data.muscle_map_settings_by_pk) throw new Error("muscle_map.settings has no row");
  return {
    settings: data.muscle_map_settings_by_pk,
    muscles: data.muscle_map_muscles,
    bases: data.muscle_map_bases,
    masks: data.muscle_map_masks,
    catalog_muscles: data.catalog_muscles,
  };
}

export async function getSettings(token: string): Promise<MuscleMapSettings> {
  const data = await staffGql<{ muscle_map_settings_by_pk: MuscleMapSettings | null }>(
    token,
    `query { muscle_map_settings_by_pk(id: true) { ${SETTINGS_FIELDS} } }`,
  );
  if (!data.muscle_map_settings_by_pk) throw new Error("muscle_map.settings has no row");
  return data.muscle_map_settings_by_pk;
}

export async function updateSettings(
  token: string,
  set: Partial<Omit<MuscleMapSettings, "updated_at">>,
): Promise<void> {
  await staffGql(
    token,
    `mutation($set: muscle_map_settings_set_input!) {
      update_muscle_map_settings_by_pk(pk_columns: { id: true }, _set: $set) { updated_at }
    }`,
    { set },
  );
}

export async function getMapMuscle(token: string, muscleId: string): Promise<MapMuscle | null> {
  const data = await staffGql<{ muscle_map_muscles_by_pk: MapMuscle | null }>(
    token,
    `query($id: uuid!) { muscle_map_muscles_by_pk(muscle_id: $id) { ${MUSCLE_FIELDS} } }`,
    { id: muscleId },
  );
  return data.muscle_map_muscles_by_pk;
}

export async function insertMapMuscle(token: string, muscleId: string, view: MapView) {
  await staffGql(
    token,
    `mutation($o: muscle_map_muscles_insert_input!) {
      insert_muscle_map_muscles_one(object: $o) { muscle_id }
    }`,
    { o: { muscle_id: muscleId, view } },
  );
}

export async function updateMapMuscleView(token: string, muscleId: string, view: MapView) {
  await staffGql(
    token,
    `mutation($id: uuid!, $view: String!) {
      update_muscle_map_muscles_by_pk(pk_columns: { muscle_id: $id }, _set: { view: $view }) {
        muscle_id
      }
    }`,
    { id: muscleId, view },
  );
}

export async function deleteMapMuscle(token: string, muscleId: string) {
  await staffGql(
    token,
    `mutation($id: uuid!) { delete_muscle_map_muscles_by_pk(muscle_id: $id) { muscle_id } }`,
    { id: muscleId },
  );
}

export async function getBase(token: string, id: string): Promise<MapBase | null> {
  const data = await staffGql<{ muscle_map_bases_by_pk: MapBase | null }>(
    token,
    `query($id: uuid!) { muscle_map_bases_by_pk(id: $id) { ${BASE_FIELDS} } }`,
    { id },
  );
  return data.muscle_map_bases_by_pk;
}

export async function getActiveBase(token: string, view: MapView): Promise<MapBase | null> {
  const data = await staffGql<{ muscle_map_bases: MapBase[] }>(
    token,
    `query($view: String!) {
      muscle_map_bases(where: { view: { _eq: $view }, active: { _eq: true } }, limit: 1) {
        ${BASE_FIELDS}
      }
    }`,
    { view },
  );
  return data.muscle_map_bases[0] ?? null;
}

export type NewBase = {
  view: MapView;
  file_id: string;
  image_url: string;
  width: number;
  height: number;
  /** Empty for uploads. */
  model: string;
  prompt: string;
  params: Record<string, unknown>;
  usage: Record<string, unknown> | null;
};

/**
 * Inserts a base as the active one of its view. One document: the old active base is
 * deactivated first (at most one active per view).
 */
export async function insertActiveBase(token: string, base: NewBase): Promise<MapBase> {
  const data = await staffGql<{ insert_muscle_map_bases_one: MapBase }>(
    token,
    `mutation($view: String!, $o: muscle_map_bases_insert_input!) {
      update_muscle_map_bases(
        where: { view: { _eq: $view }, active: { _eq: true } }
        _set: { active: false }
      ) { affected_rows }
      insert_muscle_map_bases_one(object: $o) { ${BASE_FIELDS} }
    }`,
    { view: base.view, o: { ...base, active: true } },
  );
  return data.insert_muscle_map_bases_one;
}

export async function setBaseActive(token: string, base: MapBase, active: boolean) {
  await staffGql(
    token,
    active
      ? `mutation($id: uuid!, $view: String!) {
          update_muscle_map_bases(
            where: { view: { _eq: $view }, active: { _eq: true }, id: { _neq: $id } }
            _set: { active: false }
          ) { affected_rows }
          update_muscle_map_bases_by_pk(pk_columns: { id: $id }, _set: { active: true }) { id }
        }`
      : `mutation($id: uuid!) {
          update_muscle_map_bases_by_pk(pk_columns: { id: $id }, _set: { active: false }) { id }
        }`,
    active ? { id: base.id, view: base.view } : { id: base.id },
  );
}

/** Deletes an inactive base row; its masks go with it (cascade). Files stay: delete them next. */
export async function deleteBaseRow(token: string, id: string) {
  const data = await staffGql<{ delete_muscle_map_bases: { affected_rows: number } }>(
    token,
    `mutation($id: uuid!) {
      delete_muscle_map_bases(where: { id: { _eq: $id }, active: { _eq: false } }) {
        affected_rows
      }
    }`,
    { id },
  );
  if (!data.delete_muscle_map_bases.affected_rows) {
    throw new Error("Only an inactive base can be deleted");
  }
}

export async function listMasksOfBase(
  token: string,
  baseId: string,
  onlyActive = false,
): Promise<MapMask[]> {
  const data = await staffGql<{ muscle_map_masks: MapMask[] }>(
    token,
    `query($base: uuid!, $active: [Boolean!]!) {
      muscle_map_masks(where: { base_id: { _eq: $base }, active: { _in: $active } }) {
        ${MASK_FIELDS}
      }
    }`,
    { base: baseId, active: onlyActive ? [true] : [true, false] },
  );
  return data.muscle_map_masks;
}

export async function getMask(token: string, id: string): Promise<MapMask | null> {
  const data = await staffGql<{ muscle_map_masks_by_pk: MapMask | null }>(
    token,
    `query($id: uuid!) { muscle_map_masks_by_pk(id: $id) { ${MASK_FIELDS} } }`,
    { id },
  );
  return data.muscle_map_masks_by_pk;
}

export type NewMask = {
  base_id: string;
  muscle_id: string;
  file_id: string;
  source_file_id: string | null;
  image_url: string;
  rect: Rect | null;
  method: MaskMethod;
  /** Empty for uploads. */
  model: string;
  prompt: string;
  params: MaskParams;
  usage: Record<string, unknown> | null;
};

/**
 * Inserts a mask as the active one of its base and muscle (the old active one is deactivated
 * first, in the same document). `view` is filled by the database from the muscle.
 */
export async function insertActiveMask(token: string, mask: NewMask): Promise<MapMask> {
  const data = await staffGql<{ insert_muscle_map_masks_one: MapMask }>(
    token,
    `mutation($base: uuid!, $muscle: uuid!, $o: muscle_map_masks_insert_input!) {
      update_muscle_map_masks(
        where: { base_id: { _eq: $base }, muscle_id: { _eq: $muscle }, active: { _eq: true } }
        _set: { active: false }
      ) { affected_rows }
      insert_muscle_map_masks_one(object: $o) { ${MASK_FIELDS} }
    }`,
    { base: mask.base_id, muscle: mask.muscle_id, o: { ...mask, active: true } },
  );
  return data.insert_muscle_map_masks_one;
}

export async function updateMaskFile(
  token: string,
  id: string,
  set: { file_id: string; image_url: string; rect: Rect | null; params: MaskParams },
): Promise<MapMask> {
  const data = await staffGql<{ update_muscle_map_masks_by_pk: MapMask }>(
    token,
    `mutation($id: uuid!, $set: muscle_map_masks_set_input!) {
      update_muscle_map_masks_by_pk(pk_columns: { id: $id }, _set: $set) { ${MASK_FIELDS} }
    }`,
    { id, set },
  );
  return data.update_muscle_map_masks_by_pk;
}

export async function setMaskActive(token: string, mask: MapMask, active: boolean) {
  await staffGql(
    token,
    active
      ? `mutation($id: uuid!, $base: uuid!, $muscle: uuid!) {
          update_muscle_map_masks(
            where: {
              base_id: { _eq: $base }
              muscle_id: { _eq: $muscle }
              active: { _eq: true }
              id: { _neq: $id }
            }
            _set: { active: false }
          ) { affected_rows }
          update_muscle_map_masks_by_pk(pk_columns: { id: $id }, _set: { active: true }) { id }
        }`
      : `mutation($id: uuid!) {
          update_muscle_map_masks_by_pk(pk_columns: { id: $id }, _set: { active: false }) { id }
        }`,
    active ? { id: mask.id, base: mask.base_id, muscle: mask.muscle_id } : { id: mask.id },
  );
}

export async function deleteMaskRow(token: string, id: string) {
  const data = await staffGql<{ delete_muscle_map_masks: { affected_rows: number } }>(
    token,
    `mutation($id: uuid!) {
      delete_muscle_map_masks(where: { id: { _eq: $id }, active: { _eq: false } }) {
        affected_rows
      }
    }`,
    { id },
  );
  if (!data.delete_muscle_map_masks.affected_rows) {
    throw new Error("Only an inactive mask can be deleted");
  }
}
