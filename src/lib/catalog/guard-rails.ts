/**
 * The catalog guard rails of backend 2.10.0 (migration 1790000000100 and later), checked by
 * Support before it writes, so staff get a clear message instead of a refused transaction.
 * The database stays the authority: these checks mirror its rules (DATABASE_CONTRACT "Catalog
 * guard rails", STATS_CONTRACT Metric 1) and `friendlyCatalogError` turns what it still refuses
 * into a message written for staff. Pure functions: the form and the API routes share them.
 */

export const MUSCLES_CUSTOM_REASON_REQUIRED =
  "Custom muscles need a reason: write why this exercise does not use its pair's muscles (muscles_custom_reason)";

export const BODY_MASS_COEFFICIENT_RANGE =
  "C_ex (body_mass_coefficient) must be empty or a number greater than 0 and at most 1";

export const PULLEY_RATIO_POSITIVE = "Pulley ratio (default_pulley_ratio) must be a number greater than 0";

/** Taxonomy codes are stable ids; a new one is upper case, digits, `_` or `-`, no spaces. */
const NEW_CODE = /^[A-Z][A-Z0-9_-]*$/;
/** Movement codes are UPPER_SNAKE without `-` (CHECK movement_types_code_format, 1790000000108). */
const NEW_MOVEMENT_CODE = /^[A-Z][A-Z0-9_]*$/;

/**
 * The code a new taxonomy value gets: trimmed, upper case, spaces as `_` (and `-` too for movement
 * types). Fails when the result still breaks the database format, rather than inventing a code.
 */
export function newTaxonomyCode(table: string, raw: unknown): string {
  const movement = table === "catalog_movement_types";
  const code = String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(movement ? /[\s-]+/g : /\s+/g, "_");
  if (!code) throw new Error("A code is required");
  if (!(movement ? NEW_MOVEMENT_CODE : NEW_CODE).test(code)) {
    throw new Error(
      movement
        ? `Code ${code}: a movement code is upper case letters, digits and _ (e.g. HIP_ABDUCTION)`
        : `Code ${code}: upper case letters, digits, _ or - and no spaces (e.g. SMITH_MACHINE)`,
    );
  }
  return code;
}

const isBlank = (value: unknown) =>
  value === undefined || value === null || String(value).trim() === "";

/** C_ex: empty (no body mass) or a number in (0, 1]. */
export function parseBodyMassCoefficient(raw: unknown): number | null {
  if (isBlank(raw)) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 1) throw new Error(BODY_MASS_COEFFICIENT_RANGE);
  return n;
}

/** Pulley ratio: empty means 1 (the user logs the stack number); otherwise > 0. */
export function parsePulleyRatio(raw: unknown): number {
  if (isBlank(raw)) return 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(PULLEY_RATIO_POSITIVE);
  return n;
}

/** What the load-model rules read, by code. */
export type LoadModelInput = {
  groupCode: string;
  /** `kind` of the primary group (`major`, `accessory`, `cardio`); unknown = not cardio. */
  groupKind?: string | null;
  equipment: string;
  loadModality: string;
  loggingMode: string;
  bodyMassCoefficient: number | null;
  pulleyRatio: number;
};

/**
 * The load-model rule a catalog exercise breaks, null when none: same order and wording as
 * `catalog.load_model_violation` (1790000000116), so the form says what the database would.
 */
