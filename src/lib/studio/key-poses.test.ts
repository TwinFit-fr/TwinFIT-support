import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildKeyframes, keyframeTimes, lerpPose, POSE_CLIP_VERSION, type PoseAngles, type PoseClipJson } from "./anatomy.ts";
import { keyPosesFromCapture, readCaptureNow } from "./capture-convert.ts";
import { buildTemplate, type TemplateExercise } from "./exercise-templates.ts";
import { DETAIL_SPEC, MAX_KEY_POSES, reduceToKeyPoses } from "./key-poses.ts";
import { buildRig, captureRestPose, characterDeltas } from "./pose-clip.ts";
import { bodyDifference } from "./pose-from-bones.ts";
import { bakeAngles, clipAnglesAt, drivenBy, templateClip } from "./test-captures.ts";
import { crookedRig, mannequin } from "./test-rigs.ts";

const CATALOG = JSON.parse(readFileSync(new URL("./__fixtures__/catalog-exercises.json", import.meta.url), "utf8")) as (TemplateExercise & { exo_id: number })[];
const byName = (name: string) => CATALOG.find((ex) => ex.name === name)!;

const model = mannequin();
const rig = buildRig(model, captureRestPose(model));

/** Three poses of different exercises in one loop, unevenly timed: more than a template has. */
function threePoseClip(): PoseClipJson {
  const squat = buildTemplate(byName("Barbell Squat")).poses;
  const press = buildTemplate(byName("Dumbbell Shoulder Press")).poses;
  const poses = [squat[0], squat[1], press[1]];
  return { kind: "pose-angles", version: POSE_CLIP_VERSION, fps: 30, duration: 4.5, loop: true, keyframes: buildKeyframes(poses, 4.5, "cycle", [1, 1.5, 1]), meta: { loop_mode: "cycle" } };
}

const ease = (u: number) => u * u * (3 - 2 * u);

/** The angles the editor plays at `t` for these key poses. */
function played(poses: PoseAngles[], mode: "cycle" | "pingpong" | "once", weights: number[] | null, duration: number, t: number): PoseAngles {
  const keys = keyframeTimes(poses.length, duration, mode, weights);
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i += 1;
  const next = Math.min(i + 1, keys.length - 1);
  const span = keys[next].t - keys[i].t;
  return lerpPose(poses[keys[i].position], poses[keys[next].position], span > 0 ? ease(Math.min(1, Math.max(0, (t - keys[i].t) / span))) : 0);
}

/** The largest joint difference between the key poses as the editor plays them and the clip the capture was made from (no shake), over the loop. */
function differenceFromClip(clip: PoseClipJson, keys: ReturnType<typeof keyPosesFromCapture>): number {
  let worst = 0;
  for (let f = 0; f <= Math.round(clip.duration * 30); f += 1) {
    const t = Math.min(clip.duration, f / 30);
    worst = Math.max(worst, bodyDifference(characterDeltas(played(keys.poses, keys.mode, keys.weights, clip.duration, t), rig), characterDeltas(clipAnglesAt(clip, t), rig)));
  }
  return worst;
}

const CASES: [string, PoseClipJson][] = [
  ["squat", templateClip(byName("Barbell Squat"))],
  ["biceps curl", templateClip(byName("Dumbbell Biceps Curl"))],
  ["shoulder press", templateClip(byName("Dumbbell Shoulder Press"))],
  ["deadlift", templateClip(byName("Barbell Deadlift"))],
  ["push-up", templateClip(byName("Push-Up"))],
  ["jumping jacks", templateClip(byName("Jumping Jacks"))],
  ["three poses of two exercises", threePoseClip()],
];

