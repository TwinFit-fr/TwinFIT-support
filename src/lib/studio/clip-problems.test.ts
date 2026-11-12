import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clipName, notPosesClip, stageProblemText, unreadableClip } from "./clip-problems.ts";

describe("clip problems in words", () => {
  it("names captures and pose clips apart", () => {
    assert.equal(clipName("fbx", 800), "Capture #800");
    assert.equal(clipName("json", 801), "Clip #801");
    assert.equal(clipName("bvh", null), "This capture");
  });

  it("never shows a loader's raw message: a broken FBX is 'not a valid FBX file'", () => {
    const p = unreadableClip("THREE.FBXLoader: Unknown format.", "fbx", 800);
    assert.equal(p.kind, "unreadable");
    assert.equal(p.title, "Capture #800 could not be read");
    assert.equal(p.short, "not a valid FBX file");
    assert.doesNotMatch(p.detail, /THREE|Loader|Unknown format/);
    assert.match(p.detail, /Upload the file again from Clips & queue, or start from the template\.$/);
    assert.equal(stageProblemText(p), "Capture #800 could not be read · not a valid FBX file");
  });

  it("says what went wrong for each kind of failure", () => {
    assert.match(unreadableClip("THREE.BVHLoader: HIERARCHY expected.", "bvh", 3).short, /not a valid BVH file/);
    assert.match(unreadableClip("Unexpected token 'g', \"glTF garbage\" is not valid JSON", "glb", 3).short, /not a valid GLB file/);
    assert.match(unreadableClip('fetch for "http://x/a.fbx" responded with 404: Not Found', "fbx", 3).detail, /no longer in storage/);
    assert.match(unreadableClip("Clip download failed (403)", "json", 3).detail, /not allowed/);
    assert.match(unreadableClip("Failed to fetch", "bvh", 3).detail, /check the connection/);
    assert.match(unreadableClip("No hips bone recognised in the clip (bones: a, b…)", "fbx", 3).detail, /no hips bone the Studio recognises/);
    assert.match(unreadableClip("The FBX has no animation", "fbx", 3).short, /no motion/);
    assert.equal(unreadableClip("Cannot read properties of undefined (reading 'x')", "json", 5, "solve").short, "does not fit this avatar");
    const json = unreadableClip("The keyframe file has no tracks", "json", 801);
    assert.equal(json.title, "Clip #801 could not be read");
    assert.match(json.detail, /neither poses nor keyframe tracks/);
  });

  it("a keyframe .json plays but is not offered to the pose editor", () => {
    const p = notPosesClip(801);
    assert.equal(p.kind, "not-poses");
    assert.equal(p.title, "Clip #801 is not made of poses");
    assert.match(p.detail, /plays as it is/);
  });
});
