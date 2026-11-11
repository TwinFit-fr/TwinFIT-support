import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DEFAULT_PARAMS, type TemplateExercise } from "./exercise-templates.ts";
import { DEAD_PX, carriedStart, chooseSetting, commitIndex, closeTo, dragCandidates, easePose, easeStep, nearestOnTrack, overshootOf, poseAlong, usefulTracks, type DragChoice, type Track } from "./setting-drag.ts";

const CATALOG = JSON.parse(readFileSync(new URL("./__fixtures__/catalog-exercises.json", import.meta.url), "utf8")) as TemplateExercise[];
const byName = (name: string) => CATALOG.find((ex) => ex.name === name)!;

// The hips of a squat seen from the front: deeper range is lower on screen; stance barely moves them.
const range: Track = { key: "range", keyframe: 1, values: ["partial", "full", "deep"], current: 1, screen: [{ x: 300, y: 380 }, { x: 300, y: 420 }, { x: 300, y: 450 }] };
const stance: Track = { key: "stance", keyframe: 1, values: ["narrow", "hip", "shoulder", "wide"], current: 2, screen: [{ x: 300, y: 412 }, { x: 300, y: 416 }, { x: 300, y: 420 }, { x: 300, y: 426 }] };
// A foot seen from the front: a wider stance moves it out to the side.
const footStance: Track = { key: "stance", keyframe: 0, values: ["narrow", "hip", "shoulder", "wide"], current: 2, screen: [{ x: 330, y: 600 }, { x: 340, y: 600 }, { x: 352, y: 600 }, { x: 395, y: 602 }] };
const footRange: Track = { key: "range", keyframe: 1, values: ["partial", "full", "deep"], current: 1, screen: [{ x: 352, y: 600 }, { x: 352, y: 600 }, { x: 352, y: 600 }] };

