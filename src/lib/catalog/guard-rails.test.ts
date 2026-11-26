import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLOSED_LOOKUP_TABLES } from "./closed-lookups.ts";
import { findLookupRow, requireLookupRow, type LookupFinder } from "./lookup-find.ts";
import { requireCode } from "./normalize.ts";

describe("closed lookup lists", () => {
  it("lists the tables that only a backend migration extends", () => {
    for (const t of ["catalog_load_modalities", "catalog_logging_modes", "catalog_strength_patterns"])
      assert.ok(CLOSED_LOOKUP_TABLES.has(t));
    assert.ok(!CLOSED_LOOKUP_TABLES.has("catalog_equipment"));
  });
});

describe("lookup resolution", () => {
  const calls: string[] = [];
  const finder =
    (rows: Record<string, { id: string; code: string }[]>): LookupFinder =>
    async (code) => {
      calls.push(code);
      return rows;
    };

  it("returns an existing row, normalizing the code", async () => {
    const find = finder({ catalog_equipment: [{ id: "1", code: "BARBELL" }] });
    assert.deepEqual(await requireLookupRow(find, "catalog_equipment", " barbell "), {
      id: "1",
      code: "BARBELL",
    });
    assert.equal(calls.at(-1), "BARBELL");
  });
  it("fails on an unknown code instead of creating it", async () => {
    const find = finder({ catalog_equipment: [] });
    await assert.rejects(
      requireLookupRow(find, "catalog_equipment", "shiny_new"),
      /Unknown equipment code: SHINY_NEW\. Create it in Taxonomy first\./,
    );
    assert.equal(await findLookupRow(find, "catalog_equipment", "shiny_new"), null);
  });
  it("rejects an empty code", async () => {
    await assert.rejects(requireLookupRow(finder({}), "catalog_positions", "  "), /Empty code/);
  });
});

describe("requireCode", () => {
  it("returns the first non-empty candidate", () => {
    assert.equal(requireCode("position", "", " SEATED "), "SEATED");
  });
  it("fails when empty, with no default", () => {
    assert.throws(() => requireCode("position", "", undefined, null), /position is required/);
    assert.throws(() => requireCode("load modality", "  "), /load modality is required/);
  });
});

// Backend 2.10.0 guard rails (CU-123m57f7ng0).
import {
  duplicateNameErrors,
  exerciseGuardRailErrors,
  friendlyCatalogError,
  likeLiteral,
  loadModelViolation,
  muscleMoveBlocker,
  muscleUnlinkBlocker,
  MUSCLES_CUSTOM_REASON_REQUIRED,
  newTaxonomyCode,
  parseBodyMassCoefficient,
  parsePulleyRatio,
  planExerciseMuscles,
  type LoadModelInput,
  type MuscleUse,
} from "./guard-rails.ts";
import { NO_STAFF_INSERT_TABLES } from "./closed-lookups.ts";

describe("new taxonomy codes", () => {
  it("are SCREAMING_SNAKE without spaces", () => {
    assert.equal(newTaxonomyCode("catalog_equipment", " smith  machine "), "SMITH_MACHINE");
    assert.equal(newTaxonomyCode("catalog_equipment", "ez-bar"), "EZ-BAR");
    assert.equal(newTaxonomyCode("catalog_movement_types", "hip push-down"), "HIP_PUSH_DOWN");
  });
  it("fail instead of inventing a code", () => {
    assert.throws(() => newTaxonomyCode("catalog_equipment", "9KG"), /upper case/);
    assert.throws(() => newTaxonomyCode("catalog_equipment", "a.b"), /upper case/);
    assert.throws(() => newTaxonomyCode("catalog_equipment", "  "), /code is required/);
  });
  it("lookups try the code as typed, then its SCREAMING_SNAKE form", async () => {
    const seen: string[] = [];
    const find: LookupFinder = async (code) => {
      seen.push(code);
      return { catalog_equipment: code === "SMITH_MACHINE" ? [{ id: "9", code }] : [] };
    };
    assert.deepEqual(await findLookupRow(find, "catalog_equipment", "smith machine"), { id: "9", code: "SMITH_MACHINE" });
    assert.deepEqual(seen, ["SMITH MACHINE", "SMITH_MACHINE"]);
  });
  it("grips, variations and positions take no staff insert", () => {
    for (const t of ["catalog_grips", "catalog_variations", "catalog_positions", "catalog_load_modalities"])
      assert.ok(NO_STAFF_INSERT_TABLES.has(t));
    assert.ok(!NO_STAFF_INSERT_TABLES.has("catalog_equipment"));
  });
});

