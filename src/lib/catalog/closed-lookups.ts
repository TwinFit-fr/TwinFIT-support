/**
 * Closed lists: the app and the database depend on these values, so staff cannot add rows or
 * change codes (the backend refuses it). New values arrive only with a backend migration; staff
 * may still edit name, sort order and active.
 */
export const CLOSED_LOOKUP_TABLES: ReadonlySet<string> = new Set([
  "catalog_load_modalities",
  "catalog_logging_modes",
  "catalog_strength_patterns",
]);

export const CLOSED_LOOKUP_MESSAGE = "closed list: new values only by backend migration";
