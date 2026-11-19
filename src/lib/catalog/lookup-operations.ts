import { gql, type GqlDocument } from "@/lib/gql";
import type { LookupTable } from "./lookups";

/**
 * One fixed document per taxonomy table and use. Hasura needs every document to be known
 * beforehand, so nothing here is built from the table name at runtime; the tables are spelled
 * out. A new lookup table gets its entries in each record (the compiler lists the missing ones).
 */

/** Finds a row by `code`; the result is under the table's own name. */
export const LOOKUP_FIND: Record<LookupTable, GqlDocument> = {
  catalog_body_regions: gql`query SupportTaxonomyFindBodyRegions($code: String!) {
    catalog_body_regions(where: { code: { _eq: $code } }, limit: 1) { id code }
  }`,
  catalog_muscle_groups: gql`query SupportTaxonomyFindMuscleGroups($code: String!) {
    catalog_muscle_groups(where: { code: { _eq: $code } }, limit: 1) { id code }
  }`,
  catalog_muscles: gql`query SupportTaxonomyFindMuscles($code: String!) {
    catalog_muscles(where: { code: { _eq: $code } }, limit: 1) { id code }
  }`,
  catalog_movement_types: gql`query SupportTaxonomyFindMovementTypes($code: String!) {
    catalog_movement_types(where: { code: { _eq: $code } }, limit: 1) { id code }
  }`,
  catalog_equipment: gql`query SupportTaxonomyFindEquipment($code: String!) {
    catalog_equipment(where: { code: { _eq: $code } }, limit: 1) { id code }
  }`,
  catalog_support_equipment: gql`query SupportTaxonomyFindSupportEquipment($code: String!) {
    catalog_support_equipment(where: { code: { _eq: $code } }, limit: 1) { id code }
  }`,
  catalog_variations: gql`query SupportTaxonomyFindVariations($code: String!) {
    catalog_variations(where: { code: { _eq: $code } }, limit: 1) { id code }
  }`,
  catalog_positions: gql`query SupportTaxonomyFindPositions($code: String!) {
    catalog_positions(where: { code: { _eq: $code } }, limit: 1) { id code }
  }`,
  catalog_grips: gql`query SupportTaxonomyFindGrips($code: String!) {
    catalog_grips(where: { code: { _eq: $code } }, limit: 1) { id code }
  }`,
  catalog_load_modalities: gql`query SupportTaxonomyFindLoadModalities($code: String!) {
    catalog_load_modalities(where: { code: { _eq: $code } }, limit: 1) { id code }
  }`,
  catalog_logging_modes: gql`query SupportTaxonomyFindLoggingModes($code: String!) {
    catalog_logging_modes(where: { code: { _eq: $code } }, limit: 1) { id code }
  }`,
};

/** Inserts a row; the result is under `insert_<table>_one`. Closed lists have no entry (see closed-lookups.ts). */
export const LOOKUP_INSERT: Partial<Record<LookupTable, GqlDocument>> = {
  catalog_body_regions: gql`mutation SupportTaxonomyInsertBodyRegions($o: catalog_body_regions_insert_input!) {
    insert_catalog_body_regions_one(object: $o) { id code }
  }`,
  catalog_muscle_groups: gql`mutation SupportTaxonomyInsertMuscleGroups($o: catalog_muscle_groups_insert_input!) {
    insert_catalog_muscle_groups_one(object: $o) { id code }
  }`,
  catalog_muscles: gql`mutation SupportTaxonomyInsertMuscles($o: catalog_muscles_insert_input!) {
    insert_catalog_muscles_one(object: $o) { id code }
  }`,
  catalog_movement_types: gql`mutation SupportTaxonomyInsertMovementTypes($o: catalog_movement_types_insert_input!) {
    insert_catalog_movement_types_one(object: $o) { id code }
  }`,
  catalog_equipment: gql`mutation SupportTaxonomyInsertEquipment($o: catalog_equipment_insert_input!) {
    insert_catalog_equipment_one(object: $o) { id code }
  }`,
  catalog_support_equipment: gql`mutation SupportTaxonomyInsertSupportEquipment($o: catalog_support_equipment_insert_input!) {
    insert_catalog_support_equipment_one(object: $o) { id code }
  }`,
  catalog_variations: gql`mutation SupportTaxonomyInsertVariations($o: catalog_variations_insert_input!) {
    insert_catalog_variations_one(object: $o) { id code }
  }`,
  catalog_positions: gql`mutation SupportTaxonomyInsertPositions($o: catalog_positions_insert_input!) {
    insert_catalog_positions_one(object: $o) { id code }
  }`,
  catalog_grips: gql`mutation SupportTaxonomyInsertGrips($o: catalog_grips_insert_input!) {
    insert_catalog_grips_one(object: $o) { id code }
  }`,
};

