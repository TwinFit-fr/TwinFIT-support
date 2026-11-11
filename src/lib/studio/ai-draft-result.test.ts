import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { NEUTRAL_POSE, setPoseValue } from "./anatomy.ts";
import { aiNotesOf, aiReplacement, handMadeWork, keepHandWork, posesPhrase, replacementSummary, type AiDraftResponse } from "./ai-draft-result.ts";
import { draftParams, hasManualEdits } from "./draft-params.ts";
import { DEFAULT_PARAMS, type TemplateExercise } from "./exercise-templates.ts";
import { templateDraft } from "./template-draft.ts";

const CATALOG = JSON.parse(readFileSync(new URL("./__fixtures__/catalog-exercises.json", import.meta.url), "utf8")) as TemplateExercise[];
const AIR_SQUAT = CATALOG.find((ex) => ex.name === "Air Squat")!;

/** The shape the server returned for Air Squat with the note "Deep squat with a wide stance, slow on the way down" (poses left out). */
const answer = (over: Partial<AiDraftResponse> = {}): AiDraftResponse => ({
  poses: [NEUTRAL_POSE, NEUTRAL_POSE],
  labels: ["standing", "bottom"],
  weights: [1, 3],
  mode: "cycle",
  notes: "Animator requests a wide stance but the description and frames specify about shoulder-width.",
  conflicts: ["Animator requests a wide stance but the description and frames specify about shoulder-width."],
  clamped: [],
  grip: "STANDARD",
  template: "squat",
  params: { range: "deep", stance: "wide", grip: "shoulder", lean: "moderate", side: "both", down_s: 3, up_s: 1 },
  raw: JSON.stringify({ range: "deep", stance: "wide", grip: "shoulder", lean: "moderate", side: "both", down_s: 3, up_s: 1, conflicts: [] }),
  unilateral: false,
  airborne: false,
  moving: false,
  check: { ok: true, issues: [] },
  ...over,
});

const editOf = (draft: ReturnType<typeof templateDraft>, over: Record<string, unknown> = {}) => ({
  poses: draft.poses,
  labels: draft.labels,
  weights: draft.weights,
  meta: draft.meta,
  origin: draft.origin,
  edited: false,
  ...over,
});

describe("AI draft answer for a templated exercise", () => {
  it("becomes the template's poses for the settings it chose, exactly as if the user had set them", () => {
    const next = aiReplacement(answer(), AIR_SQUAT, 1, "deeper");
    const same = templateDraft(AIR_SQUAT, { ...DEFAULT_PARAMS, range: "deep", stance: "wide", down_s: 3, up_s: 1 });
    assert.deepEqual(next.poses, same.poses);
    assert.deepEqual(next.meta, same.meta);
    assert.equal(next.origin.kind, "ai");
    assert.equal(next.origin.params?.range, "deep");
    assert.equal(next.origin.params?.stance, "wide");
    // The settings group reads them back, and nothing counts as a manual edit.
    const edit = editOf(same, { poses: next.poses, meta: next.meta, origin: next.origin });
    assert.equal(draftParams(AIR_SQUAT, edit).range, "deep");
    assert.equal(hasManualEdits(edit, AIR_SQUAT), false);
    assert.equal(next.keyframe, 1);
  });

  it("keeps what the model said: contradictions apart from notes, and the note it was given", () => {
    const notes = aiNotesOf(answer(), AIR_SQUAT, "  deeper ");
    assert.equal(notes.notes, null);
    assert.deepEqual(notes.conflicts, ["Animator requests a wide stance but the description and frames specify about shoulder-width."]);
    assert.deepEqual(notes.adjusted, []);
    assert.deepEqual(notes.checks, []);
    assert.equal(notes.instructions, "deeper");
  });

  it("lists what was clamped or set back after the model answered", () => {
    const raw = JSON.stringify({ range: "deep", stance: "wide", grip: "wide", lean: "moderate", side: "both", down_s: 9, up_s: 1 });
    const notes = aiNotesOf(answer({ raw, params: { range: "deep", stance: "wide", grip: "wide", lean: "moderate", side: "both", down_s: 6, up_s: 1 } }), AIR_SQUAT);
    assert.ok(notes.adjusted.some((line) => /^Tempo 9 s down: clamped to 6 s\.$/.test(line)), notes.adjusted.join(" | "));
    // A bodyweight squat has no grip setting: what the model chose is said, not silently dropped.
    assert.ok(notes.adjusted.some((line) => /^Grip wide: not a setting of this exercise/.test(line)), notes.adjusted.join(" | "));
  });

  it("says when the server fell back to the template's defaults", () => {
    const notes = aiNotesOf(answer({ notes: "The chosen parameters did not hold up as a body: template defaults used. Text says wide.", conflicts: ["Text says wide."], params: { ...DEFAULT_PARAMS } }), AIR_SQUAT);
    assert.equal(notes.notes, null);
    assert.match(notes.adjusted[0], /did not pass the body check/);
  });

  it("keeps a failed server body check", () => {
    const notes = aiNotesOf(answer({ check: { ok: false, issues: [{ message: "Pose 2: the feet leave the floor" }] } }), AIR_SQUAT);
    assert.deepEqual(notes.checks, ["Pose 2: the feet leave the floor"]);
  });
});

