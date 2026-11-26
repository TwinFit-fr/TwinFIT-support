import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROFILE_REASON_REQUIRED,
  cleanSecondaries,
  homeLinkBlocker,
  pairTargetCodes,
  pickerRowMuscles,
  profileInputError,
  profileTargetCodes,
  profileUserCount,
} from "./pair-profiles.ts";

const CORE = ["UPPER_ABS", "OBLIQUES", "HIP_FLEXORS"];
const crunchProfiles = [{ target: "OBLIQUES", secondary: ["UPPER_ABS"], reason: "Cross-body crunch" }];

describe("pair and profile targets", () => {
  it("keeps a profiled target out of the pair's own targets", () => {
    assert.deepEqual(pairTargetCodes(CORE, crunchProfiles, "UPPER_ABS"), ["UPPER_ABS", "HIP_FLEXORS"]);
  });
  it("keeps the current target listed even when profiled (shown, the database decides)", () => {
    assert.deepEqual(pairTargetCodes(CORE, crunchProfiles, "OBLIQUES"), CORE);
  });
  it("offers a new profile the group's muscles other than the pair target and existing profiles", () => {
    assert.deepEqual(profileTargetCodes(CORE, "UPPER_ABS", crunchProfiles), ["HIP_FLEXORS"]);
    assert.deepEqual(profileTargetCodes(CORE, "UPPER_ABS", []), ["OBLIQUES", "HIP_FLEXORS"]);
  });
  it("counts the inherited exercises that resolve through a profile", () => {
    const exercises = [
      { muscles_inherited: true, target_muscle: { code: "OBLIQUES" } },
      { muscles_inherited: false, target_muscle: { code: "OBLIQUES" } },
      { muscles_inherited: true, target_muscle: { code: "UPPER_ABS" } },
    ];
    assert.equal(profileUserCount(exercises, "OBLIQUES"), 1);
    assert.equal(profileUserCount(undefined, "OBLIQUES"), 0);
  });
});

describe("profile input", () => {
  const base = { groupCode: "CORE", pairTarget: "UPPER_ABS", target: "OBLIQUES", secondary: ["UPPER_ABS"], reason: "Rotation" };
  it("accepts another home muscle of the group with a reason", () => {
    assert.equal(profileInputError(base, "CORE"), null);
  });
  it("refuses the pair's own target", () => {
    assert.match(profileInputError({ ...base, target: "UPPER_ABS" }, "CORE") ?? "", /pair's own target/);
  });
  it("refuses a target homed elsewhere", () => {
    assert.match(profileInputError({ ...base, target: "LATS" }, "BACK") ?? "", /belongs to group BACK, not CORE/);
    assert.match(profileInputError({ ...base, target: "X" }, null) ?? "", /belongs to no group/);
  });
  it("requires a reason", () => {
    assert.equal(profileInputError({ ...base, reason: "  " }, "CORE"), PROFILE_REASON_REQUIRED);
    assert.equal(profileInputError({ ...base, reason: undefined }, "CORE"), PROFILE_REASON_REQUIRED);
  });
  it("cleans secondaries: order kept, no blanks, repeats or target", () => {
    assert.deepEqual(cleanSecondaries("OBLIQUES", ["UPPER_ABS", "", "OBLIQUES", "UPPER_ABS", "HIP_FLEXORS"]), [
      "UPPER_ABS",
      "HIP_FLEXORS",
    ]);
  });
});

describe("picker rows", () => {
  it("needs a row only for secondaries of another home", () => {
    const rows = pickerRowMuscles("CORE", [
      { id: "1", code: "UPPER_ABS", home: "CORE" },
      { id: "2", code: "GLUTEUS", home: "GLUTES" },
      { id: "3", code: "NEW", home: null },
    ]);
    assert.deepEqual(rows.map((r) => r.code), ["GLUTEUS", "NEW"]);
  });
});

describe("home link", () => {
  it("refuses to unlink or demote an active muscle from its home", () => {
    const m = { code: "OBLIQUES", active: true, home: "CORE" };
    assert.match(homeLinkBlocker(m, "CORE", "unlink") ?? "", /cannot be unlinked from CORE, its home/);
    assert.match(homeLinkBlocker(m, "CORE", "secondary") ?? "", /cannot be made a secondary of CORE/);
  });
  it("lets an inactive muscle or another group's row go", () => {
    assert.equal(homeLinkBlocker({ code: "LOWER_ABS", active: false, home: "CORE" }, "CORE", "unlink"), null);
    assert.equal(homeLinkBlocker({ code: "GLUTEUS", active: true, home: "GLUTES" }, "CORE", "unlink"), null);
  });
});
