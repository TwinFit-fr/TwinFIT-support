import { staffGql } from "@/lib/staff-gql";
import { resolveExerciseColumns } from "./lookups";
import {
  buildExerciseLocalizationRows,
  normalizeTaxonomyStatus,
  parseBiomechanicalFields,
  providedBiomechanicalFields,
  resolveTaxonomyStatus,
  type ExercisePayload,
} from "./normalize";

type ExerciseRef = {
  id: string;
  exo_id: number;
  taxonomy_status: string;
  active: boolean;
  display_name: string;
};

async function fetchByExoId(token: string, exoId: number): Promise<ExerciseRef | null> {
  const data = await staffGql<{ catalog_exercises: ExerciseRef[] }>(
    token,
    `query($exo_id: Int!) {
      catalog_exercises(where: { exo_id: { _eq: $exo_id } }, limit: 1) {
        id exo_id taxonomy_status active display_name
      }
    }`,
    { exo_id: exoId },
  );
  return data.catalog_exercises[0] ?? null;
}

async function requireExercise(token: string, exoIdRaw: unknown) {
  const exoId = Number(exoIdRaw);
  if (!Number.isFinite(exoId)) throw new Error("exo_id required");
  const current = await fetchByExoId(token, exoId);
  if (!current) throw new Error(`No xcat exercise for exo_id ${exoId}`);
  return current;
}

function firstFreeExoId(ids: number[]): number {
  const used = new Set(ids.filter((n) => Number.isFinite(n) && n > 0));
  let next = 1;
  while (used.has(next)) next += 1;
  return next;
}

export async function nextExoId(token: string): Promise<number> {
  // Include inactive rows so soft-held ids are not reused.
  const data = await staffGql<{ catalog_exercises: { exo_id: number }[] }>(
    token,
    `{ catalog_exercises(order_by: { exo_id: asc }) { exo_id } }`,
  );
  return firstFreeExoId(data.catalog_exercises.map((r) => Number(r.exo_id)));
}

export function listLibrary(token: string) {
  return staffGql(
    token,
    `query XcatLibraryAdmin {
      catalog_exercises(where: { active: { _eq: true } }, order_by: { exo_id: asc }) {
        id
        exo_id
        display_name
        localizations(order_by: { locale: asc }) { locale display_name description }
        taxonomy_status
        taxonomy_notes
        primary_muscle_group { code name }
        target_muscle { code name }
        muscles_inherited
        resolved_muscles(order_by: { sort_order: asc }) { role source muscle { code name } }
        movement_type { code name }
        equipment { code name }
        support_equipment { code name }
        variation { code name }
        position { code name }
        grip { code name }
        load_modality { code name }
        logging_mode { code name }
        body_mass_coefficient
        wrist_imu_mode
        default_pulley_ratio
        secondary_muscles(order_by: { sort_order: asc }) { muscle { code name } }
        extra_muscle_groups { muscle_group { code name } }
      }
      catalog_muscle_groups(where: { active: { _eq: true } }, order_by: { sort_order: asc }) {
        id code name
      }
      catalog_muscles(where: { active: { _eq: true } }, order_by: { code: asc }) {
        id code name
      }
      catalog_movement_types(where: { active: { _eq: true } }, order_by: { sort_order: asc, code: asc }) {
        id code name
      }
      catalog_equipment(where: { active: { _eq: true } }, order_by: { sort_order: asc, code: asc }) {
        id code name
        localizations(order_by: { locale: asc }) { locale display_name }
      }
      catalog_support_equipment(where: { active: { _eq: true } }, order_by: { sort_order: asc, code: asc }) {
        id code name
        localizations(order_by: { locale: asc }) { locale display_name }
      }
      catalog_load_modalities(where: { active: { _eq: true } }, order_by: { sort_order: asc, code: asc }) {
        id code name
      }
      catalog_logging_modes(where: { active: { _eq: true } }, order_by: { sort_order: asc, code: asc }) {
        id code name
      }
    }`,
  );
}

