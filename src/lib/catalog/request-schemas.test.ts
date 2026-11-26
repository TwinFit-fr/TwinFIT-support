import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deactivateSchema, exercisePayloadSchema, taxonomyActionSchema } from "./request-schemas.ts";

const ID = "33333333-3333-4333-8333-333333333333";
const loc = { display_name: "Bench Press", description: "" };

describe("exercisePayloadSchema", () => {
  it("accepts the editor's payload, numbers as text", () => {
    const payload = {
      display_name: "Bench Press",
      description: null,
      primary_muscle_group_code: "CHEST",
      movement_type_code: "PRESS",
      equipment_code: "BARBELL",
      support_equipment_code: "",
      position_code: "LYING",
      grip_code: "STANDARD",
      variation_code: "STANDARD",
      load_modality_code: "EXTERNAL",
      target_muscle_code: "MID_CHEST",
      muscles_inherited: false,
      muscles_custom_reason: "Wide grip",
      secondary_muscle_codes: ["TRICEPS"],
      body_mass_coefficient: "",
      default_pulley_ratio: "1",
      taxonomy_status: "pending",
      localizations: { en: loc, es: { display_name: "", description: "" }, fr: loc },
      exo_id: 1234,
    };
    const parsed = exercisePayloadSchema.parse(payload);
    assert.equal(parsed.exo_id, 1234);
    assert.equal(parsed.localizations?.fr?.display_name, "Bench Press");
  });

  it("keeps absent fields absent (updates keep the stored values)", () => {
    const parsed = exercisePayloadSchema.parse({ exo_id: "12", display_name: "x" });
    assert.equal("body_mass_coefficient" in parsed, false);
    assert.equal("muscles_custom_reason" in parsed, false);
  });

  it("refuses wrong types and oversized values", () => {
    assert.equal(exercisePayloadSchema.safeParse({ display_name: { $gt: "" } }).success, false);
    assert.equal(exercisePayloadSchema.safeParse({ secondary_muscle_codes: "TRICEPS" }).success, false);
    assert.equal(exercisePayloadSchema.safeParse({ muscles_inherited: "yes" }).success, false);
    assert.equal(exercisePayloadSchema.safeParse({ exo_id: "12; drop" }).success, false);
    assert.equal(exercisePayloadSchema.safeParse({ secondary_muscle_codes: Array(51).fill("X") }).success, false);
  });

  it("checks the facets of 2.10.0 against their closed lists", () => {
    const parsed = exercisePayloadSchema.parse({
      width: "WIDE",
      inclination: "INCLINE",
      laterality: "UNILATERAL",
      app_visible: false,
    });
    assert.deepEqual(
      [parsed.width, parsed.inclination, parsed.laterality, parsed.app_visible],
      ["WIDE", "INCLINE", "UNILATERAL", false],
    );
    assert.equal("width" in exercisePayloadSchema.parse({ display_name: "x" }), false);
    assert.equal(exercisePayloadSchema.safeParse({ width: "SUMO" }).success, false);
    assert.equal(exercisePayloadSchema.safeParse({ inclination: "incline" }).success, false);
    assert.equal(exercisePayloadSchema.safeParse({ laterality: "SPLIT" }).success, false);
    assert.equal(exercisePayloadSchema.safeParse({ app_visible: "false" }).success, false);
  });
});

describe("deactivateSchema", () => {
  it("needs an exo_id", () => {
    assert.equal(deactivateSchema.safeParse({ exo_id: 7 }).success, true);
    assert.equal(deactivateSchema.safeParse({}).success, false);
  });
});

describe("taxonomyActionSchema", () => {
  it("accepts every body the taxonomy and localization pages send", () => {
    for (const body of [
      { table: "catalog_equipment", code: "SLED", name: "Sled" },
      { table: "catalog_muscle_groups", code: "NECK", name: "Neck", body_region_code: "UPPER" },
      { kind: "update", table: "catalog_equipment", id: ID, name: "Sled", sort_order: 3, active: true, description: null },
      { kind: "update", table: "catalog_equipment", id: ID, labels: { en: "Sled", es: "Trineo", fr: "" } },
      { kind: "relation", relationKind: "muscle", action: "link", muscle_group_code: "CHEST", code: "MID_CHEST", role: "target" },
      { kind: "relation", relationKind: "movement", action: "unlink", muscle_group_code: "CHEST", code: "PRESS" },
      { kind: "pair_muscles", muscle_group_code: "CHEST", movement_type_code: "PRESS", target_muscle_code: "MID_CHEST", secondary_muscle_codes: [] },
      { kind: "pair_strength_pattern", muscle_group_code: "CHEST", movement_type_code: "PRESS", strength_pattern: "inherit" },
      { kind: "group_movement_labels", muscle_group_code: "CHEST", movement_type_code: "PRESS", labels: { en: "Chest Press", es: "", fr: "" } },
    ]) {
      assert.equal(taxonomyActionSchema.safeParse(body).success, true, JSON.stringify(body));
    }
  });

  it("refuses unknown kinds and malformed fields", () => {
    assert.equal(taxonomyActionSchema.safeParse({ kind: "drop_table", table: "x" }).success, false);
    assert.equal(taxonomyActionSchema.safeParse({ kind: "relation", action: "merge", muscle_group_code: "A", code: "B" }).success, false);
    assert.equal(taxonomyActionSchema.safeParse({ kind: "update", table: "catalog_equipment", id: "1" }).success, false);
    assert.equal(taxonomyActionSchema.safeParse({ table: "catalog_equipment", code: ["A"] }).success, false);
  });
});

describe("taxonomyActionSchema: target profiles", () => {
  const pair = { muscle_group_code: "CORE", movement_type_code: "CRUNCH" };
  it("accepts a profile with ordered secondaries and a reason", () => {
    const parsed = taxonomyActionSchema.parse({
      kind: "pair_target_profile",
      ...pair,
      target_muscle_code: "OBLIQUES",
      secondary_muscle_codes: ["UPPER_ABS"],
      reason: "Trunk rotation",
    });
    assert.equal(parsed.kind, "pair_target_profile");
  });
  it("requires the reason field and a target", () => {
    assert.equal(
      taxonomyActionSchema.safeParse({ kind: "pair_target_profile", ...pair, target_muscle_code: "OBLIQUES" }).success,
      false,
    );
    assert.equal(taxonomyActionSchema.safeParse({ kind: "pair_target_profile_delete", ...pair }).success, false);
  });
  it("accepts a delete by target", () => {
    assert.equal(
      taxonomyActionSchema.safeParse({ kind: "pair_target_profile_delete", ...pair, target_muscle_code: "OBLIQUES" })
        .success,
      true,
    );
  });
});
