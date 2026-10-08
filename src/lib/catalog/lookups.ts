import { staffGql } from "@/lib/staff-gql";
import { CATALOG_LOCALES, type CatalogLocale } from "./locales";
import {
  defaultLookupName,
  inferLoadModalityCode,
  inferLoggingModeCode,
  normalizeMuscleCode,
  normalizeTaxonomy,
  type ExercisePayload,
} from "./normalize";

export const LOOKUP_TABLES = [
  "catalog_body_regions",
  "catalog_muscle_groups",
  "catalog_muscles",
  "catalog_movement_types",
  "catalog_equipment",
  "catalog_support_equipment",
  "catalog_variations",
  "catalog_positions",
  "catalog_grips",
  "catalog_load_modalities",
  "catalog_logging_modes",
] as const;

export type LookupTable = (typeof LOOKUP_TABLES)[number];

type LookupRef = { id: string; code: string };

function assertLookupTable(table: unknown): LookupTable {
  if (!LOOKUP_TABLES.includes(table as LookupTable)) throw new Error("Invalid lookup table");
  return table as LookupTable;
}

const TAXONOMY_LOCALIZATIONS: Partial<
  Record<LookupTable, { table: string; fk: string; constraint: string }>
> = {
  catalog_body_regions: {
    table: "catalog_body_region_localizations",
    fk: "body_region_id",
    constraint: "body_region_localizations_body_region_id_locale_key",
  },
  catalog_equipment: {
    table: "catalog_equipment_localizations",
    fk: "equipment_id",
    constraint: "equipment_localizations_equipment_id_locale_key",
  },
  catalog_support_equipment: {
    table: "catalog_support_equipment_localizations",
    fk: "support_equipment_id",
    constraint: "support_equipment_localizations_support_equipment_id_locale_key",
  },
  catalog_movement_types: {
    table: "catalog_movement_type_localizations",
    fk: "movement_type_id",
    constraint: "movement_type_localizations_movement_type_id_locale_key",
  },
  catalog_muscle_groups: {
    table: "catalog_muscle_group_localizations",
    fk: "muscle_group_id",
    constraint: "muscle_group_localizations_muscle_group_id_locale_key",
  },
  catalog_muscles: {
    table: "catalog_muscle_localizations",
    fk: "muscle_id",
    constraint: "muscle_localizations_muscle_id_locale_key",
  },
  catalog_load_modalities: {
    table: "catalog_load_modality_localizations",
    fk: "load_modality_id",
    constraint: "load_modality_localizations_load_modality_id_locale_key",
  },
};

/**
 * Rows with required fields beyond code and name: a region has a card view, a group belongs to
 * a region. They are created only from Taxonomy (`upsertLookup`), never implied by a code.
 */
const EXPLICIT_LOOKUP_TABLES = new Set<LookupTable>(["catalog_body_regions", "catalog_muscle_groups"]);

const MAP_VIEWS = ["front", "back"] as const;

/**
 * Finds a lookup row by code, creating it (Title Case name) when it does not exist yet.
 * `columns` are the extra fields of an explicit table's new row; without them an unknown code
 * of such a table is an error.
 */
export async function ensureLookup(
  token: string,
  table: LookupTable,
  code: unknown,
  name?: unknown,
  columns?: Record<string, unknown>,
): Promise<LookupRef> {
  const c = table === "catalog_muscles" ? normalizeMuscleCode(code) : normalizeTaxonomy(code);
  if (!c) throw new Error(`Empty code for ${table}`);
  const existing = await staffGql<Record<string, LookupRef[]>>(
    token,
    `query($code: String!) { ${table}(where: { code: { _eq: $code } }, limit: 1) { id code } }`,
    { code: c },
  );
  const hit = existing[table]?.[0];
  if (hit) return hit;
  if (EXPLICIT_LOOKUP_TABLES.has(table) && !columns) {
    throw new Error(`Unknown ${table.replace("catalog_", "")} code: ${c}. Create it in Taxonomy first.`);
  }
  const label = String(name || "").trim() || defaultLookupName(c);
  const inserted = await staffGql<Record<string, LookupRef>>(
    token,
    `mutation($o: ${table}_insert_input!) { insert_${table}_one(object: $o) { id code } }`,
    { o: { code: c, name: label, active: true, ...columns } },
  );
  return inserted[`insert_${table}_one`];
}

