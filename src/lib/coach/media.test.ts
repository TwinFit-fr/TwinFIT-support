import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  altFromFileName,
  buildFolderTree,
  displayName,
  filesInFolder,
  folderOf,
  isValidFolder,
  isValidObjectName,
  mediaObjectName,
  safeFileName,
  slugsReferencing,
  suggestionFolder,
  validateImageFile,
} from "./media.ts";
import type { Suggestion } from "./types.ts";

describe("image files", () => {
  it("accepts images under the limit and refuses the rest", () => {
    assert.equal(validateImageFile({ name: "a.png", type: "image/png", size: 10 }), null);
    assert.match(validateImageFile({ name: "a.pdf", type: "application/pdf", size: 10 }) ?? "", /not an image/);
    assert.match(validateImageFile({ name: "big.png", type: "image/png", size: 6 * 1024 * 1024 }) ?? "", /limit is 5 MB/);
  });

  it("derives an alt text from the file name", () => {
    assert.equal(altFromFileName("Squat depth.v2.png"), "Squat depth.v2");
    assert.equal(altFromFileName("lessons/x/1730000000000-squat[1].png"), "squat 1");
  });
});

describe("folders", () => {
  it("validates folders and object names", () => {
    assert.equal(isValidFolder("lessons/app_overview"), true);
    assert.equal(isValidFolder("shared"), true);
    assert.equal(isValidFolder("Lessons/x"), false);
    assert.equal(isValidFolder("/lessons"), false);
    assert.equal(isValidFolder("a/b/c/d/e"), false);
    assert.equal(isValidFolder("../x"), false);
    assert.equal(isValidObjectName("lessons/x/1-squat.png"), true);
    assert.equal(isValidObjectName("squat.png"), false);
    assert.equal(isValidObjectName("lessons/x/sq uat.png"), false);
  });

  it("names uploads after the suggestion and a timestamp", () => {
    assert.equal(suggestionFolder("lesson", "App Overview"), "lessons/app_overview");
    assert.equal(suggestionFolder("prompt", "warm-up"), "prompts/warm-up");
    assert.equal(mediaObjectName("lessons/x", "Squat depth (1).png", 1730000000000), "lessons/x/1730000000000-Squat_depth_1_.png");
    assert.equal(safeFileName("..hidden"), "hidden");
    assert.equal(safeFileName(""), "image.png");
  });

  it("splits names into folder and display name", () => {
    assert.equal(folderOf("lessons/x/1730000000000-squat.png"), "lessons/x");
    assert.equal(folderOf("loose.png"), "");
    assert.equal(displayName("lessons/x/1730000000000-squat.png"), "squat.png");
    assert.equal(displayName("shared/logo.png"), "logo.png");
  });

  it("builds the folder tree with counts and always-present folders", () => {
    const files = [
      { name: "lessons/a/1-x.png" },
      { name: "lessons/a/2-y.png" },
      { name: "lessons/b/3-z.png" },
      { name: "shared/4-w.png" },
      { name: "loose.png" },
    ];
    const tree = buildFolderTree(files, ["lessons", "prompts", "shared", "lessons/c"]);
    assert.equal(tree.total, 5);
    assert.equal(tree.count, 1);
    assert.deepEqual(
      tree.children.map((c) => [c.path, c.count, c.total]),
      [
        ["lessons", 0, 3],
        ["prompts", 0, 0],
        ["shared", 1, 1],
      ],
    );
    assert.deepEqual(
      tree.children[0].children.map((c) => [c.path, c.count]),
      [
        ["lessons/a", 2],
        ["lessons/b", 1],
        ["lessons/c", 0],
      ],
    );
    assert.deepEqual(filesInFolder(files, "lessons/a").map((f) => f.name), ["lessons/a/1-x.png", "lessons/a/2-y.png"]);
    assert.equal(filesInFolder(files, "lessons", true).length, 3);
    assert.equal(filesInFolder(files, "", true).length, 5);
    assert.equal(filesInFolder(files, "").length, 1);
  });

  it("finds the suggestions that embed a url", () => {
    const row = (slug: string, md: string): Suggestion => ({
      id: slug,
      slug,
      active: true,
      requires_personal_data: false,
      requires_plan_builder: false,
      kind: "lesson",
      unlocks_after: null,
      section_slug: null,
      sort_order: 0,
      created_at: "",
      updated_at: "",
      localizations: [{ suggestion_id: slug, locale: "en", text: "t", answer_md: md }],
    });
    const url = "https://h/v1/files/11111111-1111-4111-8111-111111111111";
    assert.deepEqual(slugsReferencing([row("a", `![x](${url})`), row("b", "none")], url), ["a"]);
  });
});