function requireDisplayName(payload: ExercisePayload): string {
  const displayName = String(payload.display_name || "").trim();
  if (!displayName) throw new Error("display_name is required");
  return displayName;
}

const trimmedOrNull = (value: unknown) => (value ? String(value).trim() || null : null);

/** `muscles_inherited` of a payload: undefined when left out. */
function inheritedOf(payload: ExercisePayload): boolean | undefined {
  return typeof payload.muscles_inherited === "boolean" ? payload.muscles_inherited : undefined;
}

/**
 * Inserts the exercise with its localizations and muscles in one mutation document. New
 * exercises inherit their pair's muscles unless the payload says otherwise. The row is inserted
 * custom with its own muscles, then switched to inherited: the database then copies the pair's
 * muscles onto it, or gives them to a pair that has none yet (writes to an inherited exercise's
 * secondaries are ignored, so they must land before the switch).
 */
export async function composeExercise(token: string, payload: ExercisePayload) {
  const displayName = requireDisplayName(payload);
  const dup = await staffGql<{ catalog_exercises: { exo_id: number; display_name: string }[] }>(
    token,
    `query($name: String!) {
      catalog_exercises(where: { active: { _eq: true }, display_name: { _ilike: $name } }, limit: 5) {
        exo_id display_name
      }
    }`,
    { name: displayName },
  );
  const clash = dup.catalog_exercises.find(
    (e) => String(e.display_name || "").trim().toLowerCase() === displayName.toLowerCase(),
  );
  if (clash) throw new Error(`display_name already used by exo_id ${clash.exo_id}`);

  const biomechanics = parseBiomechanicalFields(payload);
  const { columns, secondaryIds = [] } = await resolveExerciseColumns(token, payload, "create");
  const exoId = payload.exo_id ? Number(payload.exo_id) : await nextExoId(token);
  const inherit = inheritedOf(payload) ?? true;
  const { status, requested, gaps } = resolveTaxonomyStatus(payload, payload.taxonomy_status);
  if (gaps.length && requested === "migrated") {
    // Keep the save, but never allow migrated when incomplete.
    console.warn(`xcat compose exo_id=${exoId}: coerced to pending (missing: ${gaps.join(", ")})`);
  }
  const localizations = buildExerciseLocalizationRows(
    payload,
    displayName,
    trimmedOrNull(payload.description),
  );

  const data = await staffGql<{ insert_catalog_exercises_one: unknown }>(
    token,
    `mutation($o: catalog_exercises_insert_input!${inherit ? ", $exo_id: Int!" : ""}) {
      insert_catalog_exercises_one(object: $o) { id exo_id display_name taxonomy_status }
      ${
        inherit
          ? `update_catalog_exercises(
              where: { exo_id: { _eq: $exo_id } }
              _set: { muscles_inherited: true }
            ) { affected_rows }`
          : ""
      }
    }`,
    {
      ...(inherit ? { exo_id: exoId } : {}),
      o: {
        exo_id: exoId,
        display_name: localizations[0].display_name,
        ...columns,
        ...biomechanics,
        taxonomy_status: status,
        taxonomy_notes: payload.taxonomy_notes || null,
        active: true,
        muscles_inherited: false,
        localizations: { data: localizations },
        secondary_muscles: {
          data: secondaryIds.map((muscle_id, sort_order) => ({ muscle_id, sort_order })),
        },
      },
    },
  );
  return data.insert_catalog_exercises_one;
}

/**
 * Updates the exercise in one mutation document, which Hasura runs as a single transaction:
 * fields, localizations (upsert per locale) and, when the payload lists them, the secondary
 * muscles (replaced). Fields missing from the payload keep their current values.
 *
 * Fields go first so a switch to custom lands before the secondaries are written (the database
 * ignores writes to an inherited exercise's secondaries). An inherited payload that lists
 * secondaries (its pair has no muscles yet) is saved custom, then switched to inherited at the
 * end so the pair takes them.
 */