export function loadModelViolation(x: LoadModelInput): string | null {
  const cexSet = x.bodyMassCoefficient !== null;
  if (x.loggingMode === "LOAD" && ["BODYWEIGHT", "ASSISTED"].includes(x.loadModality) && !cexSet) {
    return `${x.loadModality} logged as LOAD needs a C_ex (the body is the load; without it the set logs 0 kg)`;
  }
  if (x.loadModality === "RESISTED" && cexSet && !["NONE", "DIP_BELT", "PLATE", "BAND"].includes(x.equipment)) {
    return `RESISTED on ${x.equipment} counts the external load only: leave C_ex empty`;
  }
  if (x.loggingMode === "TIME" && cexSet) return "TIME exercises have no C_ex: leave it empty";
  if (x.loggingMode === "TIME" && x.loadModality !== "BODYWEIGHT") {
    return "TIME exercises take load modality BODYWEIGHT";
  }
  if (x.loadModality === "ASSISTED" && !["BAND", "MACHINE"].includes(x.equipment)) {
    return "ASSISTED only on BAND or MACHINE";
  }
  if (x.equipment === "NONE" && x.loadModality !== "BODYWEIGHT") {
    return "Equipment NONE means load modality BODYWEIGHT";
  }
  if (x.groupKind === "cardio" && x.loggingMode !== "TIME") {
    return `${x.groupCode} exercises are logged as TIME (a group of kind cardio)`;
  }
  if (x.pulleyRatio !== 1 && x.equipment !== "CABLE") {
    return "A pulley ratio other than 1 only on CABLE (1 = the user logs the stack number)";
  }
  return null;
}

/** Everything the exercise guard rails read, resolved to codes. */
export type ExerciseGuardInput = LoadModelInput & {
  musclesInherited: boolean;
  musclesCustomReason?: string | null;
  /** The target the row will hold. */
  targetCode: string;
  /** Home group of that target muscle; null when it has none. */
  targetHomeGroupCode: string | null;
};

/** Every guard rail the exercise breaks, as staff messages (empty: it can be saved). */
export function exerciseGuardRailErrors(x: ExerciseGuardInput): string[] {
  const errors: string[] = [];
  if (!x.musclesInherited && isBlank(x.musclesCustomReason)) errors.push(MUSCLES_CUSTOM_REASON_REQUIRED);
  if (x.targetCode && x.targetHomeGroupCode !== x.groupCode) {
    errors.push(targetHomeMessage(x.targetCode, x.targetHomeGroupCode, x.groupCode));
  }
  const load = loadModelViolation(x);
  if (load) errors.push(load);
  return errors;
}

export function targetHomeMessage(target: string, home: string | null, group: string): string {
  return `Target muscle ${target} belongs to ${home ? `group ${home}` : "no group"}, not ${group}: the target must be one of ${group}'s own muscles`;
}

/** Lower-cased, trimmed name, as the database compares names (`lower(btrim(display_name))`). */
export const nameKey = (name: unknown) => String(name ?? "").trim().toLowerCase();

export type LocalizedName = { locale: string; display_name?: string | null };
export type NamedExercise = { exo_id: number; localizations?: LocalizedName[] };

/**
 * Names of `names` (per locale) already used by another active exercise. The database refuses a
 * duplicate name per locale among active exercises; `exoId` is the exercise being edited.
 */
export function duplicateNameErrors(
  names: Partial<Record<string, string | null | undefined>>,
  exercises: NamedExercise[],
  exoId?: number | null,
): string[] {
  const errors: string[] = [];
  for (const [locale, name] of Object.entries(names)) {
    const key = nameKey(name);
    if (!key) continue;
    const clash = exercises.find(
      (e) =>
        e.exo_id !== exoId &&
        (e.localizations ?? []).some((l) => l.locale === locale && nameKey(l.display_name) === key),
    );
    if (clash) {
      errors.push(`${locale.toUpperCase()} name "${String(name).trim()}" is already used by active exercise #${clash.exo_id}`);
    }
  }
  return errors;
}

/** Where a catalog error happened, for the message when the database gives no detail. */
export type CatalogErrorContext =
  | "exercise"
  | "deactivate"
  | "lookup"
  | "link_muscle"
  | "unlink_muscle"
  | "movement"
  | "pair"
  | "synonym";

/** Hasura's answer when a rule checked at commit refuses the transaction (no detail, devMode off). */
const GENERIC_DB_ERROR = /^(postgres tx error|database query error|unexpected)$/i;

