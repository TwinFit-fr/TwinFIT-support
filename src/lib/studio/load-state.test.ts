import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { debugEnabled, failureReason, guideFocus, isSettled, loadState, stageBlocksEditing, stageNote, stageState } from "./load-state.ts";

const rows = (list: unknown[] | undefined) => (list === undefined ? undefined : { rows: list });
const empty = (d: { rows: unknown[] }) => d.rows.length === 0;

describe("load state of a data source", () => {
  it("is loading before any answer, failed or not", () => {
    assert.equal(loadState({ data: undefined }, empty), "loading");
    assert.equal(loadState({ data: undefined, error: undefined }, empty), "loading");
  });

  it("is failed when the request failed and nothing came before", () => {
    assert.equal(loadState({ data: undefined, error: new Error("Request failed (500)") }, empty), "failed");
  });

  it("is empty or ready once the answer is in", () => {
    assert.equal(loadState({ data: rows([]) }, empty), "empty");
    assert.equal(loadState({ data: rows([1]) }, empty), "ready");
  });

  it("keeps showing data when a later refresh fails", () => {
    assert.equal(loadState({ data: rows([1]), error: new Error("boom") }, empty), "ready");
    assert.equal(loadState({ data: rows([]), error: new Error("boom") }, empty), "empty");
  });

  it("calls only answered sources settled", () => {
    assert.deepEqual((["loading", "failed", "empty", "ready"] as const).map(isSettled), [false, false, true, true]);
  });
});

describe("failure reason", () => {
  it("says nothing for an empty error", () => {
    assert.equal(failureReason(undefined), null);
    assert.equal(failureReason(new Error("  ")), null);
  });

  it("puts network and session errors in plain words", () => {
    assert.equal(failureReason(new TypeError("Failed to fetch")), "The server could not be reached.");
    assert.equal(failureReason(new Error("Not authenticated")), "Your session has expired. Sign in again.");
    assert.equal(failureReason(new Error("Request failed (503)")), "The server had a problem answering.");
  });

  it("keeps a server message, shortened", () => {
    assert.equal(failureReason(new Error("Hasura is down")), "Hasura is down");
    const long = failureReason(new Error("x".repeat(300)));
    assert.equal(long?.length, 118);
    assert.ok(long?.endsWith("…"));
  });
});

describe("stage state", () => {
  const a = (status: string, extra: { name?: string; progress?: number | null } = {}) => ({ status, name: extra.name ?? "Avatar", progress: extra.progress });

  it("waits while the avatar list loads and never claims there is no avatar", () => {
    assert.deepEqual(stageState("loading", []), { kind: "loading" });
  });

  it("reports a failed list as a failure, not as a first run", () => {
    assert.deepEqual(stageState("failed", []), { kind: "failed" });
  });

  it("is a first run when the list answered with no usable avatar", () => {
    assert.deepEqual(stageState("empty", []), { kind: "no-avatar" });
    assert.deepEqual(stageState("ready", [a("error")]), { kind: "no-avatar" });
  });

  it("is ready as soon as one avatar is ready", () => {
    assert.deepEqual(stageState("ready", [a("processing"), a("ready")]), { kind: "ready" });
  });

  it("shows a build in progress when no avatar is ready yet", () => {
    assert.deepEqual(stageState("ready", [a("error"), a("processing", { name: "TwinFIT man", progress: 41.6 })]), { kind: "building", name: "TwinFIT man", progress: 42 });
    assert.deepEqual(stageState("ready", [a("pending", { progress: null })]), { kind: "building", name: "Avatar", progress: 0 });
    assert.deepEqual(stageState("ready", [a("pending", { progress: 180 })]), { kind: "building", name: "Avatar", progress: 100 });
  });
});

describe("guide focus", () => {
  const ready = { kind: "ready" } as const;

  it("invites to pick an exercise only when the catalog and the avatars are in", () => {
    assert.deepEqual(guideFocus("ready", ready), { kind: "pick" });
    assert.deepEqual(guideFocus("loading", ready), { kind: "loading" });
    assert.deepEqual(guideFocus("ready", { kind: "loading" }), { kind: "loading" });
  });

  it("puts an avatar problem first, even with the catalog in", () => {
    assert.deepEqual(guideFocus("ready", { kind: "failed" }), { kind: "avatars-failed" });
    assert.deepEqual(guideFocus("failed", { kind: "failed" }), { kind: "avatars-failed" });
    assert.deepEqual(guideFocus("loading", { kind: "no-avatar" }), { kind: "no-avatar" });
    assert.deepEqual(guideFocus("ready", { kind: "building", name: "TwinFIT man", progress: 40 }), { kind: "building", name: "TwinFIT man", progress: 40 });
  });

  it("says when the catalog failed or is empty instead of pointing at it", () => {
    assert.deepEqual(guideFocus("failed", ready), { kind: "catalog-failed" });
    assert.deepEqual(guideFocus("failed", { kind: "loading" }), { kind: "catalog-failed" });
    assert.deepEqual(guideFocus("empty", ready), { kind: "catalog-empty" });
  });

  it("has a panel note for a stage without an avatar, none while it loads or once ready", () => {
    assert.equal(stageNote({ kind: "loading" }), null);
    assert.equal(stageNote(ready), null);
    assert.deepEqual(stageNote({ kind: "failed" }), { kind: "avatars-failed" });
    assert.deepEqual(stageNote({ kind: "no-avatar" }), { kind: "no-avatar" });
  });

  it("lets editing show only on a stage that can draw an avatar", () => {
    assert.equal(stageBlocksEditing(ready), false);
    for (const kind of ["loading", "failed", "no-avatar"] as const) assert.equal(stageBlocksEditing({ kind }), true);
    assert.equal(stageBlocksEditing({ kind: "building", name: "A", progress: 1 }), true);
  });
});

describe("debug flag", () => {
  it("is on only when asked for", () => {
    assert.equal(debugEnabled(""), false);
    assert.equal(debugEnabled("?exo=12"), false);
    assert.equal(debugEnabled("?debug=0"), false);
    assert.equal(debugEnabled("?debug=1"), true);
    assert.equal(debugEnabled("?exo=3&debug=true"), true);
    assert.equal(debugEnabled("?debug=ON"), true);
  });
});