/** Updates a row by id; the row comes back as `row`. */
export const LOOKUP_UPDATE: Record<LookupTable, GqlDocument> = {
  catalog_body_regions: gql`mutation SupportTaxonomyUpdateBodyRegions($id: uuid!, $set: catalog_body_regions_set_input!) {
    row: update_catalog_body_regions_by_pk(pk_columns: { id: $id }, _set: $set) { id code name active sort_order description }
  }`,
  catalog_muscle_groups: gql`mutation SupportTaxonomyUpdateMuscleGroups($id: uuid!, $set: catalog_muscle_groups_set_input!) {
    row: update_catalog_muscle_groups_by_pk(pk_columns: { id: $id }, _set: $set) { id code name active sort_order description body_region_id }
  }`,
  catalog_muscles: gql`mutation SupportTaxonomyUpdateMuscles($id: uuid!, $set: catalog_muscles_set_input!) {
    row: update_catalog_muscles_by_pk(pk_columns: { id: $id }, _set: $set) { id code name active sort_order description }
  }`,
  catalog_movement_types: gql`mutation SupportTaxonomyUpdateMovementTypes($id: uuid!, $set: catalog_movement_types_set_input!) {
    row: update_catalog_movement_types_by_pk(pk_columns: { id: $id }, _set: $set) { id code name active sort_order }
  }`,
  catalog_equipment: gql`mutation SupportTaxonomyUpdateEquipment($id: uuid!, $set: catalog_equipment_set_input!) {
    row: update_catalog_equipment_by_pk(pk_columns: { id: $id }, _set: $set) { id code name active sort_order description }
  }`,
  catalog_support_equipment: gql`mutation SupportTaxonomyUpdateSupportEquipment($id: uuid!, $set: catalog_support_equipment_set_input!) {
    row: update_catalog_support_equipment_by_pk(pk_columns: { id: $id }, _set: $set) { id code name active sort_order description }
  }`,
  catalog_variations: gql`mutation SupportTaxonomyUpdateVariations($id: uuid!, $set: catalog_variations_set_input!) {
    row: update_catalog_variations_by_pk(pk_columns: { id: $id }, _set: $set) { id code name active sort_order }
  }`,
  catalog_positions: gql`mutation SupportTaxonomyUpdatePositions($id: uuid!, $set: catalog_positions_set_input!) {
    row: update_catalog_positions_by_pk(pk_columns: { id: $id }, _set: $set) { id code name active sort_order }
  }`,
  catalog_grips: gql`mutation SupportTaxonomyUpdateGrips($id: uuid!, $set: catalog_grips_set_input!) {
    row: update_catalog_grips_by_pk(pk_columns: { id: $id }, _set: $set) { id code name active sort_order description }
  }`,
  catalog_load_modalities: gql`mutation SupportTaxonomyUpdateLoadModalities($id: uuid!, $set: catalog_load_modalities_set_input!) {
    row: update_catalog_load_modalities_by_pk(pk_columns: { id: $id }, _set: $set) { id code name active sort_order }
  }`,
  catalog_logging_modes: gql`mutation SupportTaxonomyUpdateLoggingModes($id: uuid!, $set: catalog_logging_modes_set_input!) {
    row: update_catalog_logging_modes_by_pk(pk_columns: { id: $id }, _set: $set) { id code name active sort_order }
  }`,
};

