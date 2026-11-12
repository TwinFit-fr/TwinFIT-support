// The Studio client API: each function sends the request its call site sent before (URL, method, body, signal) and returns the fetch's answer as is.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STORAGE_ORPHANS_KEY,
  STUDIO_AVATARS_KEY,
  STUDIO_EXERCISES_KEY,
  STUDIO_SETTINGS_KEY,
  createAvatar,
  createEquipment,
  createVector,
  deleteAvatar,
  deleteEquipment,
  deleteStorageOrphans,
  deleteVector,
  draftPoses,
  exerciseReferenceKey,
  listVectors,
  patchAvatar,
  patchEquipment,
  patchSettings,
  patchVector,
  postVectorResult,
  tickWorker,
  uploadVector,
  vectorsKey,
  type StudioFetch,
} from "./studio-api.ts";

/** A fetch that records its arguments (exactly as passed, arity included) and answers a fixed value. */
function recorder() {
  const calls: unknown[][] = [];
  const answer = { answered: true };
  const fetch: StudioFetch = (...args) => {
    calls.push(args);
    return Promise.resolve(answer);
  };
  return { calls, answer, fetch };
}

async function sent(call: (fetch: StudioFetch) => Promise<unknown>): Promise<unknown[]> {
  const r = recorder();
  const result = await call(r.fetch);
  assert.equal(result, r.answer, "returns what the fetch answered");
  assert.equal(r.calls.length, 1, "one request");
  return r.calls[0];
}

describe("studio-api keys", () => {
  it("names the list routes", () => {
    assert.equal(STUDIO_EXERCISES_KEY, "/api/studio/exercises");
    assert.equal(STUDIO_AVATARS_KEY, "/api/studio/avatars");
    assert.equal(STUDIO_SETTINGS_KEY, "/api/studio/settings");
    assert.equal(STORAGE_ORPHANS_KEY, "/api/studio/storage/orphans");
    assert.equal(vectorsKey("ex-1"), "/api/studio/vectors?exercise=ex-1");
    assert.equal(exerciseReferenceKey(42, "woman"), "/api/studio/exercises/reference?exo=42&subject=woman");
  });
});

describe("studio-api avatars", () => {
  it("posts JSON or a FormData as is", async () => {
    const body = { mode: "style", code: "A", name: "A", subject: "man", height_m: 1.75, is_default: false, image_data_url: null };
    assert.deepEqual(await sent((f) => createAvatar(f, body)), ["/api/studio/avatars", { method: "POST", body: JSON.stringify(body) }]);
    const form = new FormData();
    form.set("file", new Blob(["glb"]));
    const [url, init] = await sent((f) => createAvatar(f, form));
    assert.equal(url, "/api/studio/avatars");
    assert.deepEqual(Object.keys(init as object), ["method", "body"]);
    assert.equal((init as RequestInit).method, "POST");
    assert.equal((init as RequestInit).body, form);
  });

  it("patches and deletes one avatar", async () => {
    assert.deepEqual(await sent((f) => patchAvatar(f, "av-1", { name: "New" })), ["/api/studio/avatars/av-1", { method: "PATCH", body: '{"name":"New"}' }]);
    assert.deepEqual(await sent((f) => patchAvatar(f, "av-1", { height_m: 1.8 })), ["/api/studio/avatars/av-1", { method: "PATCH", body: '{"height_m":1.8}' }]);
    assert.deepEqual(await sent((f) => patchAvatar(f, "av-1", { action: "set_default" })), ["/api/studio/avatars/av-1", { method: "PATCH", body: '{"action":"set_default"}' }]);
    assert.deepEqual(await sent((f) => patchAvatar(f, "av-1", { action: "retry" })), ["/api/studio/avatars/av-1", { method: "PATCH", body: '{"action":"retry"}' }]);
    const sockets = [{ id: "hand_l", bone: "LeftHand", offset: [0, 0.1, 0] as [number, number, number] }];
    assert.deepEqual(await sent((f) => patchAvatar(f, "av-1", { sockets })), ["/api/studio/avatars/av-1", { method: "PATCH", body: JSON.stringify({ sockets }) }]);
    assert.deepEqual(await sent((f) => deleteAvatar(f, "av-1")), ["/api/studio/avatars/av-1", { method: "DELETE" }]);
  });
});

