import { bindStaffToken } from "./graphql.cjs";

export function bindCatalogStaffToken(accessToken: string) {
  bindStaffToken(accessToken);
}

export {
  ensureLookup,
  nextXcatExoId,
  composeXcatExercise,
  composeCustomXcatExercise,
  listAuthUsers,
  listXcatLibraryAdmin,
  updateXcatExercise,
  deactivateXcatExercise,
  upsertLookup,
  manageRelation,
  updateLookup,
  setExerciseSupportEquipment,
  resolveSupportEquipmentId,
  fetchTaxonomyAdmin,
} from "./crud.js";
