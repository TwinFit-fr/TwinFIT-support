/**
 * Closed lists: the app and the database depend on these values, so staff cannot add rows or
 * change codes (the backend refuses it). New values arrive only with a backend migration; staff
 * may still edit name and sort order. `active` is not sent for them: the codes are written in SQL,
 * validate-set and the app, so the Support never switches them off (a value in use is refused
 * by the database anyway).
 */
export const CLOSED_LOOKUP_TABLES: ReadonlySet<string> = new Set([
  "catalog_load_modalities",
  "catalog_logging_modes",
  "catalog_strength_patterns",
]);

export const CLOSED_LOOKUP_MESSAGE = "closed list: new values only by backend migration";

/**
 * Tables staff can no longer insert into (backend 2.10.0, migration 1790000000100, audit T3.2-12):
 * the closed lists plus grips, variations and positions, open by migration only. Staff still edit
 * their names, descriptions, sort order and active flag.
 */
export const NO_STAFF_INSERT_TABLES: ReadonlySet<string> = new Set([
  ...CLOSED_LOOKUP_TABLES,
  "catalog_grips",
  "catalog_variations",
  "catalog_positions",
]);

export const NO_STAFF_INSERT_MESSAGE = "new values only by backend migration";
