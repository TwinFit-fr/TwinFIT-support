import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildKeyframes, POSE_CLIP_VERSION, type PoseClipJson } from "./anatomy.ts";
import { keyPosesFromCapture, readCapture, readCaptureNow } from "./capture-convert.ts";
import { missingParts, missingSentence, unusedParts, unusedSentence } from "./capture-words.ts";
import type { TemplateExercise } from "./exercise-templates.ts";
import { buildRig, captureRestPose, sampleClip } from "./pose-clip.ts";
import { originLabel, savedFrom, type DraftOrigin } from "./pose-origin.ts";
import { bakeSolved, drivenBy, templateClip } from "./test-captures.ts";
import { crookedRig, mannequin } from "./test-rigs.ts";

const CATALOG = JSON.parse(readFileSync(new URL("./__fixtures__/catalog-exercises.json", import.meta.url), "utf8")) as (TemplateExercise & { exo_id: number })[];
const byName = (name: string) => CATALOG.find((ex) => ex.name === name)!;

describe("a standing capture made into key poses", () => {
  for (const [name, model] of [["mannequin", mannequin()], ["Meshy-like rig", crookedRig().model]] as const) {
    for (const exercise of ["Barbell Squat", "Dumbbell Biceps Curl"]) {
      it(`${exercise} on the ${name}: the feet stay on the floor, at every key pose and in between`, () => {
        const rest = captureRestPose(model);
        const rig = buildRig(model, rest);
        // As the Studio plays it (feet planted, reach solved), shaken a degree: a capture of a standing exercise.
        const capture = bakeSolved(model, rest, templateClip(byName(exercise)), 1, 4);
        const frames = readCaptureNow(rig, { clip: capture, driven: drivenBy(capture) });
        assert.equal(frames.travel, false);
        assert.ok(frames.poses.every((p) => p.orientation === "standing" && p.feet_flat !== false && p.hips.height_m === null));
        const keys = keyPosesFromCapture(frames, rig, "balanced");
        const clip: PoseClipJson = { kind: "pose-angles", version: POSE_CLIP_VERSION, fps: 30, duration: frames.duration, loop: keys.mode !== "once", keyframes: buildKeyframes(keys.poses, frames.duration, keys.mode, keys.weights ?? undefined), meta: {} };
        const { samples, ankleFloor } = sampleClip(model, clip, rest, [], 48);
        for (const s of samples) {
          for (const foot of s.feet) {
            assert.ok(Math.abs(foot.ankle.y - ankleFloor) < 0.015, `${foot.side} ankle ${(foot.ankle.y - ankleFloor).toFixed(3)} m off the floor at ${s.t.toFixed(2)} s`);
            assert.ok(foot.tilt < 3, `${foot.side} sole tilted ${foot.tilt.toFixed(1)}° at ${s.t.toFixed(2)} s`);
          }
          assert.ok(s.lowest.y > -0.01, `${s.lowest.bone} ${s.lowest.y.toFixed(3)} m under the floor at ${s.t.toFixed(2)} s`);
        }
        // Both feet stay where the first pose put them.
        const start = samples[0].feet.map((f) => f.ankle);
        for (const s of samples) s.feet.forEach((f, i) => assert.ok(f.ankle.distanceTo(start[i]) < 0.03, `${f.side} foot slid ${f.ankle.distanceTo(start[i]).toFixed(3)} m`));
      });
    }
  }

  it("names the parts of the body a capture without arm bones does not move, and keeps them still", () => {
    const model = mannequin();
    const rest = captureRestPose(model);
    const rig = buildRig(model, rest);
    const capture = bakeSolved(model, rest, templateClip(byName("Barbell Squat")), 0.5, 5);
    capture.tracks = capture.tracks.filter((t) => !/(Shoulder|Arm|Hand)\./.test(t.name));
    const frames = readCaptureNow(rig, { clip: capture, driven: drivenBy(capture) });
    assert.deepEqual(frames.missing, ["arms"]);
    assert.ok(frames.poses.every((p) => p.left_arm.shoulder_elevation === 0 && p.right_arm.elbow_flexion === 0));
    assert.equal(missingSentence(frames.missing), "The capture has no arms: they stay in the starting position.");
  });

  it("reads a long capture a slice at a time, and stops when asked", async () => {
    const model = mannequin();
    const rest = captureRestPose(model);
    const rig = buildRig(model, rest);
    const capture = bakeSolved(model, rest, templateClip(byName("Barbell Squat")), 0.5, 6);
    let slices = 0;
    const done = await readCapture(rig, { clip: capture, driven: drivenBy(capture) }, { sliceMs: 1, onProgress: () => (slices += 1) });
    assert.ok(done && done.times.length === 121);
    assert.ok(slices > 1, `${slices} slices`);
    let asked = 0;
    const stopped = await readCapture(rig, { clip: capture, driven: drivenBy(capture) }, { sliceMs: 1, stopped: () => ++asked > 2 });
    assert.equal(stopped, null);
  });

  it("says a capture walked across the floor", () => {
    const model = mannequin();
    const rest = captureRestPose(model);
    const rig = buildRig(model, rest);
    const capture = bakeSolved(model, rest, templateClip(byName("Barbell Squat")), 0, 1);
    // The whole body carried forward 1 m over the clip, as a walk would.
    const hips = capture.tracks.find((t) => t.name.endsWith(".position"))!;
    for (let k = 0; k < hips.times.length; k += 1) hips.values[k * 3 + 2] += (hips.times[k] / capture.duration) * (1 / (rest.get(rig.names.Hips!)!.parentWorldScale || 1));
    assert.equal(readCaptureNow(rig, { clip: capture, driven: drivenBy(capture) }).travel, true);
  });
});