/**
 * The class Hasura puts before a Postgres constraint message it passes to clients with devMode
 * off ("Check constraint violation. <message>"); the message after it is the useful part.
 */
const HASURA_PREFIX = /^(check constraint|foreign key|uniqueness|not-null|restrict|exclusion) violation\.\s*/i;

const GENERIC_BY_CONTEXT: Record<CatalogErrorContext, string> = {
  exercise:
    "The database refused the save (a catalog guard rail checked at commit, usually custom muscles without a reason). Nothing was saved: check the muscles section and try again.",
  deactivate: "The database refused to deactivate this exercise. Nothing changed.",
  lookup:
    "The database refused this change (a catalog guard rail: a value in use cannot be deactivated, codes never change). Nothing changed.",
  link_muscle:
    "The database refused the move: the muscle is still the target of exercises, pairs or user custom exercises of its current group. Give those another target first, or link it as secondary.",
  unlink_muscle:
    "The database refused the unlink: an active muscle cannot be left without a home group. Link it as target of another group first (that moves it), or deactivate it.",
  movement: "The database refused this change to the group's movements. Nothing changed.",
  pair: "The database refused the pair change (targets must be muscles of the group; a profile's target is not the pair's, and a profile in use by inherited exercises cannot be deleted). Nothing changed.",
  synonym: "The database refused this search synonym change. Nothing changed.",
};

type Rule = { test: RegExp; message: (m: RegExpMatchArray) => string };

/**
 * Database messages that hold "; " themselves (the profile guards of 1790000000107): matched on
 * the error and the parts after it, so their second clause is not shown as another error.
 */
const SPANNING_RULES: Rule[] = [
  {
    test: /^catalog\.pair_target_profiles: (\S+) is the pair's own target; a profile is for another target of the pair/,
    message: (m) => `${m[1]} is the pair's own target: a profile is for another target of the pair`,
  },
  {
    test: /^catalog\.muscle_group_movement_types: the pair has a target profile for (\S+); delete the profile before making it the pair's target/,
    message: (m) =>
      `The pair has a target profile for ${m[1]}: delete that profile before making ${m[1]} the pair's target`,
  },
  {
    test: /^catalog\.pair_target_profiles: exercise exo_id (\d+) inherits its muscles through this profile; give it its own muscles \(muscles_inherited = false, with muscles_custom_reason\) or another target first/,
    message: (m) => `Exercise #${m[1]} inherits its muscles through this target profile: change it first`,
  },
];

