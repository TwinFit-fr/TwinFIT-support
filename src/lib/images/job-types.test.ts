import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { busyFrameGroups, frameJobSpecs } from "./job-types.ts";

const exercise = { exoId: 7, framePositions: [0, 1, 2] };

describe("frameJobSpecs", () => {
  it("chains Mid and End to the Start of the run", () => {
    const specs = frameJobSpecs({ exercises: [exercise], positions: [0, 1, 2], subjects: ["man"] });
    assert.deepEqual(
      specs.map((s) => [s.position, s.key, s.after]),
      [
        [0, "7:man:0", undefined],
        [1, undefined, "7:man:0"],
        [2, undefined, "7:man:0"],
      ],
    );
  });

  it("makes one chain per variant, each Mid and End after the Start of its variant", () => {
    const specs = frameJobSpecs({
      exercises: [exercise],
      positions: [0, 2],
      subjects: ["man", "woman"],
      variants: 2,
    });
    assert.equal(specs.length, 8);
    const keys = specs.filter((s) => s.key).map((s) => s.key);
    assert.deepEqual(keys, ["7:man:0", "7:man:1", "7:woman:0", "7:woman:1"]);
    for (const end of specs.filter((s) => s.position === 2)) {
      assert.ok(keys.includes(end.after as string));
    }
    assert.equal(specs[1].after, specs[0].key);
  });

  it("leaves Mid and End without a dependency when the run has no Start", () => {
    const specs = frameJobSpecs({
      exercises: [exercise],
      positions: [1, 2],
      subjects: ["man"],
      options: (position, subject) => ({ guideImageId: `${subject}-${position}` }),
    });
    assert.deepEqual(
      specs.map((s) => [s.position, s.key, s.after, s.options?.guideImageId]),
      [
        [1, undefined, undefined, "man-1"],
        [2, undefined, undefined, "man-2"],
      ],
    );
  });

  it("skips the Mid of a two-frame exercise", () => {
    const specs = frameJobSpecs({
      exercises: [{ exoId: 3, framePositions: [0, 2] }],
      positions: [0, 1, 2],
      subjects: ["woman"],
    });
    assert.deepEqual(
      specs.map((s) => s.position),
      [0, 2],
    );
  });
});

describe("busyFrameGroups", () => {
  it("lists each exercise and subject with active jobs once", () => {
    assert.deepEqual(
      busyFrameGroups([
        { exo_id: 7, subject: "man" },
        { exo_id: 7, subject: "man" },
        { exo_id: 7, subject: "woman" },
        { exo_id: null, subject: null },
      ]),
      [
        { exo_id: 7, subject: "man" },
        { exo_id: 7, subject: "woman" },
      ],
    );
  });
});