describe("choosing the setting a drag drives", () => {
  it("pulling the hips down goes to a deeper range, and back up to a shallower one", () => {
    const down = chooseSetting([range, stance], { x: 300, y: 420 }, { x: 302, y: 452 }, null)!;
    assert.equal(down.key, "range");
    assert.equal(down.value, "deep");
    const up = chooseSetting([range, stance], { x: 300, y: 420 }, { x: 300, y: 385 }, down)!;
    assert.equal(up.value, "partial");
  });

  it("follows the pointer between two choices (the body is drawn part of the way)", () => {
    const half = chooseSetting([range], { x: 300, y: 420 }, { x: 300, y: 435 }, null)!;
    assert.ok(half.t > 1.4 && half.t < 1.6, String(half.t));
    assert.equal(half.index, 2);
  });

  it("pulling a foot out to the side widens the stance; a setting that does not move the point is ignored", () => {
    assert.deepEqual(usefulTracks([footStance, footRange]).map((t) => t.key), ["stance"]);
    const out = chooseSetting([footStance, footRange], { x: 352, y: 600 }, { x: 398, y: 604 }, null)!;
    assert.equal(out.key, "stance");
    assert.equal(out.value, "wide");
  });

  it("says nothing helps when no setting moves the point", () => {
    assert.equal(chooseSetting([footRange], { x: 352, y: 600 }, { x: 400, y: 600 }, null), null);
  });

  it("a pull past the last choice is as far as the setting goes, not off the track", () => {
    const far = chooseSetting([range], { x: 300, y: 420 }, { x: 305, y: 560 }, null)!;
    assert.equal(far.off, false);
    assert.equal(far.limit, true);
    assert.equal(far.value, "deep");
  });

  it("flags a pull far from every track (no setting moves the point that way)", () => {
    const aside = chooseSetting([range], { x: 300, y: 420 }, { x: 420, y: 420 }, null)!;
    assert.equal(aside.off, true);
    assert.equal(aside.value, "full");
  });

  it("stays on the press until the pointer really moves", () => {
    const still = chooseSetting([range, stance], { x: 300, y: 420 }, { x: 300 + DEAD_PX - 1, y: 420 }, null)!;
    assert.equal(still.t, 1);
    assert.equal(still.value, "full");
  });

  it("keeps the setting it follows unless another one is clearly nearer", () => {
    const previous: DragChoice = { key: "stance", keyframe: 1, t: 2, index: 2, value: "shoulder", off: false, limit: false, settled: true };
    const kept = chooseSetting([range, stance], { x: 300, y: 420 }, { x: 300, y: 424 + DEAD_PX }, previous)!;
    assert.equal(kept.key, "stance");
    const switched = chooseSetting([range, stance], { x: 300, y: 420 }, { x: 300, y: 450 }, previous)!;
    assert.equal(switched.key, "range");
  });

  it("between settings about as near, follows the one that moves the point most, even on another pose", () => {
    // Standing pose: a wider stance lowers the hips a little. Bottom pose: the range moves them a lot.
    const standingStance: Track = { key: "stance", keyframe: 0, values: ["narrow", "hip", "shoulder", "wide"], current: 2, screen: [{ x: 300, y: 300 }, { x: 300, y: 301 }, { x: 300, y: 302 }, { x: 300, y: 312 }] };
    const first = chooseSetting([standingStance, range], { x: 300, y: 302 }, { x: 300, y: 310 }, null)!;
    assert.equal(first.key, "range");
    assert.equal(first.keyframe, 1);
  });

  it("stays on the pose on the stage when another pose moves the point only a little more", () => {
    // A press seen from the front: the grip moves the hand out at the shoulders and a bit more overhead.
    const shoulders: Track = { key: "grip", keyframe: 0, values: ["narrow", "shoulder", "wide"], current: 1, screen: [{ x: 516, y: 245 }, { x: 522, y: 241 }, { x: 548, y: 251 }] };
    const overhead: Track = { key: "grip", keyframe: 1, values: ["narrow", "shoulder", "wide"], current: 1, screen: [{ x: 477, y: 148 }, { x: 486, y: 149 }, { x: 518, y: 158 }] };
    const out = chooseSetting([shoulders, overhead], { x: 522, y: 241 }, { x: 550, y: 247 }, null)!;
    assert.equal(out.keyframe, 0);
    assert.equal(out.value, "wide");
    // Pulled on past the widest grip, the overhead pose is nearer, but it is the same setting: the stage stays.
    const far = chooseSetting([shoulders, overhead], { x: 522, y: 241 }, { x: 600, y: 247 }, out)!;
    assert.equal(far.keyframe, 0);
    assert.equal(far.limit, true);
  });

  it("follows the setting whose step runs along the pull: the chest pulled forward is lean, not depth", () => {
    // Side view of the bottom pose: more lean takes the chest forward (left), more depth takes it down.
    const lean: Track = { key: "lean", keyframe: 1, values: ["upright", "moderate", "forward"], current: 1, screen: [{ x: 330, y: 300 }, { x: 300, y: 310 }, { x: 268, y: 322 }] };
    const depth: Track = { key: "range", keyframe: 1, values: ["partial", "full", "deep"], current: 1, screen: [{ x: 304, y: 260 }, { x: 300, y: 310 }, { x: 292, y: 350 }] };
    const pulled = chooseSetting([depth, lean], { x: 300, y: 310 }, { x: 290, y: 314 }, null)!;
    assert.equal(pulled.key, "lean");
    const down = chooseSetting([depth, lean], { x: 300, y: 310 }, { x: 298, y: 322 }, null)!;
    assert.equal(down.key, "range");
  });

  it("what the press showed first is not kept: the first real move chooses", () => {
    // At the press the first setting listed (stance) is shown; pulling down then chooses the range.
    const press = chooseSetting([stance, range], { x: 300, y: 420 }, { x: 300, y: 421 }, null)!;
    assert.equal(press.key, "stance");
    assert.equal(press.settled, false);
    const pulled = chooseSetting([stance, range], { x: 300, y: 420 }, { x: 300, y: 428 }, press)!;
    assert.equal(pulled.key, "range");
    assert.equal(pulled.settled, true);
  });

  it("a foot pulled out past the widest stance, then pushed back as far, returns to the stance it started on", () => {
    const from = { x: 352, y: 600 };
    const out = { x: 352 + 120, y: 600 };
    const wide = chooseSetting([footStance], from, out, null)!;
    assert.equal(wide.value, "wide");
    assert.equal(wide.limit, true);
    const over = overshootOf(footStance, from, out, wide)!;
    assert.deepEqual(over, { x: 77, y: -2 });
    // The next drag starts on the foot at its wide place; the travel counts from further out.
    const atWide: Track = { ...footStance, current: 3 };
    const press = { x: 395, y: 602 };
    const back = chooseSetting([atWide], carriedStart(press, over), { x: press.x - 120, y: press.y }, null)!;
    assert.equal(back.value, "shoulder");
    // Without the carried overshoot the same push goes past the start, to the narrowest stance.
    assert.equal(chooseSetting([atWide], press, { x: press.x - 120, y: press.y }, null)!.value, "narrow");
    // Pulled out level while the stance takes the foot out and a little up: still past the end.
    const slanted: Track = { ...footStance, screen: [{ x: 330, y: 600 }, { x: 340, y: 598 }, { x: 352, y: 596 }, { x: 380, y: 580 }] };
    const level = chooseSetting([slanted], { x: 352, y: 596 }, { x: 452, y: 596 }, null)!;
    assert.equal(level.limit, true);
    assert.ok(overshootOf(slanted, { x: 352, y: 596 }, { x: 452, y: 596 }, level));
    // A release that was not past an end leaves nothing over.
    const inside = chooseSetting([footStance], from, { x: 380, y: 600 }, null)!;
    assert.equal(overshootOf(footStance, from, { x: 380, y: 600 }, inside), null);
  });

  it("a release a third of the way to the next choice applies it, in either direction", () => {
    assert.equal(commitIndex(1, 1, 3), 1);
    assert.equal(commitIndex(1.3, 1, 3), 1);
    assert.equal(commitIndex(1.4, 1, 3), 2);
    assert.equal(commitIndex(0.6, 1, 3), 0);
    assert.equal(commitIndex(0.7, 1, 3), 1);
    assert.equal(commitIndex(2.4, 0, 3), 2);
    assert.equal(commitIndex(5, 0, 3), 2);
    // A short pull of the hips (40 % of the way to the deeper range) is applied on release.
    const short = chooseSetting([range], { x: 300, y: 420 }, { x: 300, y: 432 }, null)!;
    assert.equal(short.value, "deep");
  });

  it("a foot pulled part of the way out, then pushed back as far on the next drag, returns to the stance it started on", () => {
    const from = { x: 352, y: 600 };
    const out = chooseSetting([footStance], from, { x: 370, y: 600 }, null)!;
    assert.equal(out.value, "wide");
    const atWide: Track = { ...footStance, current: 3 };
    const press = { x: 395, y: 602 };
    const back = chooseSetting([atWide], press, { x: press.x - 18, y: press.y }, null)!;
    assert.equal(back.value, "shoulder");
  });

  it("projects onto the nearest segment of a track", () => {
    const at = nearestOnTrack(range, { x: 310, y: 400 });
    assert.ok(Math.abs(at.t - 0.5) < 1e-6);
    assert.ok(Math.abs(at.dist - 10) < 1e-6);
  });
});