describe("biomechanics ranges", () => {
  it("C_ex is empty or in (0, 1]", () => {
    assert.equal(parseBodyMassCoefficient(""), null);
    assert.equal(parseBodyMassCoefficient("1"), 1);
    assert.equal(parseBodyMassCoefficient(0.65), 0.65);
    assert.throws(() => parseBodyMassCoefficient(0), /C_ex/);
    assert.throws(() => parseBodyMassCoefficient("1.2"), /C_ex/);
    assert.throws(() => parseBodyMassCoefficient("abc"), /C_ex/);
  });
  it("pulley ratio defaults to 1 and is positive", () => {
    assert.equal(parsePulleyRatio(""), 1);
    assert.equal(parsePulleyRatio("2"), 2);
    assert.throws(() => parsePulleyRatio("0"), /Pulley/);
  });
});

describe("load model", () => {
  const base: LoadModelInput = {
    groupCode: "CHEST",
    groupKind: "major",
    equipment: "BARBELL",
    loadModality: "RESISTED",
    loggingMode: "LOAD",
    bodyMassCoefficient: null,
    pulleyRatio: 1,
  };
  const cases: [Partial<LoadModelInput>, RegExp | null][] = [
    [{}, null],
    [{ equipment: "NONE", loadModality: "BODYWEIGHT" }, /BODYWEIGHT logged as LOAD needs a C_ex/],
    [{ equipment: "NONE", loadModality: "BODYWEIGHT", bodyMassCoefficient: 0.65 }, null],
    [{ bodyMassCoefficient: 0.5 }, /RESISTED on BARBELL counts the external load only/],
    [{ equipment: "DIP_BELT", bodyMassCoefficient: 0.9 }, null],
    [{ loggingMode: "TIME", loadModality: "BODYWEIGHT", bodyMassCoefficient: 0.5 }, /TIME exercises have no C_ex/],
    [{ loggingMode: "TIME" }, /TIME exercises take load modality BODYWEIGHT/],
    [{ loadModality: "ASSISTED", bodyMassCoefficient: 1 }, /ASSISTED only on BAND or MACHINE/],
    [{ equipment: "NONE" }, /Equipment NONE means load modality BODYWEIGHT/],
    [{ groupCode: "CARDIO", groupKind: "cardio" }, /CARDIO exercises are logged as TIME/],
    [{ pulleyRatio: 2 }, /pulley ratio other than 1 only on CABLE/],
    [{ pulleyRatio: 2, equipment: "CABLE" }, null],
  ];
  for (const [patch, expected] of cases) {
    it(`${JSON.stringify(patch)} → ${expected ?? "ok"}`, () => {
      const problem = loadModelViolation({ ...base, ...patch });
      if (expected) assert.match(problem ?? "", expected);
      else assert.equal(problem, null);
    });
  }
});

describe("exercise guard rails", () => {
  const ok = {
    groupCode: "CHEST",
    groupKind: "major",
    equipment: "BARBELL",
    loadModality: "RESISTED",
    loggingMode: "LOAD",
    bodyMassCoefficient: null,
    pulleyRatio: 1,
    musclesInherited: true,
    targetCode: "MID_PECTORALS",
    targetHomeGroupCode: "CHEST",
  };
  it("pass for a valid inherited exercise", () => assert.deepEqual(exerciseGuardRailErrors(ok), []));
  it("custom muscles need a reason", () => {
    assert.deepEqual(exerciseGuardRailErrors({ ...ok, musclesInherited: false, musclesCustomReason: " " }), [
      MUSCLES_CUSTOM_REASON_REQUIRED,
    ]);
    assert.deepEqual(exerciseGuardRailErrors({ ...ok, musclesInherited: false, musclesCustomReason: "Incline" }), []);
  });
  it("the target is one of the group's own muscles", () => {
    assert.match(
      exerciseGuardRailErrors({ ...ok, targetCode: "TRICEPS", targetHomeGroupCode: "TRICEPS" })[0],
      /Target muscle TRICEPS belongs to group TRICEPS, not CHEST/,
    );
  });
});

