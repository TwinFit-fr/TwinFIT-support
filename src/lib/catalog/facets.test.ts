import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_GRIP_CODE,
  facetColumnsForCreate,
  facetTupleOfExercise,
  facetTupleOfForm,
  findFacetTupleDuplicate,
  gripEvidence,
  providedFacetColumns,
  selectableOptions,
  type FacetTupleForm,
} from "./facets.ts";

describe("facet columns", () => {
  it("a new exercise gets the database defaults for what it leaves out", () => {
    assert.deepEqual(facetColumnsForCreate({}), {
      width: "STANDARD",
      inclination: "FLAT",
      laterality: "BILATERAL",
      app_visible: true,
    });
    assert.deepEqual(facetColumnsForCreate({ width: "WIDE", app_visible: false }), {
      width: "WIDE",
      inclination: "FLAT",
      laterality: "BILATERAL",
      app_visible: false,
    });
  });

  it("an update writes only the facets it names", () => {
    assert.deepEqual(providedFacetColumns({}), {});
    assert.deepEqual(providedFacetColumns({ laterality: "ALTERNATING", app_visible: false }), {
      laterality: "ALTERNATING",
      app_visible: false,
    });
  });

  it("a new exercise has no grip until staff pick one", () => {
    assert.equal(DEFAULT_GRIP_CODE, "NONE");
  });
});

describe("selectableOptions", () => {
  const rows = [
    { code: "UPRIGHT", active: false, sort_order: 10 },
    { code: "SEATED", active: true, sort_order: 110 },
    { code: "STANDING", active: true, sort_order: 100 },
    { code: "SIDE_LYING", active: true, sort_order: 170 },
  ];

  it("lists the active values in catalog order", () => {
    assert.deepEqual(
      selectableOptions(rows, "").map((r) => r.code),
      ["STANDING", "SEATED", "SIDE_LYING"],
    );
  });

  it("keeps a retired current value, flagged", () => {
    const options = selectableOptions(rows, "UPRIGHT");
    assert.deepEqual(options.map((r) => [r.code, r.retired]), [
      ["UPRIGHT", true],
      ["STANDING", false],
      ["SEATED", false],
      ["SIDE_LYING", false],
    ]);
  });
});

describe("facet tuple", () => {
  const form: FacetTupleForm = {
    primary_muscle_group_code: "LEGS",
    movement_type_code: "SQUAT",
    equipment_code: "BARBELL",
    support_equipment_code: "",
    grip_code: "NONE",
    position_code: "STANDING",
    variation_code: "STANDARD",
    width: "STANDARD",
    inclination: "FLAT",
    laterality: "BILATERAL",
  };
  const squat = {
    exo_id: 80,
    display_name: "Barbell Squat",
    primary_muscle_group: { code: "LEGS" },
    movement_type: { code: "SQUAT" },
    equipment: { code: "BARBELL" },
    support_equipment: null,
    grip: { code: "NONE" },
    position: { code: "STANDING" },
    variation: { code: "STANDARD" },
    width: "STANDARD",
    inclination: "FLAT",
    laterality: "BILATERAL",
  };
  const lowBar = { ...squat, exo_id: 82, display_name: "Barbell Low Bar Squat", variation: { code: "LOW_BAR" } };

  it("form and row give the same key; missing facets read as the defaults", () => {
    assert.equal(facetTupleOfForm(form), facetTupleOfExercise(squat));
    assert.equal(
      facetTupleOfExercise({ ...squat, width: null, inclination: undefined, laterality: null }),
      facetTupleOfExercise(squat),
    );
  });

  it("finds the other exercise with the same tuple, never the one edited", () => {
    assert.equal(findFacetTupleDuplicate(form, [squat, lowBar])?.exo_id, 80);
    assert.equal(findFacetTupleDuplicate(form, [squat, lowBar], 80), null);
  });

  it("width, inclination and laterality tell exercises apart", () => {
    assert.equal(findFacetTupleDuplicate({ ...form, width: "WIDE" }, [squat]), null);
    assert.equal(findFacetTupleDuplicate({ ...form, inclination: "INCLINE" }, [squat]), null);
    assert.equal(findFacetTupleDuplicate({ ...form, laterality: "UNILATERAL" }, [squat]), null);
    assert.equal(findFacetTupleDuplicate({ ...form, support_equipment_code: "POWER_RACK" }, [squat]), null);
  });
});

describe("gripEvidence", () => {
  it("keeps the sentences about the hands", () => {
    const pose =
      "Standing upright with torso 0° from vertical. Both hands hold a pair of dumbbells with a neutral grip, thumbs wrapped. Elbows at 15° flexion.";
    assert.deepEqual(gripEvidence(pose), [
      "Both hands hold a pair of dumbbells with a neutral grip, thumbs wrapped.",
    ]);
  });

  it("is empty when the pose is silent", () => {
    assert.deepEqual(gripEvidence("Seated, torso upright. Knees at 90°."), []);
  });
});
