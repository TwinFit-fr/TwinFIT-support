import { gql } from "@/lib/gql";
import { staffGql } from "@/lib/staff-gql";
import { resolveExerciseColumns } from "./lookups";
import {
  duplicateNameErrors,
  exerciseGuardRailErrors,
  likeLiteral,
  planExerciseMuscles,
  type MusclePlan,
  type PairMusclesRef,
} from "./guard-rails";
import { summarizeChange, type ChangeLogRow } from "./history";
import {
  buildExerciseLocalizationRows,
  inferLoggingModeCode,
  normalizeMuscleCode,
  normalizeTaxonomy,
  normalizeTaxonomyStatus,
  parseBiomechanicalFields,
  providedBiomechanicalFields,
  requireCode,
  resolveTaxonomyStatus,
  type ExerciseLocalizationRow,
  type ExercisePayload,
} from "./normalize";
import { requireTargetMuscleCode } from "./target-muscle";

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
    gql`query SupportCatalogFetchByExoId($exo_id: Int!) {
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

export function listLibrary(token: string) {
  return staffGql(
    token,
    gql`query SupportXcatLibraryAdmin {
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
        default_pulley_ratio
        secondary_muscles(order_by: { sort_order: asc }) { muscle { code name } }
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

/** What an update reads of the exercise: its id, status and every field the guard rails check. */
type ExerciseForSave = ExerciseRef & {
  muscles_inherited: boolean;
  muscles_custom_reason: string | null;
  body_mass_coefficient: number | null;
  default_pulley_ratio: number;
  primary_muscle_group: { code: string } | null;
  movement_type: { code: string } | null;
  equipment: { code: string } | null;
  load_modality: { code: string } | null;
  logging_mode: { code: string } | null;
  target_muscle: { code: string } | null;
};

async function fetchForSave(token: string, exoIdRaw: unknown): Promise<ExerciseForSave> {
  const exoId = Number(exoIdRaw);
  if (!Number.isFinite(exoId)) throw new Error("exo_id required");
  const data = await staffGql<{ catalog_exercises: ExerciseForSave[] }>(
    token,
    gql`query SupportCatalogExerciseForSave($exo_id: Int!) {
      catalog_exercises(where: { exo_id: { _eq: $exo_id } }, limit: 1) {
        id exo_id taxonomy_status active display_name
        muscles_inherited muscles_custom_reason body_mass_coefficient default_pulley_ratio
        primary_muscle_group { code } movement_type { code } equipment { code }
        load_modality { code } logging_mode { code } target_muscle { code }
      }
    }`,
    { exo_id: exoId },
  );
  const row = data.catalog_exercises[0];
  if (!row) throw new Error(`No xcat exercise for exo_id ${exoId}`);
  return row;
}

/**
 * Names (per locale) already used by another active exercise: the database refuses a duplicate
 * name per locale among active exercises (1790000000100), so Support says which one first.
 */
async function assertUniqueNames(token: string, rows: ExerciseLocalizationRow[], exoId?: number) {
  const named = rows.filter((row) => row.display_name.trim());
  if (!named.length) return;
  const data = await staffGql<{
    catalog_exercise_localizations: { locale: string; display_name: string; exercise: { exo_id: number } }[];
  }>(
    token,
    gql`query SupportCatalogFindExerciseNames($where: catalog_exercise_localizations_bool_exp!) {
      catalog_exercise_localizations(where: $where) { locale display_name exercise { exo_id } }
    }`,
    {
      where: {
        exercise: { active: { _eq: true } },
        _or: named.map((row) => ({
          locale: { _eq: row.locale },
          display_name: { _ilike: likeLiteral(row.display_name.trim()) },
        })),
      },
    },
  );
  const exercises = data.catalog_exercise_localizations.map((l) => ({
    exo_id: l.exercise.exo_id,
    localizations: [{ locale: l.locale, display_name: l.display_name }],
  }));
  const errors = duplicateNameErrors(
    Object.fromEntries(named.map((row) => [row.locale, row.display_name])),
    exercises,
    exoId,
  );
  if (errors.length) throw new Error(errors.join("; "));
}

type GuardContext = {
  group: { code: string; kind: string | null }[];
  pair: NonNullable<PairMusclesRef>[];
  target: { code: string; home_muscle_group: { code: string } | null }[];
};

/** The group's kind, the pair's muscles and the target's home group, by codes. */
function guardContext(token: string, group: string, movement: string, target: string) {
  return staffGql<GuardContext>(
    token,
    gql`query SupportCatalogGuardContext($group: String!, $movement: String!, $target: String!) {
      group: catalog_muscle_groups(where: { code: { _eq: $group } }, limit: 1) { code kind }
      pair: catalog_muscle_group_movement_types(
        where: { muscle_group: { code: { _eq: $group } }, movement_type: { code: { _eq: $movement } } }
        limit: 1
      ) {
        target_muscle { code }
        target_profiles { target_muscle { code } }
      }
      target: catalog_muscles(where: { code: { _eq: $target } }, limit: 1) { code home_muscle_group { code } }
    }`,
    { group, movement, target },
  );
}

/** The fields the guard rails read, after the payload is applied to the current row. */
type EffectiveExercise = {
  group: string;
  movement: string;
  equipment: string;
  loadModality: string;
  loggingMode: string;
  target: string;
  inherit: boolean;
  reason: string | null;
  bodyMassCoefficient: number | null;
  pulleyRatio: number;
};

/**
 * Checks the guard rails of backend 2.10.0 before writing (custom reason, target home group,
 * load model, C_ex and pulley ranges) and decides how the muscles are written. Throws every
 * problem at once, in staff words.
 */
async function checkExercise(token: string, x: EffectiveExercise): Promise<MusclePlan> {
  const ctx = await guardContext(token, x.group, x.movement, x.target);
  const plan = planExerciseMuscles(x.inherit, ctx.pair[0] ?? null, x.target);
  // The pair's own target has its home in the group (the database checks pairs too).
  const home =
    plan.target === x.target ? (ctx.target[0]?.home_muscle_group?.code ?? null) : x.group;
  const errors = exerciseGuardRailErrors({
    groupCode: x.group,
    groupKind: ctx.group[0]?.kind ?? null,
    equipment: x.equipment,
    loadModality: x.loadModality,
    loggingMode: x.loggingMode,
    bodyMassCoefficient: x.bodyMassCoefficient,
    pulleyRatio: x.pulleyRatio,
    musclesInherited: x.inherit,
    musclesCustomReason: x.reason,
    targetCode: plan.target,
    targetHomeGroupCode: home,
  });
  if (errors.length) throw new Error(errors.join("; "));
  return plan;
}

const reasonOf = (raw: unknown) => (raw == null ? null : String(raw).trim() || null);
const code = (raw: unknown) => normalizeTaxonomy(raw);
const firstOf = (payload: ExercisePayload, ...keys: (keyof ExercisePayload)[]) =>
  keys.map((key) => payload[key]).find((value) => String(value ?? "").trim());
const has = (payload: ExercisePayload, ...keys: (keyof ExercisePayload)[]) =>
  keys.some((key) => key in payload);

/** The payload with the muscles the plan writes: its target, and secondaries only when written. */
function withPlannedMuscles(payload: ExercisePayload, plan: MusclePlan): ExercisePayload {
  const next: ExercisePayload = { ...payload, target_muscle_code: plan.target };
  if (!plan.writeSecondaries) delete next.secondary_muscle_codes;
  return next;
}

/**
 * Inserts the exercise with its localizations and muscles; the backend sequence assigns
 * `exo_id` (never sent from here). New exercises inherit their pair's muscles unless the payload
 * says otherwise. Always one mutation document, so one transaction:
 * - inherited, pair with muscles: inserted with `muscles_inherited = true` and no secondaries; the
 *   database gives it the pair's muscles (or those of the pair's target profile).
 * - inherited, pair without muscles yet: inserted custom with the form's muscles and switched to
 *   inherited in the same document, so the pair takes them (`muscles_custom_reason` is checked at
 *   commit, when the row already inherits).
 * - custom: inserted with its muscles and `muscles_custom_reason`.
 */
export async function composeExercise(token: string, payload: ExercisePayload) {
  const displayName = requireDisplayName(payload);
  const localizations = buildExerciseLocalizationRows(
    payload,
    displayName,
    trimmedOrNull(payload.description),
  );
  await assertUniqueNames(token, localizations);

  const biomechanics = parseBiomechanicalFields(payload);
  const inherit = inheritedOf(payload) ?? true;
  const reason = reasonOf(payload.muscles_custom_reason);
  const plan = await checkExercise(token, {
    group: code(firstOf(payload, "primary_muscle_group_code", "muscle_group")),
    movement: code(firstOf(payload, "movement_type_code", "movement_type")),
    equipment: code(firstOf(payload, "equipment_code", "equipment")),
    loadModality: code(requireCode("load modality", firstOf(payload, "load_modality_code", "load_modality"))),
    loggingMode: code(firstOf(payload, "logging_mode_code", "logging_mode") || inferLoggingModeCode(payload)),
    target: normalizeMuscleCode(requireTargetMuscleCode(payload)),
    inherit,
    reason,
    bodyMassCoefficient: biomechanics.body_mass_coefficient,
    pulleyRatio: biomechanics.default_pulley_ratio,
  });
  const planned = withPlannedMuscles(payload, plan);
  const { columns, secondaryIds = [] } = await resolveExerciseColumns(token, planned, "create");
  const { status, requested, gaps } = resolveTaxonomyStatus(payload, payload.taxonomy_status);
  if (gaps.length && requested === "migrated") {
    // Keep the save, but never allow migrated when incomplete.
    console.warn(`xcat compose "${displayName}": coerced to pending (missing: ${gaps.join(", ")})`);
  }

  const row = {
    display_name: localizations[0].display_name,
    ...columns,
    ...biomechanics,
    taxonomy_status: status,
    taxonomy_notes: payload.taxonomy_notes || null,
    active: true,
    localizations: { data: localizations },
  };
  const secondary = {
    data: (plan.writeSecondaries ? secondaryIds : []).map((muscle_id, sort_order) => ({ muscle_id, sort_order })),
  };
  type Inserted = { insert_catalog_exercises_one: { id: string; exo_id: number } };

  if (plan.mode === "inherit_new_pair") {
    const data = await staffGql<Inserted>(
      token,
      gql`mutation SupportCatalogInsertExerciseGivingPairMuscles(
        $o: catalog_exercises_insert_input!
        $g: uuid!
        $m: uuid!
      ) {
        insert_catalog_exercises_one(object: $o) { id exo_id display_name taxonomy_status }
        update_catalog_exercises(
          where: {
            primary_muscle_group_id: { _eq: $g }
            movement_type_id: { _eq: $m }
            active: { _eq: true }
            muscles_inherited: { _eq: false }
            muscles_custom_reason: { _is_null: true }
          }
          _set: { muscles_inherited: true }
        ) { affected_rows }
      }`,
      {
        // Only the row inserted here matches: every committed custom row has a reason.
        o: { ...row, muscles_inherited: false, secondary_muscles: secondary },
        g: columns.primary_muscle_group_id,
        m: columns.movement_type_id,
      },
    );
    return data.insert_catalog_exercises_one;
  }

  const data = await staffGql<Inserted>(
    token,
    gql`mutation SupportCatalogInsertExercise($o: catalog_exercises_insert_input!) {
      insert_catalog_exercises_one(object: $o) { id exo_id display_name taxonomy_status }
    }`,
    {
      o:
        plan.mode === "inherit"
          ? { ...row, muscles_inherited: true }
          : { ...row, muscles_inherited: false, muscles_custom_reason: reason, secondary_muscles: secondary },
    },
  );
  return data.insert_catalog_exercises_one;
}

/**
 * Updates the exercise in one mutation document, which Hasura runs as a single transaction:
 * fields, localizations (upsert per locale) and, when written, the secondary muscles (replaced).
 * Fields missing from the payload keep their current values; the guard rails are checked on the
 * result first.
 *
 * Fields go first so a switch to custom lands before the secondaries are written (the database
 * refuses writes to an inherited exercise's secondaries). An inherited exercise never sends
 * secondaries, except when its pair has no muscles yet: it is saved custom, then switched to
 * inherited at the end of the same document so the pair takes them.
 */
export async function updateExercise(token: string, payload: ExercisePayload) {
  const displayName = requireDisplayName(payload);
  const current = await fetchForSave(token, payload.exo_id);
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
  const localizations = buildExerciseLocalizationRows(
    payload,
    displayName,
    trimmedOrNull(payload.description),
  );
  await assertUniqueNames(token, localizations, current.exo_id);

  const biomechanics = providedBiomechanicalFields(payload);
  const inherit = inheritedOf(payload) ?? current.muscles_inherited;
  const reason = has(payload, "muscles_custom_reason")
    ? reasonOf(payload.muscles_custom_reason)
    : current.muscles_custom_reason;
  const pick = (keys: (keyof ExercisePayload)[], now: { code: string } | null) =>
    code(has(payload, ...keys) ? firstOf(payload, ...keys) : now?.code);
  const plan = await checkExercise(token, {
    group: pick(["primary_muscle_group_code", "muscle_group"], current.primary_muscle_group),
    movement: pick(["movement_type_code", "movement_type"], current.movement_type),
    equipment: pick(["equipment_code", "equipment"], current.equipment),
    loadModality: pick(["load_modality_code", "load_modality"], current.load_modality),
    loggingMode: pick(["logging_mode_code", "logging_mode"], current.logging_mode),
    target: normalizeMuscleCode(
      has(payload, "target_muscle_code") ? requireTargetMuscleCode(payload) : current.target_muscle?.code,
    ),
    inherit,
    reason,
    bodyMassCoefficient:
      "body_mass_coefficient" in biomechanics
        ? (biomechanics.body_mass_coefficient ?? null)
        : current.body_mass_coefficient,
    pulleyRatio: biomechanics.default_pulley_ratio ?? current.default_pulley_ratio,
  });

  const planned = withPlannedMuscles({ ...payload, target_muscle_code: undefined }, plan);
  const { columns, secondaryIds } = await resolveExerciseColumns(token, planned, "update");
  const replaceSecondary = plan.writeSecondaries && secondaryIds !== undefined;
  const inheritAtEnd = plan.mode === "inherit_new_pair" && replaceSecondary;
  const set = {
    display_name: displayName,
    ...columns,
    ...biomechanics,
    taxonomy_status: status,
    ...("taxonomy_notes" in payload ? { taxonomy_notes: payload.taxonomy_notes || null } : {}),
    muscles_inherited: plan.mode !== "custom" && !inheritAtEnd,
    ...(plan.mode === "custom" && has(payload, "muscles_custom_reason")
      ? { muscles_custom_reason: reason }
      : {}),
  };
  const localizationRows = localizations.map((row) => ({ ...row, exercise_id: current.id }));
  const data = await staffGql<{
    update_catalog_exercises_by_pk: { id: string; exo_id: number; taxonomy_status: string };
  }>(
    token,
    inheritAtEnd
      ? gql`mutation SupportCatalogUpdateExerciseInheritAtEnd(
          $id: uuid!
          $set: catalog_exercises_set_input!
          $localizations: [catalog_exercise_localizations_insert_input!]!
          $secondary: [catalog_exercise_secondary_muscles_insert_input!]!
        ) {
          update_catalog_exercises_by_pk(pk_columns: { id: $id }, _set: $set) { id exo_id taxonomy_status }
          delete_catalog_exercise_secondary_muscles(where: { exercise_id: { _eq: $id } }) { affected_rows }
          insert_catalog_exercise_secondary_muscles(objects: $secondary) { affected_rows }
          insert_catalog_exercise_localizations(
            objects: $localizations
            on_conflict: {
              constraint: exercise_localizations_exercise_id_locale_key
              update_columns: [display_name, description]
            }
          ) { affected_rows }
          inherit: update_catalog_exercises_by_pk(pk_columns: { id: $id }, _set: { muscles_inherited: true }) { id }
        }`
      : replaceSecondary
        ? gql`mutation SupportCatalogUpdateExerciseSecondary(
            $id: uuid!
            $set: catalog_exercises_set_input!
            $localizations: [catalog_exercise_localizations_insert_input!]!
            $secondary: [catalog_exercise_secondary_muscles_insert_input!]!
          ) {
            update_catalog_exercises_by_pk(pk_columns: { id: $id }, _set: $set) { id exo_id taxonomy_status }
            delete_catalog_exercise_secondary_muscles(where: { exercise_id: { _eq: $id } }) { affected_rows }
            insert_catalog_exercise_secondary_muscles(objects: $secondary) { affected_rows }
            insert_catalog_exercise_localizations(
              objects: $localizations
              on_conflict: {
                constraint: exercise_localizations_exercise_id_locale_key
                update_columns: [display_name, description]
              }
            ) { affected_rows }
          }`
        : gql`mutation SupportCatalogUpdateExercise(
            $id: uuid!
            $set: catalog_exercises_set_input!
            $localizations: [catalog_exercise_localizations_insert_input!]!
          ) {
            update_catalog_exercises_by_pk(pk_columns: { id: $id }, _set: $set) { id exo_id taxonomy_status }
            insert_catalog_exercise_localizations(
              objects: $localizations
              on_conflict: {
                constraint: exercise_localizations_exercise_id_locale_key
                update_columns: [display_name, description]
              }
            ) { affected_rows }
          }`,
    {
      id: current.id,
      set,
      localizations: localizationRows,
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


/** The editor's extra data for one exercise: its custom reason and its change history. */
export async function exerciseDetail(token: string, exoIdRaw: unknown) {
  const current = await fetchForSave(token, exoIdRaw);
  const exo = String(current.exo_id);
  const log = await staffGql<{ catalog_change_log: ChangeLogRow[] }>(
    token,
    gql`query SupportCatalogExerciseHistory($exo: String!, $prefix: String!) {
      catalog_change_log(
        where: {
          table_name: { _in: ["exercises", "exercise_localizations", "exercise_secondary_muscles"] }
          _or: [{ row_key: { _eq: $exo } }, { row_key: { _like: $prefix } }]
        }
        order_by: { id: desc }
        limit: 50
      ) { id changed_at actor table_name row_key op old_row new_row }
    }`,
    { exo, prefix: `${exo}:%` },
  );
  return {
    exo_id: current.exo_id,
    muscles_inherited: current.muscles_inherited,
    muscles_custom_reason: current.muscles_custom_reason,
    history: log.catalog_change_log.map(summarizeChange),
  };
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
    gql`mutation SupportCatalogDeactivateExercise($id: uuid!) {
      update_catalog_exercises_by_pk(pk_columns: { id: $id }, _set: { active: false }) { id }
    }`,
    { id: current.id },
  );
  return { exo_id: current.exo_id, deactivated: true };
}