describe("AI draft answer for an exercise without a template", () => {
  it("is the model's own poses, names and timing, with its notes and clamped angles", () => {
    const posed = setPoseValue(NEUTRAL_POSE, "left_arm.elbow_flexion", 90);
    const next = aiReplacement(answer({ template: null, params: null, poses: [NEUTRAL_POSE, posed], notes: "Elbows bend at the top.", conflicts: [], clamped: ["pose 2: left_arm.elbow_flexion 170 -> 150"], raw: null }), null, 5);
    assert.deepEqual(next.poses, [NEUTRAL_POSE, posed]);
    assert.deepEqual(next.labels, ["standing", "bottom"]);
    assert.equal(next.origin.template, null);
    assert.equal(next.origin.explain?.notes, "Elbows bend at the top.");
    assert.deepEqual(next.origin.explain?.adjusted, ["pose 2: left_arm.elbow_flexion 170 -> 150"]);
    assert.equal(next.keyframe, 1);
  });
});

describe("suggestion or direct apply", () => {
  const draft = templateDraft(AIR_SQUAT, DEFAULT_PARAMS);

  it("applies directly over the template's own poses (settings changes included)", () => {
    assert.equal(handMadeWork(editOf(draft), AIR_SQUAT), false);
    const wide = templateDraft(AIR_SQUAT, { ...DEFAULT_PARAMS, stance: "wide" });
    assert.equal(handMadeWork(editOf(wide), AIR_SQUAT), false);
  });

  it("offers a suggestion over a limb edited by hand", () => {
    const poses = draft.poses.map((p, i) => (i === 1 ? setPoseValue(p, "left_arm.shoulder_elevation", 40) : p));
    const edit = editOf(draft, { poses, edited: true });
    assert.equal(handMadeWork(edit, AIR_SQUAT), true);
    const summary = replacementSummary(edit, aiReplacement(answer(), AIR_SQUAT, 0), AIR_SQUAT);
    assert.match(summary, /^Applying replaces your edits on pose 2 and sets Range: deep, Stance: wide, Tempo: 3 s down, 1 s up\.$/);
  });

  it("offers a suggestion over a hand-tuned saved clip, naming it", () => {
    const poses = [...draft.poses, draft.poses[0]];
    const edit = editOf(draft, { poses, origin: { kind: "clip", vectorId: "v", seq: 12, from: null } });
    assert.equal(handMadeWork(edit, AIR_SQUAT), true);
    assert.match(replacementSummary(edit, aiReplacement(answer(), AIR_SQUAT, 0), AIR_SQUAT), /^Applying replaces the 3 hand-tuned poses of saved clip #12 with the AI's 2 and sets /);
  });

  it("offers a suggestion over pose names the user typed", () => {
    const edit = editOf(draft, { labels: ["start", "deepest"], edited: true });
    assert.equal(handMadeWork(edit, AIR_SQUAT), true);
    assert.match(replacementSummary(edit, aiReplacement(answer(), AIR_SQUAT, 0), AIR_SQUAT), /replaces the pose names you typed/);
  });

  it("without a template, any edit or a saved clip counts as made by hand", () => {
    const neutral = { poses: [NEUTRAL_POSE], labels: null, weights: null, meta: {}, origin: { kind: "neutral" as const, reason: "no-template" as const }, edited: false };
    assert.equal(handMadeWork(neutral, null), false);
    assert.equal(handMadeWork({ ...neutral, edited: true }, null), true);
    assert.equal(handMadeWork({ ...neutral, origin: { kind: "clip", vectorId: "v", seq: 3, from: null } }, null), true);
  });

  it("names poses in plain words", () => {
    assert.equal(posesPhrase([1]), "pose 2");
    assert.equal(posesPhrase([0, 2]), "poses 1 and 3");
    assert.equal(posesPhrase([0, 1, 3]), "poses 1, 2 and 4");
  });
});

describe("an AI answer on poses set by hand", () => {
  it("keeps the joints, pins and names set by hand when each pose matches its automatic pose", () => {
    const start = templateDraft(AIR_SQUAT, DEFAULT_PARAMS);
    const poses = start.poses.map((p, i) => (i === 1 ? setPoseValue(p, "left_arm.wrist_flexion", 25) : p));
    const edit = editOf(start, { poses, labels: ["ready", start.labels![1]], edited: true });
    const kept = keepHandWork(edit, AIR_SQUAT, aiReplacement(answer(), AIR_SQUAT, 1))!;
    const ai = aiReplacement(answer(), AIR_SQUAT, 1);
    assert.equal(kept.next.poses[1].left_arm.wrist_flexion, 25);
    // The knees are the AI's deep squat.
    assert.equal(kept.next.poses[1].left_leg.knee_flexion, ai.poses[1].left_leg.knee_flexion);
    assert.deepEqual(kept.next.labels, ["ready", ai.labels![1]]);
    assert.equal(kept.next.edited, true);
    assert.equal(kept.next.origin.kind, "ai");
    assert.equal(kept.kept, "Kept what you set: left hand in pose 2.");
  });

  it("cannot keep anything from raw angles, or when a pose was added", () => {
    const start = templateDraft(AIR_SQUAT, DEFAULT_PARAMS);
    assert.equal(keepHandWork(editOf(start), AIR_SQUAT, aiReplacement(answer({ template: null, params: null }), AIR_SQUAT, 0)), null);
    const added = editOf(start, { poses: [...start.poses, start.poses[0]], edited: true });
    assert.equal(keepHandWork(added, AIR_SQUAT, aiReplacement(answer(), AIR_SQUAT, 0)), null);
  });
});