describe("a dense capture reduced to key poses", () => {
  for (const [name, clip] of CASES) {
    it(`${name}: a shaken capture of the clip comes back as about its own key poses, within the tolerance`, () => {
      const original = new Set(clip.keyframes.map((k) => k.position ?? 0)).size;
      const capture = bakeAngles(clip, rig, 30, 1, 7);
      const frames = readCaptureNow(rig, { clip: capture, driven: drivenBy(capture) });
      assert.equal(frames.times.length, Math.round(clip.duration * 30) + 1);
      const keys = keyPosesFromCapture(frames, rig, "balanced");
      assert.ok(keys.poses.length >= original && keys.poses.length <= original + 1, `${keys.poses.length} key poses for ${original} (frames ${keys.frames.join(", ")})`);
      // Two poses timed alike are a boomerang as much as a cycle: the same motion either way.
      assert.ok(keys.mode === "cycle" || keys.mode === "pingpong", keys.mode);
      // Each original key has a key pose within three frames of it.
      const times = [...new Map([...clip.keyframes].reverse().map((k) => [k.position ?? 0, k.t])).values()];
      const keyTimes = keys.frames.map((f) => frames.times[f]);
      for (const t of times) assert.ok(keyTimes.some((k) => Math.abs(k - t) <= 3 / 30 + 1e-6), `no key pose near ${t.toFixed(2)} s (keys at ${keyTimes.map((k) => k.toFixed(2)).join(", ")})`);
      const tolerance = DETAIL_SPEC.balanced.tolerance;
      const fromClip = differenceFromClip(clip, keys);
      assert.ok(fromClip <= tolerance, `${fromClip.toFixed(2)}° from the clip the capture was made of`);
      // What the label says: against the capture itself, shake included.
      assert.ok(keys.maxDiff <= tolerance + 2, `${keys.maxDiff.toFixed(2)}° from the capture`);
    });
  }

  it("the template's key poses come back on the Meshy-like rig too", () => {
    const crooked = crookedRig().model;
    const crookedRigBuilt = buildRig(crooked, captureRestPose(crooked));
    const clip = templateClip(byName("Barbell Squat"));
    const capture = bakeAngles(clip, crookedRigBuilt, 30, 1, 3);
    const keys = keyPosesFromCapture(readCaptureNow(crookedRigBuilt, { clip: capture, driven: drivenBy(capture) }), crookedRigBuilt, "balanced");
    assert.ok(keys.poses.length >= 2 && keys.poses.length <= 3, String(keys.poses.length));
  });

  it("never keeps more key poses than its detail allows, and more detail never keeps fewer", () => {
    const clip = threePoseClip();
    const capture = bakeAngles(clip, rig, 30, 3, 11);
    const frames = readCaptureNow(rig, { clip: capture, driven: drivenBy(capture) });
    const counts = (["fewer", "balanced", "more"] as const).map((d) => keyPosesFromCapture(frames, rig, d));
    assert.ok(counts[0].poses.length <= DETAIL_SPEC.fewer.cap);
    assert.ok(counts[1].poses.length <= DETAIL_SPEC.balanced.cap);
    assert.ok(counts[2].poses.length <= MAX_KEY_POSES);
    assert.ok(counts[0].poses.length <= counts[1].poses.length && counts[1].poses.length <= counts[2].poses.length, counts.map((c) => c.poses.length).join(" "));
    // A hard cap holds even when the tolerance cannot be met.
    const capped = reduceToKeyPoses({ times: frames.times, poses: frames.poses, duration: frames.duration }, rig, { tolerance: 0.01, cap: 3 });
    assert.ok(capped.poses.length <= 3);
  });

  it("proposes a boomerang for a motion that goes there and back in mirror time, and once for one that does not come back", () => {
    const squat = buildTemplate(byName("Barbell Squat")).poses;
    const there: PoseClipJson = { kind: "pose-angles", version: POSE_CLIP_VERSION, fps: 30, duration: 4, loop: true, keyframes: buildKeyframes(squat, 4, "pingpong"), meta: { loop_mode: "pingpong" } };
    const pingpong = keyPosesFromCapture(readCaptureNow(rig, { clip: bakeAngles(there, rig, 30, 0.5, 5), driven: drivenBy(bakeAngles(there, rig)) }), rig, "balanced");
    assert.equal(pingpong.mode, "pingpong");
    assert.equal(pingpong.poses.length, 2);
    const down: PoseClipJson = { kind: "pose-angles", version: POSE_CLIP_VERSION, fps: 30, duration: 2, loop: false, keyframes: buildKeyframes(squat, 2, "once"), meta: { loop_mode: "once" } };
    const once = keyPosesFromCapture(readCaptureNow(rig, { clip: bakeAngles(down, rig, 30, 0.5, 6), driven: drivenBy(bakeAngles(down, rig)) }), rig, "balanced");
    assert.equal(once.mode, "once");
    assert.equal(once.poses.length, 2);
  });

  it("times the key poses where the capture reaches them (the clip's own timing weights)", () => {
    const clip = templateClip(byName("Barbell Squat"));
    const capture = bakeAngles(clip, rig, 30, 0.5, 9);
    const keys = keyPosesFromCapture(readCaptureNow(rig, { clip: capture, driven: drivenBy(capture) }), rig, "balanced");
    const times = keyframeTimes(keys.poses.length, clip.duration, keys.mode, keys.weights).map((k) => k.t);
    // The squat goes down for two thirds of the loop and up in one third.
    assert.ok(Math.abs(times[1] - (clip.duration * 2) / 3) <= 0.1, times.map((t) => t.toFixed(2)).join(" "));
  });
});