/** Database guard-rail messages (written for staff already) reworded for the Support UI. */
const RULES: Rule[] = [
  {
    test: /needs muscles_custom_reason/,
    message: () => MUSCLES_CUSTOM_REASON_REQUIRED,
  },
  {
    test: /exercise exo_id (\d+) inherits its muscles from its pair/,
    message: (m) =>
      `Exercise #${m[1]} inherits its pair's muscles: edit them in Taxonomy → Group movements, or switch it to Custom (with a reason)`,
  },
  {
    test: /target muscle (\S+) has its home in group (\S+), not (\S+)/,
    message: (m) => targetHomeMessage(m[1], m[2] === "none" ? null : m[2], m[3]),
  },
  {
    test: /^catalog\.exercises exo_id \d+ \(.*\): ([\s\S]+)$/,
    message: (m) => `Load model: ${m[1]}`,
  },
  {
    test: /catalog\.(\w+): (\S+) cannot be deactivated, it is used by ([\s\S]+)$/,
    message: (m) => `${m[2]} cannot be deactivated: it is used by ${m[3]}`,
  },
  {
    test: /catalog\.(\w+): (\S+) is named by search synonyms/,
    message: (m) => `${m[2]} is named by search synonyms: delete them first (Catalog → Search synonyms)`,
  },
  {
    test: /catalog\.search_synonyms \((\w+), (.*)\): (\w+) (\S+) does not exist/,
    message: (m) => `"${m[2]}" (${m[1]}): ${m[3] === "exercise" ? `exercise #${m[4]}` : `${m[3]} ${m[4]}`} does not exist`,
  },
  {
    test: /search_synonyms_pkey/,
    message: () =>
      "This phrase already stands for that code in this locale (before backend 2.12.0, a phrase can stand for one code only)",
  },
  {
    test: /search_synonyms_kind_check/,
    message: () => "The backend does not know this synonym kind yet (also_muscle needs backend 2.12.0)",
  },
  {
    test: /search_synonyms_phrase_check/,
    message: () => "A phrase is lower case letters and digits separated by single spaces",
  },
  {
    test: /code (.+?) must match/,
    message: (m) => `Code ${m[1]}: upper case letters, digits, _ or - and no spaces`,
  },
  {
    test: /code (.+?) is a stable id/,
    message: (m) => `Code ${m[1]} cannot change: codes are stable ids (a rename is a backend migration)`,
  },
  {
    test: /(\w+) name "(.*)" is already used by active exercise exo_id (\d+)/,
    message: (m) => `${m[1].toUpperCase()} name "${m[2]}" is already used by active exercise #${m[3]}`,
  },
  {
    test: /exercises_display_name_active_key/,
    message: () => "The English name is already used by another active exercise",
  },
  {
    test: /muscle (\S+) would have its home in (.+?), but (.+?) targets it from another group/,
    message: (m) =>
      `${m[1]} cannot move${m[2] === "no group" ? "" : ` to ${m[2]}`}: ${m[3]} targets it from its current group. Give those another target first, or link it as secondary`,
  },
  {
    test: /active muscle (\S+) would be left without a home group/,
    message: (m) =>
      `${m[1]} would be left without a home group: link it as target of another group first (that moves it), or deactivate it`,
  },
  {
    test: /exercise exo_id (\d+) inherits its muscles through this profile/,
    message: (m) => `Exercise #${m[1]} inherits its muscles through this target profile: change it first`,
  },
  {
    test: /field '(insert_catalog_(\w+?)_one|insert_catalog_\w+)' not found/,
    message: () => "Staff cannot add values to this list: new values only by backend migration",
  },
  {
    test: /query is not (allowed|in any of the allowlists)/,
    message: () =>
      "The backend does not accept this request yet (allow-list): this Support needs a newer backend",
  },
];

/**
 * A staff-readable message for a catalog write error: database guard-rail texts are reworded,
 * and the generic answers Hasura gives without detail ("postgres tx error", "database query
 * error") become a message for the action that failed. Anything else is returned as it is.
 */
export function friendlyCatalogError(raw: unknown, context: CatalogErrorContext): string {
  const message = (raw instanceof Error ? raw.message : String(raw ?? "")).trim();
  if (!message || GENERIC_DB_ERROR.test(message)) return GENERIC_BY_CONTEXT[context];
  const pieces = message.split("; ");
  const parts: string[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const part = pieces[i].trim().replace(HASURA_PREFIX, "");
    if (GENERIC_DB_ERROR.test(part)) {
      parts.push(GENERIC_BY_CONTEXT[context]);
      continue;
    }
    const rest = [part, ...pieces.slice(i + 1)].join("; ");
    const spanning = SPANNING_RULES.find((r) => r.test.test(rest));
    if (spanning) {
      const match = rest.match(spanning.test)!;
      parts.push(spanning.message(match));
      i += match[0].split("; ").length - 1;
      continue;
    }
    const rule = RULES.find((r) => r.test.test(part));
    parts.push(rule ? rule.message(part.match(rule.test)!) : part);
  }
  return [...new Set(parts)].join("; ");
}