/** Reads a row by id with the same fields as the update; the row comes back as `row`. */
export const LOOKUP_READ: Record<LookupTable, GqlDocument> = {
  catalog_body_regions: gql`query SupportTaxonomyReadBodyRegions($id: uuid!) {
    row: catalog_body_regions_by_pk(id: $id) { id code name active sort_order description }
  }`,
  catalog_muscle_groups: gql`query SupportTaxonomyReadMuscleGroups($id: uuid!) {
    row: catalog_muscle_groups_by_pk(id: $id) { id code name active sort_order description body_region_id }
  }`,
  catalog_muscles: gql`query SupportTaxonomyReadMuscles($id: uuid!) {
    row: catalog_muscles_by_pk(id: $id) { id code name active sort_order description }
  }`,
  catalog_movement_types: gql`query SupportTaxonomyReadMovementTypes($id: uuid!) {
    row: catalog_movement_types_by_pk(id: $id) { id code name active sort_order }
  }`,
  catalog_equipment: gql`query SupportTaxonomyReadEquipment($id: uuid!) {
    row: catalog_equipment_by_pk(id: $id) { id code name active sort_order description }
  }`,
  catalog_support_equipment: gql`query SupportTaxonomyReadSupportEquipment($id: uuid!) {
    row: catalog_support_equipment_by_pk(id: $id) { id code name active sort_order description }
  }`,
  catalog_variations: gql`query SupportTaxonomyReadVariations($id: uuid!) {
    row: catalog_variations_by_pk(id: $id) { id code name active sort_order }
  }`,
  catalog_positions: gql`query SupportTaxonomyReadPositions($id: uuid!) {
    row: catalog_positions_by_pk(id: $id) { id code name active sort_order }
  }`,
  catalog_grips: gql`query SupportTaxonomyReadGrips($id: uuid!) {
    row: catalog_grips_by_pk(id: $id) { id code name active sort_order description }
  }`,
  catalog_load_modalities: gql`query SupportTaxonomyReadLoadModalities($id: uuid!) {
    row: catalog_load_modalities_by_pk(id: $id) { id code name active sort_order }
  }`,
  catalog_logging_modes: gql`query SupportTaxonomyReadLoggingModes($id: uuid!) {
    row: catalog_logging_modes_by_pk(id: $id) { id code name active sort_order }
  }`,
};

/** Taxonomy tables that have a localizations table, with that table's foreign key. */
export const TAXONOMY_LOCALIZATION_FK: Partial<Record<LookupTable, string>> = {
  catalog_body_regions: "body_region_id",
  catalog_equipment: "equipment_id",
  catalog_support_equipment: "support_equipment_id",
  catalog_movement_types: "movement_type_id",
  catalog_muscle_groups: "muscle_group_id",
  catalog_muscles: "muscle_id",
  catalog_load_modalities: "load_modality_id",
};

/** Sets every locale of a row: filled ones upserted, emptied ones deleted. */
export const LOCALIZATIONS_SET: Partial<Record<LookupTable, GqlDocument>> = {
  catalog_body_regions: gql`mutation SupportTaxonomySetBodyRegionsLabels(
    $objects: [catalog_body_region_localizations_insert_input!]!
    $id: uuid!
    $cleared: [String!]!
  ) {
    insert_catalog_body_region_localizations(
      objects: $objects
      on_conflict: { constraint: body_region_localizations_body_region_id_locale_key, update_columns: [display_name] }
    ) { affected_rows }
    delete_catalog_body_region_localizations(
      where: { body_region_id: { _eq: $id }, locale: { _in: $cleared } }
    ) { affected_rows }
  }`,
  catalog_equipment: gql`mutation SupportTaxonomySetEquipmentLabels(
    $objects: [catalog_equipment_localizations_insert_input!]!
    $id: uuid!
    $cleared: [String!]!
  ) {
    insert_catalog_equipment_localizations(
      objects: $objects
      on_conflict: { constraint: equipment_localizations_equipment_id_locale_key, update_columns: [display_name] }
    ) { affected_rows }
    delete_catalog_equipment_localizations(
      where: { equipment_id: { _eq: $id }, locale: { _in: $cleared } }
    ) { affected_rows }
  }`,
  catalog_support_equipment: gql`mutation SupportTaxonomySetSupportEquipmentLabels(
    $objects: [catalog_support_equipment_localizations_insert_input!]!
    $id: uuid!
    $cleared: [String!]!
  ) {
    insert_catalog_support_equipment_localizations(
      objects: $objects
      on_conflict: { constraint: support_equipment_localizations_support_equipment_id_locale_key, update_columns: [display_name] }
    ) { affected_rows }
    delete_catalog_support_equipment_localizations(
      where: { support_equipment_id: { _eq: $id }, locale: { _in: $cleared } }
    ) { affected_rows }
  }`,
  catalog_movement_types: gql`mutation SupportTaxonomySetMovementTypesLabels(
    $objects: [catalog_movement_type_localizations_insert_input!]!
    $id: uuid!
    $cleared: [String!]!
  ) {
    insert_catalog_movement_type_localizations(
      objects: $objects
      on_conflict: { constraint: movement_type_localizations_movement_type_id_locale_key, update_columns: [display_name] }
    ) { affected_rows }
    delete_catalog_movement_type_localizations(
      where: { movement_type_id: { _eq: $id }, locale: { _in: $cleared } }
    ) { affected_rows }
  }`,
  catalog_muscle_groups: gql`mutation SupportTaxonomySetMuscleGroupsLabels(
    $objects: [catalog_muscle_group_localizations_insert_input!]!
    $id: uuid!
    $cleared: [String!]!
  ) {
    insert_catalog_muscle_group_localizations(
      objects: $objects
      on_conflict: { constraint: muscle_group_localizations_muscle_group_id_locale_key, update_columns: [display_name] }
    ) { affected_rows }
    delete_catalog_muscle_group_localizations(
      where: { muscle_group_id: { _eq: $id }, locale: { _in: $cleared } }
    ) { affected_rows }
  }`,
  catalog_muscles: gql`mutation SupportTaxonomySetMusclesLabels(
    $objects: [catalog_muscle_localizations_insert_input!]!
    $id: uuid!
    $cleared: [String!]!
  ) {
    insert_catalog_muscle_localizations(
      objects: $objects
      on_conflict: { constraint: muscle_localizations_muscle_id_locale_key, update_columns: [display_name] }
    ) { affected_rows }
    delete_catalog_muscle_localizations(
      where: { muscle_id: { _eq: $id }, locale: { _in: $cleared } }
    ) { affected_rows }
  }`,
  catalog_load_modalities: gql`mutation SupportTaxonomySetLoadModalitiesLabels(
    $objects: [catalog_load_modality_localizations_insert_input!]!
    $id: uuid!
    $cleared: [String!]!
  ) {
    insert_catalog_load_modality_localizations(
      objects: $objects
      on_conflict: { constraint: load_modality_localizations_load_modality_id_locale_key, update_columns: [display_name] }
    ) { affected_rows }
    delete_catalog_load_modality_localizations(
      where: { load_modality_id: { _eq: $id }, locale: { _in: $cleared } }
    ) { affected_rows }
  }`,
};