describe("what a capture leaves out, in words", () => {
  it("names missing body parts once, in pairs where both sides are missing", () => {
    const has = () => true;
    assert.deepEqual(missingParts(has, (l) => !/^Left(Arm|ForeArm|Hand)$/.test(l)), ["left arm"]);
    assert.deepEqual(missingParts(has, (l) => !/(Arm|Hand)$/.test(l)), ["arms"]);
    assert.deepEqual(missingParts(has, (l) => !/(Foot)$/.test(l)), ["feet"]);
    assert.deepEqual(missingParts(has, (l) => l !== "Head"), ["head"]);
    assert.deepEqual(missingParts(has, () => true), []);
    assert.equal(missingSentence(["head"]), "The capture has no head: it stays in the starting position.");
  });

  it("turns bones with no match on the avatar into body parts", () => {
    assert.deepEqual(unusedParts(["index_01_l", "thumb_02_r", "jaw", "ENDSITE", "Head_End", "LeftToe_End", "upperarm_twist_01_l", "Bip01 Footsteps"]), ["fingers", "face", "twist bones", "1 other bone"]);
    assert.equal(unusedSentence(["fingers", "face"]), "Not used from the capture: fingers and face.");
    assert.equal(unusedSentence([]), null);
  });
});

describe("the origin of key poses made from a capture", () => {
  const origin: DraftOrigin = { kind: "capture", vectorId: "v1", seq: 12, format: "bvh", keys: 3, frames: 121, maxDiff: 2.6, detail: "balanced", missing: ["arms"], unused: ["fingers"], travel: false, clamped: [] };

  it("says the file's kind, how many key poses from how many frames and the largest joint difference", () => {
    const label = originLabel(origin, false);
    assert.equal(label.base, "From capture #12");
    assert.equal(label.detail, "BVH · 3 key poses from 121 frames · within 3° of the capture");
    assert.deepEqual(label.notes, ["The capture has no arms: they stay in the starting position.", "Not used from the capture: fingers."]);
    assert.match(originLabel(origin, true).text, /Edited by you/);
  });

  it("says travel was dropped and joints were held, and a save keeps the capture", () => {
    const label = originLabel({ ...origin, missing: [], unused: [], travel: true, clamped: ["left wrist", "right wrist"] }, false);
    assert.deepEqual(label.notes, ["The capture walks across the floor: the poses stay in place.", "Held to their range: left wrist, right wrist."]);
    assert.equal(savedFrom(origin, true), "key poses from capture #12, edited; the capture is kept as it was");
  });
});