/** Where a muscle is the target, as `SupportTaxonomyMuscleUse` returns it. */
export type MuscleUse = {
  muscle: { code: string; active?: boolean; home_muscle_group_id?: string | null } | null;
  exercises: Array<{ exo_id: number; primary_muscle_group_id: string }>;
  pairs: Array<{ muscle_group_id: string; muscle_group?: { code: string }; movement_type?: { code: string } }>;
  profiles: Array<{
    muscle_group_id: string;
    pair?: { muscle_group?: { code: string }; movement_type?: { code: string } } | null;
  }>;
};

/**
 * Why linking a muscle as target of `groupId` (which moves its home there) would be refused: the
 * exercises, pairs and target profiles of other groups that target it (the database checks them,
 * plus user custom exercises Support cannot read, at commit). Null when nothing blocks the move.
 */
export function muscleMoveBlocker(use: MuscleUse, groupId: string, groupCode: string): string | null {
  const code = use.muscle?.code ?? "this muscle";
  if (!use.muscle?.home_muscle_group_id || use.muscle.home_muscle_group_id === groupId) return null;
  const users = [
    ...use.exercises.filter((e) => e.primary_muscle_group_id !== groupId).map((e) => `exercise #${e.exo_id}`),
    ...use.pairs
      .filter((p) => p.muscle_group_id !== groupId)
      .map((p) => `pair ${p.muscle_group?.code} + ${p.movement_type?.code}`),
    ...use.profiles
      .filter((p) => p.muscle_group_id !== groupId)
      .map((p) => `target profile of ${p.pair?.muscle_group?.code} + ${p.pair?.movement_type?.code}`),
  ];
  if (!users.length) return null;
  const shown = users.slice(0, 6).join(", ") + (users.length > 6 ? ` and ${users.length - 6} more` : "");
  return `${code} cannot move to ${groupCode}: it is the target of ${shown} in its current group. Give those another target first, or link it to ${groupCode} as secondary`;
}

/** Why unlinking `groupId`'s membership of a muscle would be refused (its home, while active). */
export function muscleUnlinkBlocker(use: MuscleUse, groupId: string, groupCode: string): string | null {
  const m = use.muscle;
  if (!m || m.active === false || m.home_muscle_group_id !== groupId) return null;
  return `${m.code} has its home in ${groupCode}: an active muscle cannot be left without a home group. Link it as target of another group first (that moves it), or deactivate it`;
}

/** The pair of an exercise as `SupportCatalogGuardContext` returns it (null: no pair row yet). */
export type PairMusclesRef = {
  target_muscle?: { code: string } | null;
  target_profiles?: Array<{ target_muscle?: { code: string } | null }>;
} | null;

/**
 * How an exercise's muscles are written:
 * - `inherit`: the pair has muscles. One write with `muscles_inherited = true` and no secondaries
 *   (sending them is refused): the database forces the pair's target, unless the pair has a
 *   target profile for the target sent (1790000000107), and copies the matching secondaries.
 * - `inherit_new_pair`: the pair has no target yet. The row is written custom with the form's
 *   muscles and switched to inherited in the same transaction, so the pair takes them.
 * - `custom`: its own target and secondaries, with a reason.
 */
export type MusclePlan = {
  mode: "inherit" | "inherit_new_pair" | "custom";
  /** The target the row is written with. */
  target: string;
  /** Whether the secondary muscles of the payload are written. */
  writeSecondaries: boolean;
};

export function planExerciseMuscles(inherit: boolean, pair: PairMusclesRef, target: string): MusclePlan {
  if (!inherit) return { mode: "custom", target, writeSecondaries: true };
  const pairTarget = pair?.target_muscle?.code;
  if (!pairTarget) return { mode: "inherit_new_pair", target, writeSecondaries: true };
  const profiled = (pair?.target_profiles ?? []).some((p) => p.target_muscle?.code === target);
  return { mode: "inherit", target: profiled ? target : pairTarget, writeSecondaries: false };
}

/** A LIKE pattern matching `text` literally (case-insensitive with `_ilike`). */
export function likeLiteral(text: string): string {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