/** Upserts the English label of a row. */
export const LOCALIZATION_SET_ENGLISH: Partial<Record<LookupTable, GqlDocument>> = {
  catalog_body_regions: gql`mutation SupportTaxonomySetBodyRegionsEnglishLabel($object: catalog_body_region_localizations_insert_input!) {
    insert_catalog_body_region_localizations_one(
      object: $object
      on_conflict: { constraint: body_region_localizations_body_region_id_locale_key, update_columns: [display_name] }
    ) { locale }
  }`,
  catalog_equipment: gql`mutation SupportTaxonomySetEquipmentEnglishLabel($object: catalog_equipment_localizations_insert_input!) {
    insert_catalog_equipment_localizations_one(
      object: $object
      on_conflict: { constraint: equipment_localizations_equipment_id_locale_key, update_columns: [display_name] }
    ) { locale }
  }`,
  catalog_support_equipment: gql`mutation SupportTaxonomySetSupportEquipmentEnglishLabel($object: catalog_support_equipment_localizations_insert_input!) {
    insert_catalog_support_equipment_localizations_one(
      object: $object
      on_conflict: { constraint: support_equipment_localizations_support_equipment_id_locale_key, update_columns: [display_name] }
    ) { locale }
  }`,
  catalog_movement_types: gql`mutation SupportTaxonomySetMovementTypesEnglishLabel($object: catalog_movement_type_localizations_insert_input!) {
    insert_catalog_movement_type_localizations_one(
      object: $object
      on_conflict: { constraint: movement_type_localizations_movement_type_id_locale_key, update_columns: [display_name] }
    ) { locale }
  }`,
  catalog_muscle_groups: gql`mutation SupportTaxonomySetMuscleGroupsEnglishLabel($object: catalog_muscle_group_localizations_insert_input!) {
    insert_catalog_muscle_group_localizations_one(
      object: $object
      on_conflict: { constraint: muscle_group_localizations_muscle_group_id_locale_key, update_columns: [display_name] }
    ) { locale }
  }`,
  catalog_muscles: gql`mutation SupportTaxonomySetMusclesEnglishLabel($object: catalog_muscle_localizations_insert_input!) {
    insert_catalog_muscle_localizations_one(
      object: $object
      on_conflict: { constraint: muscle_localizations_muscle_id_locale_key, update_columns: [display_name] }
    ) { locale }
  }`,
  catalog_load_modalities: gql`mutation SupportTaxonomySetLoadModalitiesEnglishLabel($object: catalog_load_modality_localizations_insert_input!) {
    insert_catalog_load_modality_localizations_one(
      object: $object
      on_conflict: { constraint: load_modality_localizations_load_modality_id_locale_key, update_columns: [display_name] }
    ) { locale }
  }`,
};
