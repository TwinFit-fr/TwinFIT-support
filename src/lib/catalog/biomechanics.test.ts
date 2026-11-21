import assert from "node:assert/strict";
import test from "node:test";
import {
  parseBiomechanicalFields,
  providedBiomechanicalFields,
  type ExercisePayload,
} from "./normalize.ts";

// Backend 2.10.0 dropped catalog.exercises.wrist_imu_mode: an insert or update that names it is refused.
const legacy = { wrist_imu_mode: "STATIC" } as ExercisePayload;

test("create biomechanics: catalog defaults and no wrist IMU mode", () => {
  assert.deepEqual(parseBiomechanicalFields({}), { body_mass_coefficient: null, default_pulley_ratio: 1 });
  assert.deepEqual(parseBiomechanicalFields({ ...legacy, body_mass_coefficient: "0.65" }), {
    body_mass_coefficient: 0.65,
    default_pulley_ratio: 1,
  });
});

test("update biomechanics: only the fields sent, never a wrist IMU mode", () => {
  assert.deepEqual(providedBiomechanicalFields({}), {});
  assert.deepEqual(providedBiomechanicalFields(legacy), {});
  assert.deepEqual(providedBiomechanicalFields({ ...legacy, default_pulley_ratio: 2 }), { default_pulley_ratio: 2 });
});

test("biomechanics still validate their ranges", () => {
  assert.throws(() => parseBiomechanicalFields({ body_mass_coefficient: 2 }), /body_mass_coefficient/);
  assert.throws(() => parseBiomechanicalFields({ default_pulley_ratio: 0 }), /default_pulley_ratio/);
});