describe("how muscles are written", () => {
  const pair = { target_muscle: { code: "MID_PECTORALS" }, target_profiles: [{ target_muscle: { code: "UPPER_PECTORALS" } }] };
  it("inherited on a pair with muscles: the pair's target, never secondaries", () => {
    assert.deepEqual(planExerciseMuscles(true, pair, "TRICEPS"), { mode: "inherit", target: "MID_PECTORALS", writeSecondaries: false });
  });
  it("keeps a target the pair has a profile for", () => {
    assert.deepEqual(planExerciseMuscles(true, pair, "UPPER_PECTORALS"), { mode: "inherit", target: "UPPER_PECTORALS", writeSecondaries: false });
  });
  it("inherited on a pair without muscles: the pair takes the exercise's", () => {
    assert.deepEqual(planExerciseMuscles(true, null, "X"), { mode: "inherit_new_pair", target: "X", writeSecondaries: true });
    assert.equal(planExerciseMuscles(true, { target_muscle: null }, "X").mode, "inherit_new_pair");
  });
  it("custom keeps its own muscles", () => {
    assert.deepEqual(planExerciseMuscles(false, pair, "TRICEPS"), { mode: "custom", target: "TRICEPS", writeSecondaries: true });
  });
});

describe("duplicate names", () => {
  const exercises = [
    { exo_id: 1, localizations: [{ locale: "en", display_name: "Bench Press" }, { locale: "es", display_name: "Press de banca" }] },
    { exo_id: 2, localizations: [{ locale: "fr", display_name: "Développé couché" }] },
  ];
  it("are refused per locale, case-insensitive, among other exercises", () => {
    assert.deepEqual(duplicateNameErrors({ en: "New", es: " press DE banca ", fr: "Développé couché" }, exercises, 3), [
      'ES name "press DE banca" is already used by active exercise #1',
      'FR name "Développé couché" is already used by active exercise #2',
    ]);
    assert.deepEqual(duplicateNameErrors({ en: "bench press" }, exercises, 1), []);
    assert.deepEqual(duplicateNameErrors({ es: "Bench Press" }, exercises), []);
  });
  it("search patterns match names literally", () => {
    assert.equal(likeLiteral("50% off_now\\"), "50\\% off\\_now\\\\");
  });
});

