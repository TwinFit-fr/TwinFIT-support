import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EMPTY_PICK,
  cleanPick,
  effectivePick,
  isEmptyPick,
  liveFrames,
  liveFramesChanged,
  needsPublish,
  poseWarningText,
  poseWarnings,
  publishErrorMessage,
  suggestPick,
  togglePick,
  unpick,
  validatePick,
} from "./sequence.ts";
import { frame, live } from "./test-images.ts";

const blocking = (problems: ReturnType<typeof validatePick>) =>
  problems.filter((p) => p.blocking).map((p) => p.message);

function liveSequence() {
  return [live(0, undefined, { id: "s" }), live(1, "s", { id: "m" }), live(2, "s", { id: "e" })];
}

describe("picks", () => {
  it("toggles an image in the slot of its position", () => {
    const picked = togglePick(EMPTY_PICK, 0, "a");
    assert.deepEqual(picked, { start: "a", mid: null, end: null });
    assert.deepEqual(togglePick(picked, 0, "a"), EMPTY_PICK);
    assert.deepEqual(togglePick(picked, 0, "b"), { start: "b", mid: null, end: null });
  });

  it("moves an image picked elsewhere instead of using it twice", () => {
    const picked = togglePick(togglePick(EMPTY_PICK, 0, "a"), 2, "a");
    assert.deepEqual(picked, { start: null, mid: null, end: "a" });
  });

  it("ignores positions without a slot and can unpick", () => {
    assert.equal(togglePick(EMPTY_PICK, 3, "a"), EMPTY_PICK);
    assert.deepEqual(unpick({ start: "a", mid: "b", end: "a" }, "a"), {
      start: null,
      mid: "b",
      end: null,
    });
    assert.equal(isEmptyPick(EMPTY_PICK), true);
  });

  it("cleans deleted images and the Mid of a two-frame exercise", () => {
    const pick = { start: "a", mid: "b", end: "gone" };
    const images = [{ id: "a" }, { id: "b" }];
    assert.deepEqual(cleanPick(pick, images, false), { start: "a", mid: "b", end: null });
    assert.deepEqual(cleanPick(pick, images, true), { start: "a", mid: null, end: null });
  });

  it("lays the pick over the active frames", () => {
    const images = liveSequence();
    assert.deepEqual(effectivePick({ ...EMPTY_PICK, end: "new" }, images, false), {
      start: "s",
      mid: "m",
      end: "new",
    });
    assert.deepEqual(effectivePick(EMPTY_PICK, images, true), { start: "s", mid: null, end: "e" });
  });
});

describe("validatePick", () => {
  it("accepts the live sequence and a complete pick", () => {
    assert.deepEqual(validatePick(EMPTY_PICK, liveSequence(), false), []);
    const start = frame({ id: "ns", target: 0 });
    const mid = frame({ id: "nm", target: 1, start_drawing_id: "ns" });
    const end = frame({ id: "ne", target: 2, start_drawing_id: "ns" });
    const pick = { start: "ns", mid: "nm", end: "ne" };
    assert.deepEqual(validatePick(pick, [start, mid, end], false), []);
  });

  it("asks for what is missing", () => {
    assert.deepEqual(blocking(validatePick(EMPTY_PICK, [frame()], false)), [
      "Pick a Start.",
      "Pick a Mid.",
      "Pick an End.",
    ]);
    assert.deepEqual(blocking(validatePick(EMPTY_PICK, [frame()], true)), [
      "Pick a Start.",
      "Pick an End.",
    ]);
  });

  it("blocks the same image in two slots", () => {
    const a = frame({ id: "a", target: 0 });
    const problems = validatePick({ start: "a", mid: null, end: "a" }, [a], true);
    assert.ok(blocking(problems).includes("The same image cannot fill two slots."));
  });

  it("blocks rejected frames and unknown images", () => {
    const start = frame({ id: "ns", target: 0, review_status: "rejected" });
    const end = live(2, undefined, { id: "e" });
    const problems = blocking(
      validatePick({ start: "ns", mid: null, end: "e" }, [start, end], true),
    );
    assert.equal(problems.length, 1);
    assert.match(problems[0], /Start is rejected/);
    assert.match(
      blocking(validatePick({ start: "ghost", mid: null, end: "e" }, [end], true))[0],
      /no longer exists/,
    );
  });

  it("blocks a Mid or End drawn on another Start, but not one with no known Start", () => {
    const start = frame({ id: "ns", target: 0, drawing_id: "ns" });
    const oldMid = frame({ id: "om", target: 1, start_drawing_id: "old" });
    const freeEnd = frame({ id: "fe", target: 2, start_drawing_id: null });
    const problems = validatePick(
      { start: "ns", mid: "om", end: "fe" },
      [start, oldMid, freeEnd],
      false,
    );
    assert.equal(blocking(problems).length, 1);
    assert.match(blocking(problems)[0], /Mid was drawn on another Start/);
  });

  it("accepts a Mid drawn on an aligned copy of the Start (same drawing)", () => {
    const aligned = frame({ id: "sa", target: 0, drawing_id: "s" });
    const mid = frame({ id: "m", target: 1, start_drawing_id: "s" });
    const end = frame({ id: "e", target: 2, start_drawing_id: "s" });
    assert.deepEqual(
      validatePick({ start: "sa", mid: "m", end: "e" }, [aligned, mid, end], false),
      [],
    );
  });

  it("only notes a frame made for another position", () => {
    const start = frame({ id: "s", target: 0 });
    const end = frame({ id: "e", target: 1, start_drawing_id: "s" });
    const problems = validatePick({ start: "s", mid: null, end: "e" }, [start, end], true);
    assert.equal(problems.length, 1);
    assert.equal(problems[0].blocking, false);
    assert.match(problems[0].message, /End was made as Mid/);
  });
});

