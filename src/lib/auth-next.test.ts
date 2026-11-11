import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isStudioPath, loginUrl, safeNextPath } from "./auth-next.ts";

describe("safeNextPath", () => {
  it("keeps a path of this app, with its query", () => {
    assert.equal(safeNextPath("/studio"), "/studio");
    assert.equal(safeNextPath("/studio?exercise=12&debug=1"), "/studio?exercise=12&debug=1");
  });

  it("falls back for anything that could leave the app", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "studio", "/stu\ndio"]) {
      assert.equal(safeNextPath(bad), "/", bad);
    }
  });

  it("falls back when empty or pointing at the login page", () => {
    assert.equal(safeNextPath(null), "/");
    assert.equal(safeNextPath(""), "/");
    assert.equal(safeNextPath("/login?next=/studio"), "/");
    assert.equal(safeNextPath(undefined, "/studio"), "/studio");
  });
});

describe("loginUrl", () => {
  it("carries the page that asked for the sign-in", () => {
    assert.equal(loginUrl("/studio?exercise=3"), "/login?next=%2Fstudio%3Fexercise%3D3");
  });

  it("is plain for the dashboard root or an unsafe path", () => {
    assert.equal(loginUrl("/"), "/login");
    assert.equal(loginUrl("//evil.example"), "/login");
  });
});

describe("isStudioPath", () => {
  it("knows the Studio's pages", () => {
    assert.equal(isStudioPath("/studio"), true);
    assert.equal(isStudioPath("/studio?exercise=1"), true);
    assert.equal(isStudioPath("/studio/x"), true);
    assert.equal(isStudioPath("/studios"), false);
    assert.equal(isStudioPath("/"), false);
  });
});