export async function updateExercise(token: string, payload: ExercisePayload) {
  const displayName = requireDisplayName(payload);
  const current = await requireExercise(token, payload.exo_id);
  const { status, requested, gaps } = resolveTaxonomyStatus(
    payload,
    payload.taxonomy_status || normalizeTaxonomyStatus(current.taxonomy_status),
  );
  // Migrated rows may be edited in one save (UI unlocks via pending first), but completeness
  // is still enforced when targeting migrated.
  if (gaps.length && requested === "migrated") {
    throw new Error(
      `Cannot set migrated while incomplete (missing: ${gaps.join(", ")}). Use pending.`,
    );
  }

  const biomechanics = providedBiomechanicalFields(payload);
  const { columns, secondaryIds } = await resolveExerciseColumns(token, payload, "update");
  const replaceSecondary = secondaryIds !== undefined;
  const inherited = inheritedOf(payload);
  const inheritAtEnd = inherited === true && replaceSecondary;
  const set = {
    display_name: displayName,
    ...columns,
    ...biomechanics,
    taxonomy_status: status,
    ...("taxonomy_notes" in payload ? { taxonomy_notes: payload.taxonomy_notes || null } : {}),
    ...(inherited !== undefined ? { muscles_inherited: inherited && !inheritAtEnd } : {}),
  };
  const localizations = buildExerciseLocalizationRows(
    payload,
    displayName,
    trimmedOrNull(payload.description),
  ).map((row) => ({ ...row, exercise_id: current.id }));

  const data = await staffGql<{
    update_catalog_exercises_by_pk: { id: string; exo_id: number; taxonomy_status: string };
  }>(
    token,
    `mutation(
      $id: uuid!
      $set: catalog_exercises_set_input!
      $localizations: [catalog_exercise_localizations_insert_input!]!
      ${replaceSecondary ? "$secondary: [catalog_exercise_secondary_muscles_insert_input!]!" : ""}
    ) {
      update_catalog_exercises_by_pk(pk_columns: { id: $id }, _set: $set) { id exo_id taxonomy_status }
      ${replaceSecondary ? "delete_catalog_exercise_secondary_muscles(where: { exercise_id: { _eq: $id } }) { affected_rows }" : ""}
      ${replaceSecondary ? "insert_catalog_exercise_secondary_muscles(objects: $secondary) { affected_rows }" : ""}
      insert_catalog_exercise_localizations(
        objects: $localizations
        on_conflict: {
          constraint: exercise_localizations_exercise_id_locale_key
          update_columns: [display_name, description]
        }
      ) { affected_rows }
      ${inheritAtEnd ? "inherit: update_catalog_exercises_by_pk(pk_columns: { id: $id }, _set: { muscles_inherited: true }) { id }" : ""}
    }`,
    {
      id: current.id,
      set,
      localizations,
      ...(replaceSecondary
        ? {
            secondary: secondaryIds.map((muscle_id, sort_order) => ({
              exercise_id: current.id,
              muscle_id,
              sort_order,
            })),
          }
        : {}),
    },
  );
  return data.update_catalog_exercises_by_pk;
}

export async function deactivateExercise(token: string, payload: { exo_id?: unknown }) {
  const current = await requireExercise(token, payload.exo_id);
  if (current.active === false) {
    return { exo_id: current.exo_id, deactivated: true, already: true };
  }
  if (normalizeTaxonomyStatus(current.taxonomy_status) === "migrated") {
    throw new Error("Migrated exercises cannot be deactivated. Set status to pending first.");
  }
  await staffGql(
    token,
    `mutation($id: uuid!) {
      update_catalog_exercises_by_pk(pk_columns: { id: $id }, _set: { active: false }) { id }
    }`,
    { id: current.id },
  );
  return { exo_id: current.exo_id, deactivated: true };
}
