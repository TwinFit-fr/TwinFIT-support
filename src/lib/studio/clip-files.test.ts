import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLIP_EXTENSIONS, describeKeyframeJson } from "./clip-files.ts";
import { relativeTime } from "./format.ts";
import { isPrivateAddress } from "./safe-fetch.ts";

describe("describeKeyframeJson", () => {
  it("reads fps and the last keyframe time", () => {
    const json = JSON.stringify({ fps: 30, tracks: { Hips: { rotation: [[0, 0, 0, 0, 1], [2.5, 0, 0, 0, 1]] } } });
    assert.deepEqual(describeKeyframeJson(json), { fps: 30, frame_count: 75, duration_ms: 2500 });
  });
  it("is forgiving with text that is not a keyframe file", () => {
    assert.deepEqual(describeKeyframeJson("not json"), { fps: null, frame_count: null, duration_ms: null });
  });
  it("maps every accepted extension to a stored format", () => {
    assert.deepEqual(Object.keys(CLIP_EXTENSIONS).sort(), ["bvh", "fbx", "glb", "gltf", "json"]);
  });
});

describe("relativeTime", () => {
  it("buckets seconds, minutes, hours and days", () => {
    const now = Date.parse("2026-11-07T12:00:00Z");
    assert.equal(relativeTime("2026-11-07T11:59:40Z", now), "just now");
    assert.equal(relativeTime("2026-11-07T11:50:00Z", now), "10 min ago");
    assert.equal(relativeTime("2026-11-07T09:00:00Z", now), "3 h ago");
    assert.equal(relativeTime("2026-11-05T12:00:00Z", now), "2 d ago");
  });
});

describe("isPrivateAddress", () => {
  it("flags loopback, private, link-local and CGNAT ranges", () => {
    for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      assert.equal(isPrivateAddress(a), true, a);
    }
  });
  it("lets public addresses through", () => {
    for (const a of ["8.8.8.8", "172.32.0.1", "100.128.0.1", "2606:4700::1111"]) assert.equal(isPrivateAddress(a), false, a);
  });
});