/** A body region is lookup-only here: unknown code → error. */
async function resolveBodyRegionId(token: string, raw: unknown): Promise<string> {
  const code = normalizeTaxonomy(raw);
  if (!code) throw new Error("A muscle group needs a body region");
  const data = await staffGql<{ catalog_body_regions: LookupRef[] }>(
    token,
    `query($code: String!) {
      catalog_body_regions(where: { code: { _eq: $code } }, limit: 1) { id code }
    }`,
    { code },
  );
  const hit = data.catalog_body_regions[0];
  if (!hit) throw new Error(`Unknown body region code: ${code}`);
  return hit.id;
}

function parseMapView(raw: unknown): (typeof MAP_VIEWS)[number] {
  const view = String(raw || "front");
  if (!MAP_VIEWS.includes(view as (typeof MAP_VIEWS)[number])) {
    throw new Error("map_view must be front|back");
  }
  return view as (typeof MAP_VIEWS)[number];
}

/** Support equipment is lookup-only: empty → null, unknown code → error. */
async function resolveSupportEquipmentId(token: string, raw: unknown): Promise<string | null> {
  const code = normalizeTaxonomy(raw);
  if (!code) return null;
  const data = await staffGql<{ catalog_support_equipment: LookupRef[] }>(
    token,
    `query($code: String!) {
      catalog_support_equipment(where: { code: { _eq: $code } }, limit: 1) { id code }
    }`,
    { code },
  );
  const hit = data.catalog_support_equipment[0];
  if (!hit) throw new Error(`Unknown support equipment code: ${code}`);
  return hit.id;
}

type ColumnSource = {
  column: string;
  table: LookupTable;
  keys: (keyof ExercisePayload)[];
  /** Code used when the payload leaves the field empty. */
  fallback?: (payload: ExercisePayload) => string;
};

const LOOKUP_COLUMNS: ColumnSource[] = [
  {
    column: "primary_muscle_group_id",
    table: "catalog_muscle_groups",
    keys: ["primary_muscle_group_code", "muscle_group"],
  },
  {
    column: "movement_type_id",
    table: "catalog_movement_types",
    keys: ["movement_type_code", "movement_type"],
  },
  { column: "equipment_id", table: "catalog_equipment", keys: ["equipment_code", "equipment"] },
  {
    column: "variation_id",
    table: "catalog_variations",
    keys: ["variation_code", "variation"],
    fallback: () => "STANDARD",
  },
  {
    column: "position_id",
    table: "catalog_positions",
    keys: ["position_code", "position"],
    fallback: () => "NEUTRAL",
  },
  {
    column: "grip_id",
    table: "catalog_grips",
    keys: ["grip_code", "grip"],
    fallback: () => "STANDARD",
  },
  {
    column: "load_modality_id",
    table: "catalog_load_modalities",
    keys: ["load_modality_code", "load_modality"],
    fallback: inferLoadModalityCode,
  },
  {
    column: "logging_mode_id",
    table: "catalog_logging_modes",
    keys: ["logging_mode_code", "logging_mode"],
    fallback: inferLoggingModeCode,
  },
];

export type ExerciseColumns = {
  /** Foreign keys for `catalog_exercises`, keyed by column name. */
  columns: Record<string, string | null>;
  /** Secondary muscle ids in order; undefined when an update leaves them untouched. */
  secondaryIds?: string[];
};

/**
 * Resolves the payload's codes to catalog ids. `create` fills every column (defaults and
 * inference for empty fields); `update` only resolves fields present in the payload, so the
 * exercise keeps the rest.
 */
export async function resolveExerciseColumns(
  token: string,
  payload: ExercisePayload,
  mode: "create" | "update",
): Promise<ExerciseColumns> {
  const has = (...keys: (keyof ExercisePayload)[]) =>
    mode === "create" || keys.some((key) => key in payload);
  const columns: Record<string, string | null> = {};

  // Sequential: target and secondary muscles may create the same new code.
  for (const source of LOOKUP_COLUMNS) {
    if (!has(...source.keys)) continue;
    const given = source.keys.map((key) => payload[key]).find(Boolean);
    const code = given || source.fallback?.(payload);
    columns[source.column] = (await ensureLookup(token, source.table, code)).id;
  }

  const targetCode = String(payload.target_muscle_code || "").trim();
  let targetId: string | null = null;
  if (has("target_muscle_code")) {
    targetId = targetCode ? (await ensureLookup(token, "catalog_muscles", targetCode)).id : null;
    columns.target_muscle_id = targetId;
  }

  if (has("support_equipment_code", "support_equipment")) {
    columns.support_equipment_id = await resolveSupportEquipmentId(
      token,
      payload.support_equipment_code ?? payload.support_equipment,
    );
  }

  if (!has("secondary_muscle_codes")) return { columns };
  const secondaryIds: string[] = [];
  for (const raw of payload.secondary_muscle_codes ?? []) {
    const code = String(raw || "").trim();
    if (!code || code === targetCode) continue;
    const { id } = await ensureLookup(token, "catalog_muscles", code);
    if (id !== targetId && !secondaryIds.includes(id)) secondaryIds.push(id);
  }
  return { columns, secondaryIds };
}

