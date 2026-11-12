import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { useStudioStore } from "./store.ts";

const st = () => useStudioStore.getState();
const issue = { severity: "warning" as const, code: "tilt", message: "Left foot tilts" };

describe("body checks in the store", () => {
  it("marks the result out of date once, and an unchanged result only clears the mark", () => {
    st().setPoseChecks([issue], null);
    const issues = st().poseIssues;
    st().markPoseChecksPending();
    const pending = st();
    st().markPoseChecksPending();
    assert.equal(st(), pending, "already pending: nothing changes");
    st().setPoseChecks([{ ...issue }], null);
    assert.equal(st().poseChecksPending, false);
    assert.equal(st().poseIssues, issues, "the same result keeps the previous list");
    const settled = st();
    st().setPoseChecks([{ ...issue }], null);
    assert.equal(st(), settled);
  });

  it("stores a new result and clears the mark", () => {
    st().markPoseChecksPending();
    st().setPoseChecks([], null);
    assert.deepEqual(st().poseIssues, []);
    assert.equal(st().poseChecksPending, false);
  });
});