describe("studio-api equipment", () => {
  it("starts a build as JSON, uploads a FormData as is", async () => {
    assert.deepEqual(await sent((f) => createEquipment(f, { kind: "load", code: "DUMBBELL", prompt: null, image_data_url: null })), [
      "/api/studio/equipment",
      { method: "POST", body: '{"kind":"load","code":"DUMBBELL","prompt":null,"image_data_url":null}' },
    ]);
    assert.deepEqual(await sent((f) => createEquipment(f, { kind: "support", code: "BENCH", prompt: "flat" })), [
      "/api/studio/equipment",
      { method: "POST", body: '{"kind":"support","code":"BENCH","prompt":"flat"}' },
    ]);
    const form = new FormData();
    form.set("file", new Blob(["glb"]));
    form.set("kind", "load");
    form.set("code", "DUMBBELL");
    const [url, init] = await sent((f) => createEquipment(f, form));
    assert.equal(url, "/api/studio/equipment");
    assert.equal((init as RequestInit).method, "POST");
    assert.equal((init as RequestInit).body, form);
  });

  it("patches and deletes one model", async () => {
    assert.deepEqual(await sent((f) => patchEquipment(f, "m-1", { action: "activate" })), ["/api/studio/equipment/m-1", { method: "PATCH", body: '{"action":"activate"}' }]);
    assert.deepEqual(await sent((f) => patchEquipment(f, "m-1", { action: "placement", size_m: 0.5, offset: [0, 1, 0], rotation: undefined })), [
      "/api/studio/equipment/m-1",
      { method: "PATCH", body: '{"action":"placement","size_m":0.5,"offset":[0,1,0]}' },
    ]);
    assert.deepEqual(await sent((f) => deleteEquipment(f, "m-1")), ["/api/studio/equipment/m-1", { method: "DELETE" }]);
  });
});

describe("studio-api vectors", () => {
  it("lists an exercise's rows with the URL alone", async () => {
    assert.deepEqual(await sent((f) => listVectors(f, "ex-1")), ["/api/studio/vectors?exercise=ex-1"]);
  });

  it("enqueues a generation", async () => {
    const body = { exercise_id: "ex-1", avatar_id: "av-1", prompt: "slow", equipment: { items: [{ kind: "load" as const, code: "DUMBBELL" }] }, params: { fps: 30, duration_s: 4, loop: true } };
    assert.deepEqual(await sent((f) => createVector(f, body)), ["/api/studio/vectors", { method: "POST", body: JSON.stringify(body) }]);
  });

  it("sends uploads and results as the FormData given", async () => {
    const form = new FormData();
    form.set("file", new Blob(["{}"]));
    let [url, init] = await sent((f) => uploadVector(f, form));
    assert.equal(url, "/api/studio/vectors/upload");
    assert.equal((init as RequestInit).method, "POST");
    assert.equal((init as RequestInit).body, form);
    [url, init] = await sent((f) => postVectorResult(f, "v-1", form));
    assert.equal(url, "/api/studio/vectors/v-1/result");
    assert.equal((init as RequestInit).method, "POST");
    assert.equal((init as RequestInit).body, form);
  });

  it("patches and deletes one row", async () => {
    assert.deepEqual(await sent((f) => patchVector(f, "v-1", { action: "fail", error: "Stopped by staff" })), [
      "/api/studio/vectors/v-1",
      { method: "PATCH", body: '{"action":"fail","error":"Stopped by staff"}' },
    ]);
    assert.deepEqual(await sent((f) => patchVector(f, "v-1", { action: "edit", prompt: "faster" })), ["/api/studio/vectors/v-1", { method: "PATCH", body: '{"action":"edit","prompt":"faster"}' }]);
    assert.deepEqual(await sent((f) => patchVector(f, "v-1", { action: "requeue" })), ["/api/studio/vectors/v-1", { method: "PATCH", body: '{"action":"requeue"}' }]);
    assert.deepEqual(await sent((f) => deleteVector(f, "v-1")), ["/api/studio/vectors/v-1", { method: "DELETE" }]);
  });
});

describe("studio-api pose draft, settings, storage, worker", () => {
  it("passes the abort signal with the draft request", async () => {
    const own = new AbortController();
    const body = { exercise_id: "ex-1", avatar_id: "av-1", items: [], two_handed: false, instructions: null, pose_count: null };
    const [url, init] = await sent((f) => draftPoses(f, body, own.signal));
    assert.equal(url, "/api/studio/poses/draft");
    assert.deepEqual(Object.keys(init as object), ["method", "signal", "body"]);
    assert.equal((init as RequestInit).method, "POST");
    assert.equal((init as RequestInit).signal, own.signal);
    assert.equal((init as RequestInit).body, JSON.stringify(body));
  });

  it("patches the settings", async () => {
    const body = { max_concurrency: 2, stale_after_minutes: 15, prompt_template: "{subject}", pipeline: { fps: 30, duration_s: 4, loop: true, model: "gpt-5-mini" } };
    assert.deepEqual(await sent((f) => patchSettings(f, body)), ["/api/studio/settings", { method: "PATCH", body: JSON.stringify(body) }]);
  });

  it("sweeps the storage orphans", async () => {
    assert.deepEqual(await sent((f) => deleteStorageOrphans(f)), ["/api/studio/storage/orphans", { method: "DELETE" }]);
  });

  it("ticks the worker", async () => {
    assert.deepEqual(await sent((f) => tickWorker(f, { max: 1 })), ["/api/studio/worker", { method: "POST", body: '{"max":1}' }]);
  });
});