describe("drag candidates from the template", () => {
  it("builds the pose being dragged for every choice of every setting, from the draft's settings", () => {
    const squat = byName("Air Squat");
    const cands = dragCandidates(squat, { ...DEFAULT_PARAMS, stance: "wide" }, 1);
    const r = cands.find((c) => c.key === "range")!;
    assert.deepEqual(r.values, ["partial", "full", "deep"]);
    assert.equal(r.current, 1);
    // Deeper range, more knee bend, the stance kept wide for every choice.
    assert.ok(r.poses[0].left_leg.knee_flexion < r.poses[1].left_leg.knee_flexion && r.poses[1].left_leg.knee_flexion < r.poses[2].left_leg.knee_flexion);
    assert.ok(r.params.every((p) => p.stance === "wide"));
    const s = cands.find((c) => c.key === "stance")!;
    assert.equal(s.current, 3);
  });

  it("blends between two choices, and lands exactly on a choice at whole places", () => {
    const squat = byName("Air Squat");
    const r = dragCandidates(squat, DEFAULT_PARAMS, 1).find((c) => c.key === "range")!;
    assert.equal(poseAlong(r, 2).pose, r.poses[2]);
    const mid = poseAlong(r, 1.5).pose.left_leg.knee_flexion;
    assert.ok(Math.abs(mid - (r.poses[1].left_leg.knee_flexion + r.poses[2].left_leg.knee_flexion) / 2) < 1e-9);
    assert.equal(poseAlong(r, 9).pose, r.poses[2]);
  });
});

describe("easing between template poses", () => {
  it("moves part of the way each frame and lands exactly on the goal", () => {
    const squat = byName("Air Squat");
    const r = dragCandidates(squat, DEFAULT_PARAMS, 1).find((c) => c.key === "range")!;
    const [from, to] = [r.poses[1], r.poses[2]];
    const step = easePose(from, to, easeStep(16, false));
    const k = (p: typeof from) => p.left_leg.knee_flexion;
    assert.ok(k(step) > k(from) && k(step) < k(to));
    assert.equal(easePose(from, to, easeStep(16, true)), to);
    let shown = from;
    for (let i = 0; i < 60 && !closeTo(shown, to); i += 1) shown = easePose(shown, to, easeStep(16, false));
    assert.ok(closeTo(shown, to));
  });
});