/** EN is required; ES/FR are written only when they have a label. One request per call. */
async function upsertTaxonomyLocalizations(
  token: string,
  table: LookupTable,
  parentId: string,
  labels: Partial<Record<CatalogLocale, unknown>>,
) {
  const cfg = TAXONOMY_LOCALIZATIONS[table];
  if (!cfg) return;
  const objects = CATALOG_LOCALES.flatMap((locale) => {
    const display_name = String(labels[locale] || "").trim();
    if (!display_name) {
      if (locale === "en") throw new Error("English label is required");
      return [];
    }
    return [{ [cfg.fk]: parentId, locale, display_name }];
  });
  await staffGql(
    token,
    `mutation($objects: [${cfg.table}_insert_input!]!) {
      insert_${cfg.table}(
        objects: $objects
        on_conflict: { constraint: ${cfg.constraint}, update_columns: [display_name] }
      ) { affected_rows }
    }`,
    { objects },
  );
}

/** A muscle has one target home group: linking as target moves it out of any other group. */
async function linkMuscleToGroup(
  token: string,
  groupId: string,
  muscleId: string,
  roleRaw: unknown,
) {
  const role = roleRaw === "secondary" ? "secondary" : "target";
  const moveTarget =
    role === "target"
      ? `delete_catalog_muscle_group_muscles(
          where: { muscle_id: { _eq: $m }, role: { _eq: "target" }, muscle_group_id: { _neq: $mg } }
        ) { affected_rows }`
      : "";
  await staffGql(
    token,
    `mutation($mg: uuid!, $m: uuid!, $role: String!) {
      ${moveTarget}
      insert_catalog_muscle_group_muscles(
        objects: [{ muscle_group_id: $mg, muscle_id: $m, role: $role }]
        on_conflict: { constraint: muscle_group_muscles_pkey, update_columns: [role] }
      ) { affected_rows }
    }`,
    { mg: groupId, m: muscleId, role },
  );
}

export type UpsertLookupPayload = {
  table?: unknown;
  code?: unknown;
  name?: unknown;
  labels?: Partial<Record<CatalogLocale, unknown>>;
  muscle_group_code?: unknown;
  role?: unknown;
  /** Required for a new muscle group. */
  body_region_code?: unknown;
  /** New body region: card view, front (default) or back. */
  map_view?: unknown;
};

/** Extra fields of a new row of an explicit table. */
async function explicitColumns(
  token: string,
  table: LookupTable,
  payload: UpsertLookupPayload,
): Promise<Record<string, unknown> | undefined> {
  if (table === "catalog_muscle_groups") {
    return { body_region_id: await resolveBodyRegionId(token, payload.body_region_code) };
  }
  if (table === "catalog_body_regions") return { map_view: parseMapView(payload.map_view) };
  return undefined;
}

export async function upsertLookup(token: string, payload: UpsertLookupPayload) {
  const table = assertLookupTable(payload.table);
  const row = await ensureLookup(
    token,
    table,
    payload.code,
    payload.name,
    await explicitColumns(token, table, payload),
  );
  if (TAXONOMY_LOCALIZATIONS[table]) {
    await upsertTaxonomyLocalizations(token, table, row.id, {
      en: String(payload.name || "").trim() || defaultLookupName(row.code),
      es: payload.labels?.es || "",
      fr: payload.labels?.fr || "",
    });
  }
  if (table === "catalog_muscles" && payload.muscle_group_code) {
    const group = await ensureLookup(token, "catalog_muscle_groups", payload.muscle_group_code);
    await linkMuscleToGroup(token, group.id, row.id, payload.role);
  }
  return row;
}

export type UpdateLookupPayload = {
  table?: unknown;
  id?: unknown;
  name?: unknown;
  labels?: Partial<Record<CatalogLocale, unknown>>;
  active?: unknown;
  sort_order?: unknown;
  description?: unknown;
  /** Muscle groups: move to another body region. */
  body_region_code?: unknown;
  /** Body regions: card view. */
  map_view?: unknown;
};