describe("needsPublish", () => {
  it("is false for a published sequence without picks, true when a pick differs", () => {
    const images = liveSequence();
    assert.equal(needsPublish(EMPTY_PICK, images, false), false);
    assert.equal(needsPublish({ ...EMPTY_PICK, end: "e" }, images, false), false);
    assert.equal(needsPublish({ ...EMPTY_PICK, end: "other" }, images, false), true);
  });

  it("is true when the live sequence is not shown", () => {
    const images = liveSequence();
    images[1] = { ...images[1], review_status: "pending" };
    assert.equal(needsPublish(EMPTY_PICK, images, false), true);
  });
});

describe("suggestPick", () => {
  it("takes the newest candidate per slot, a Mid or End only when it fits the Start", () => {
    const oldStart = frame({ id: "s1", target: 0, drawing_id: "s1" });
    const newStart = frame({ id: "s2", target: 0, drawing_id: "s2" });
    const midOld = frame({ id: "m1", target: 1, start_drawing_id: "s1" });
    const midNew = frame({ id: "m2", target: 1, start_drawing_id: "s2" });
    const endOld = frame({ id: "e1", target: 2, start_drawing_id: "s1" });
    const pick = suggestPick([oldStart, midOld, endOld, newStart, midNew], false);
    assert.deepEqual(pick, { start: "s2", mid: "m2", end: null });
  });

  it("fits Mid and End to the live Start when there is no new Start", () => {
    const images = liveSequence();
    const fits = frame({ id: "m2", target: 1, start_drawing_id: "s" });
    const other = frame({ id: "e2", target: 2, start_drawing_id: "elsewhere" });
    assert.deepEqual(suggestPick([...images, fits, other], false), {
      start: null,
      mid: "m2",
      end: null,
    });
  });

  it("skips rejected frames, active ones and a Mid for two frames", () => {
    const start = frame({ id: "s", target: 0, review_status: "rejected" });
    const mid = frame({ id: "m", target: 1 });
    assert.deepEqual(suggestPick([start, mid, live(2)], true), EMPTY_PICK);
  });
});

describe("publishErrorMessage", () => {
  it("explains the error codes of the publish function", () => {
    assert.match(publishErrorMessage("mid_image_required"), /Mid is required/);
    assert.match(publishErrorMessage("two_frame_exercise_has_no_mid"), /without a Mid/);
    assert.match(
      publishErrorMessage("frames_of_another_sequence: 123"),
      /same style, exercise and subject/,
    );
    assert.match(publishErrorMessage("frames_must_differ"), /different image/);
    assert.match(publishErrorMessage("start_and_end_required"), /Start and an End/);
  });

  it("names the frame drawn on another Start", () => {
    const id = "0f5a7c1e-1111-4222-8333-444455556666";
    const message = publishErrorMessage(`frame_drawn_on_another_start: ${id}`, (x) =>
      x === id ? "The Mid" : null,
    );
    assert.match(message, /^The Mid was drawn on a different Start/);
    assert.match(publishErrorMessage("frame_drawn_on_another_start"), /^A Mid or End was drawn/);
  });

  it("keeps an unknown error as it is", () => {
    assert.equal(publishErrorMessage("connection reset"), "connection reset");
  });
});

describe("poseWarnings", () => {
  const poses = [
    { position: 0, status: "approved" as const },
    { position: 1, status: "generated" as const },
  ];

  it("flags poses that are missing or not approved, only for the positions asked", () => {
    assert.deepEqual(poseWarnings(poses, [0, 1, 2]), [
      { position: 1, status: "generated" },
      { position: 2, status: "missing" },
    ]);
    assert.deepEqual(poseWarnings(poses, [0, 2]), [{ position: 2, status: "missing" }]);
    assert.deepEqual(poseWarnings(poses, [0]), []);
  });

  it("words the warning, empty when every pose is approved", () => {
    assert.equal(poseWarningText([]), "");
    assert.equal(
      poseWarningText(poseWarnings(poses, [0, 1, 2])),
      "Pose not approved: Mid (generated, not approved), End (no pose, drawn from the description)",
    );
  });
});

describe("liveFrames / liveFramesChanged", () => {
  const img = (id: string, position: number | null, active: boolean) => ({ id, position, active });
  it("reads the active frame of each slot", () => {
    assert.deepEqual(liveFrames([img("a", 0, true), img("b", null, false), img("c", 2, true)]), {
      start: "a",
      mid: null,
      end: "c",
    });
  });
  it("detects a slot that changed", () => {
    const seen = liveFrames([img("a", 0, true), img("c", 2, true)]);
    assert.equal(liveFramesChanged(seen, { start: "a", mid: null, end: "c" }), false);
    assert.equal(liveFramesChanged(seen, { start: "x", mid: null, end: "c" }), true);
    assert.equal(liveFramesChanged(seen, { start: "a", mid: "m", end: "c" }), true);
  });
});
