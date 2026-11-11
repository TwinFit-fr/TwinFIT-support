import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { landingPlan, type LandingVector } from "./landing.ts";

const v = (id: string, extra: Partial<LandingVector> = {}): LandingVector => ({ id, status: "ready", format: "json", active: false, avatar_id: "a1", ...extra });

describe("landing on an exercise", () => {
  it("opens the instant draft at once when the catalog says there is no clip", () => {
    assert.deepEqual(landingPlan({ readyCount: 0, vectors: null, avatarId: "a1", preferredId: null }), { kind: "draft" });
  });

  it("waits for the list when a clip may exist", () => {
    assert.deepEqual(landingPlan({ readyCount: 2, vectors: null, avatarId: "a1", preferredId: null }), { kind: "wait" });
  });

  it("opens the active pose clip of this avatar, else the latest", () => {
    const list = [v("new"), v("act", { active: true }), v("old")];
    assert.equal(landingPlan({ readyCount: 3, vectors: list, avatarId: "a1", preferredId: null }).kind, "edit");
    assert.deepEqual(landingPlan({ readyCount: 3, vectors: list, avatarId: "a1", preferredId: null }), { kind: "edit", vector: list[1] });
    assert.deepEqual(landingPlan({ readyCount: 2, vectors: [v("new"), v("old")], avatarId: "a1", preferredId: null }), { kind: "edit", vector: v("new") });
  });

  it("reopens the clip the user chose", () => {
    const list = [v("new"), v("act", { active: true }), v("old")];
    assert.deepEqual(landingPlan({ readyCount: 3, vectors: list, avatarId: "a1", preferredId: "old" }), { kind: "edit", vector: list[2] });
  });

  it("ignores clips of other avatars and clips that are not ready", () => {
    const list = [v("other", { avatar_id: "a2" }), v("queued", { status: "pending" }), v("failed", { status: "error" })];
    assert.deepEqual(landingPlan({ readyCount: 1, vectors: list, avatarId: "a1", preferredId: null }), { kind: "draft" });
  });

  it("plays a clip that is not made of poses instead of editing it", () => {
    const fbx = v("mocap", { format: "fbx", active: true });
    assert.deepEqual(landingPlan({ readyCount: 1, vectors: [fbx], avatarId: "a1", preferredId: null }), { kind: "play", vector: fbx });
  });

  it("trusts a loaded list over a stale catalog count", () => {
    assert.deepEqual(landingPlan({ readyCount: 0, vectors: [v("fresh")], avatarId: "a1", preferredId: null }), { kind: "edit", vector: v("fresh") });
  });
});