const DESCRIBED_LOOKUP_TABLES = new Set([
  "catalog_body_regions",
  "catalog_grips",
  "catalog_support_equipment",
  "catalog_muscles",
  "catalog_muscle_groups",
]);

export async function updateLookup(token: string, payload: UpdateLookupPayload) {
  const table = assertLookupTable(payload.table);
  const id = String(payload.id || "");
  if (!id) throw new Error("id required");
  const labels = TAXONOMY_LOCALIZATIONS[table] && payload.labels ? payload.labels : null;
  const set: Record<string, unknown> = {};
  if (payload.name != null) set.name = String(payload.name).trim();
  if (labels) set.name = String(labels.en || payload.name || "").trim();
  if (payload.active != null) set.active = Boolean(payload.active);
  if (payload.sort_order != null) set.sort_order = Number(payload.sort_order);
  if (DESCRIBED_LOOKUP_TABLES.has(table) && payload.description !== undefined) {
    const text = String(payload.description ?? "").trim();
    set.description = text || null;
  }
  if (table === "catalog_muscle_groups" && payload.body_region_code != null) {
    set.body_region_id = await resolveBodyRegionId(token, payload.body_region_code);
  }
  if (table === "catalog_body_regions" && payload.map_view != null) {
    set.map_view = parseMapView(payload.map_view);
  }
  if (!Object.keys(set).length && !labels) throw new Error("nothing to update");

  const columns = [
    "id code name active sort_order",
    DESCRIBED_LOOKUP_TABLES.has(table) && "description",
    table === "catalog_muscle_groups" && "body_region_id",
    table === "catalog_body_regions" && "map_view",
  ];
  const fields = `{ ${columns.filter(Boolean).join(" ")} }`;
  const data = Object.keys(set).length
    ? await staffGql<Record<string, unknown>>(
        token,
        `mutation($id: uuid!, $set: ${table}_set_input!) {
          row: update_${table}_by_pk(pk_columns: { id: $id }, _set: $set) ${fields}
        }`,
        { id, set },
      )
    : await staffGql<Record<string, unknown>>(
        token,
        `query($id: uuid!) { row: ${table}_by_pk(id: $id) ${fields} }`,
        { id },
      );
  if (labels) await upsertTaxonomyLocalizations(token, table, id, labels);
  return data.row;
}

export type RelationPayload = {
  action?: unknown;
  kind?: unknown;
  muscle_group_code?: unknown;
  code?: unknown;
  role?: unknown;
};

export async function manageRelation(token: string, payload: RelationPayload) {
  const action = String(payload.action || "");
  const kind = String(payload.kind || "");
  if (action !== "link" && action !== "unlink") throw new Error("action must be link|unlink");
  if (kind !== "muscle" && kind !== "movement") throw new Error("kind must be muscle|movement");

  const group = await ensureLookup(token, "catalog_muscle_groups", payload.muscle_group_code);
  if (kind === "muscle") {
    const muscle = await ensureLookup(token, "catalog_muscles", payload.code);
    if (action === "link") {
      await linkMuscleToGroup(token, group.id, muscle.id, payload.role);
      return;
    }
    await staffGql(
      token,
      `mutation($mg: uuid!, $m: uuid!) {
        delete_catalog_muscle_group_muscles(
          where: { muscle_group_id: { _eq: $mg }, muscle_id: { _eq: $m } }
        ) { affected_rows }
      }`,
      { mg: group.id, m: muscle.id },
    );
    return;
  }

  const movement = await ensureLookup(token, "catalog_movement_types", payload.code);
  await staffGql(
    token,
    action === "link"
      ? `mutation($mg: uuid!, $mt: uuid!) {
          insert_catalog_muscle_group_movement_types(
            objects: [{ muscle_group_id: $mg, movement_type_id: $mt }]
            on_conflict: { constraint: muscle_group_movement_types_pkey, update_columns: [] }
          ) { affected_rows }
        }`
      : `mutation($mg: uuid!, $mt: uuid!) {
          delete_catalog_muscle_group_movement_types(
            where: { muscle_group_id: { _eq: $mg }, movement_type_id: { _eq: $mt } }
          ) { affected_rows }
        }`,
    { mg: group.id, mt: movement.id },
  );
}