describe("muscle moves", () => {
  const use = (over: Partial<MuscleUse>): MuscleUse => ({
    muscle: { code: "SERRATUS_ANTERIOR", active: true, home_muscle_group_id: "chest" },
    exercises: [],
    pairs: [],
    profiles: [],
    ...over,
  });
  it("a used muscle cannot move its home", () => {
    const blocked = muscleMoveBlocker(
      use({
        exercises: [{ exo_id: 12, primary_muscle_group_id: "chest" }],
        pairs: [{ muscle_group_id: "chest", muscle_group: { code: "CHEST" }, movement_type: { code: "PRESS" } }],
      }),
      "core",
      "CORE",
    );
    assert.match(blocked ?? "", /SERRATUS_ANTERIOR cannot move to CORE: it is the target of exercise #12, pair CHEST \+ PRESS/);
  });
  it("an unused muscle, or one already home, moves freely", () => {
    assert.equal(muscleMoveBlocker(use({}), "core", "CORE"), null);
    assert.equal(muscleMoveBlocker(use({ exercises: [{ exo_id: 1, primary_muscle_group_id: "chest" }] }), "chest", "CHEST"), null);
  });
  it("an active muscle keeps a home", () => {
    assert.match(muscleUnlinkBlocker(use({}), "chest", "CHEST") ?? "", /cannot be left without a home group/);
    assert.equal(muscleUnlinkBlocker(use({}), "core", "CORE"), null);
    assert.equal(muscleUnlinkBlocker(use({ muscle: { code: "X", active: false, home_muscle_group_id: "chest" } }), "chest", "CHEST"), null);
  });
});

describe("database errors in staff words", () => {
  it("never shows a generic transaction error", () => {
    assert.match(friendlyCatalogError("postgres tx error", "exercise"), /custom muscles without a reason/);
    assert.match(friendlyCatalogError(new Error("database query error"), "link_muscle"), /still the target/);
    assert.match(friendlyCatalogError("", "unlink_muscle"), /without a home group/);
  });
  it("rewords the guard-rail messages", () => {
    const cases: [string, RegExp][] = [
      [
        "catalog.exercises exo_id 300: an exercise with its own muscles (muscles_inherited = false) needs muscles_custom_reason, the biomechanical reason",
        /^Custom muscles need a reason/,
      ],
      [
        "catalog.exercises exo_id 300 (Cable Fly): default_pulley_ratio other than 1 only on CABLE (1 = the user logs the stack number)",
        /^Load model: default_pulley_ratio other than 1 only on CABLE/,
      ],
      [
        "catalog.exercises exo_id 300: target muscle TRICEPS has its home in group TRICEPS, not CHEST (the target must be one of the group's own muscles)",
        /^Target muscle TRICEPS belongs to group TRICEPS, not CHEST/,
      ],
      [
        'catalog.exercise_localizations: es name "Press de banca" is already used by active exercise exo_id 1',
        /^ES name "Press de banca" is already used by active exercise #1$/,
      ],
      ["catalog.equipment: BARBELL cannot be deactivated, it is used by active exercise exo_id 1", /^BARBELL cannot be deactivated: it is used by active exercise exo_id 1$/],
      ['duplicate key value violates unique constraint "exercises_display_name_active_key"', /English name is already used/],
      ["catalog.exercise_secondary_muscles: exercise exo_id 5 inherits its muscles from its pair: edit the pair", /^Exercise #5 inherits its pair's muscles/],
      ["catalog.muscles: code new move must match ^[A-Z][A-Z0-9_-]*$", /no spaces/],
      ["query is not allowed", /allow-list/],
      [
        "Check constraint violation. catalog.exercises exo_id 10 (Barbell Bench Press): default_pulley_ratio other than 1 only on CABLE",
        /^Load model: default_pulley_ratio other than 1 only on CABLE$/,
      ],
      [
        "Check constraint violation. catalog.muscle_group_muscles: muscle MID_PECTORALS would have its home in no group, but catalog exercise exo_id 250 targets it from another group (move them …)",
        /^MID_PECTORALS cannot move: catalog exercise exo_id 250 targets it from its current group/,
      ],
      [
        "Check constraint violation. catalog.muscle_group_muscles: muscle X would have its home in CORE, but pair CHEST + PRESS targets it from another group",
        /^X cannot move to CORE: pair CHEST \+ PRESS targets it/,
      ],
      ["Foreign key violation. catalog.equipment: BARBELL cannot be deactivated, it is used by active exercises (30)", /^BARBELL cannot be deactivated: it is used by active exercises \(30\)$/],
      ["Uniqueness violation. duplicate key value violates unique constraint \"exercises_display_name_active_key\"", /English name/],
      ["field 'insert_catalog_grips_one' not found in type: 'mutation_root'", /new values only by backend migration/],
      [
        "Check constraint violation. catalog.pair_target_profiles: UPPER_ABS is the pair's own target; a profile is for another target of the pair",
        /^UPPER_ABS is the pair's own target: a profile is for another target of the pair$/,
      ],
      [
        "Check constraint violation. catalog.muscle_group_movement_types: the pair has a target profile for OBLIQUES; delete the profile before making it the pair's target",
        /^The pair has a target profile for OBLIQUES: delete that profile before making OBLIQUES the pair's target$/,
      ],
      [
        "Foreign key violation. catalog.pair_target_profiles: exercise exo_id 101 inherits its muscles through this profile; give it its own muscles (muscles_inherited = false, with muscles_custom_reason) or another target first",
        /^Exercise #101 inherits its muscles through this target profile: change it first$/,
      ],
    ];
    for (const [raw, expected] of cases) assert.match(friendlyCatalogError(raw, "exercise"), expected);
  });
  it("keeps an error that follows a spanning message", () => {
    assert.equal(
      friendlyCatalogError(
        "catalog.pair_target_profiles: UPPER_ABS is the pair's own target; a profile is for another target of the pair; display_name is required",
        "pair",
      ),
      "UPPER_ABS is the pair's own target: a profile is for another target of the pair; display_name is required",
    );
  });
  it("leaves other messages as they are", () => {
    assert.equal(friendlyCatalogError("display_name is required", "exercise"), "display_name is required");
  });
});