export type GroupMovementLabelsPayload = {
  muscle_group_code?: unknown;
  movement_type_code?: unknown;
  labels?: Partial<Record<CatalogLocale, unknown>>;
};

/**
 * Custom names for a linked group + movement pair ("Chest Press" instead of "Chest - Press").
 * Filled locales are upserted and emptied ones deleted, in one mutation; no locale is required.
 */
export async function setGroupMovementLabels(token: string, payload: GroupMovementLabelsPayload) {
  const groupCode = normalizeTaxonomy(payload.muscle_group_code);
  const movementCode = normalizeTaxonomy(payload.movement_type_code);
  if (!groupCode || !movementCode) throw new Error("muscle_group_code and movement_type_code required");
  const found = await staffGql<{
    catalog_muscle_group_movement_types: { muscle_group_id: string; movement_type_id: string }[];
  }>(
    token,
    `query($g: String!, $m: String!) {
      catalog_muscle_group_movement_types(
        where: { muscle_group: { code: { _eq: $g } }, movement_type: { code: { _eq: $m } } }
        limit: 1
      ) { muscle_group_id movement_type_id }
    }`,
    { g: groupCode, m: movementCode },
  );
  const pair = found.catalog_muscle_group_movement_types[0];
  if (!pair) throw new Error(`${movementCode} is not linked to ${groupCode}; link it first`);

  const labels = payload.labels ?? {};
  const filled = CATALOG_LOCALES.flatMap((locale) => {
    const display_name = String(labels[locale] || "").trim();
    return display_name ? [{ ...pair, locale, display_name }] : [];
  });
  const cleared = CATALOG_LOCALES.filter((locale) => !filled.some((row) => row.locale === locale));
  await staffGql(
    token,
    `mutation(
      $g: uuid!
      $m: uuid!
      $objects: [catalog_muscle_group_movement_type_localizations_insert_input!]!
      $cleared: [String!]!
    ) {
      insert_catalog_muscle_group_movement_type_localizations(
        objects: $objects
        on_conflict: {
          constraint: muscle_group_movement_type_localizations_pair_locale_key
          update_columns: [display_name]
        }
      ) { affected_rows }
      delete_catalog_muscle_group_movement_type_localizations(
        where: { muscle_group_id: { _eq: $g }, movement_type_id: { _eq: $m }, locale: { _in: $cleared } }
      ) { affected_rows }
    }`,
    { g: pair.muscle_group_id, m: pair.movement_type_id, objects: filled, cleared },
  );
}

export function fetchTaxonomy(token: string) {
  return staffGql(
    token,
    `query TaxonomyAdmin {
      catalog_body_regions(order_by: { sort_order: asc, code: asc }) {
        id code name description map_view sort_order active
        localizations(order_by: { locale: asc }) { locale display_name }
      }
      catalog_muscle_groups(order_by: { sort_order: asc, code: asc }) {
        id code name description sort_order active body_region_id
        localizations(order_by: { locale: asc }) { locale display_name }
        group_muscles { role muscle { id code name description active localizations(order_by: { locale: asc }) { locale display_name } } }
        group_movement_types {
          movement_type { id code name active localizations(order_by: { locale: asc }) { locale display_name } }
          localizations(order_by: { locale: asc }) { locale display_name }
        }
      }
      catalog_muscles(order_by: { code: asc }) {
        id code name description sort_order active
        localizations(order_by: { locale: asc }) { locale display_name }
      }
      catalog_movement_types(order_by: { sort_order: asc, code: asc }) {
        id code name sort_order active
        localizations(order_by: { locale: asc }) { locale display_name }
      }
      catalog_equipment(order_by: { sort_order: asc, code: asc }) {
        id code name sort_order active
        localizations(order_by: { locale: asc }) { locale display_name }
      }
      catalog_support_equipment(order_by: { sort_order: asc, code: asc }) {
        id code name description sort_order active
        localizations(order_by: { locale: asc }) { locale display_name }
      }
      catalog_variations(order_by: { sort_order: asc, code: asc }) { id code name sort_order active }
      catalog_positions(order_by: { sort_order: asc, code: asc }) { id code name sort_order active }
      catalog_grips(order_by: { sort_order: asc, code: asc }) { id code name description sort_order active }
      catalog_load_modalities(order_by: { sort_order: asc, code: asc }) {
        id code name sort_order active
        localizations(order_by: { locale: asc }) { locale display_name }
      }
      catalog_logging_modes(order_by: { sort_order: asc, code: asc }) { id code name sort_order active }
    }`,
  );
}
