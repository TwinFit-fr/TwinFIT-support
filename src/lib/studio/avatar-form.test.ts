import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { avatarFormBlocker, explainAvatarError, freeCode, identityFromModel, parseHeight, validateAvatarForm, type AvatarFormInput } from "./avatar-form.ts";
import { MAX_IMAGE_BYTES, MAX_MODEL_BYTES, avatarHeightSchema, codeSchema, modelUrlSchema } from "./schemas.ts";

const base: AvatarFormInput = { code: "NEUTRAL_MAN", name: "Neutral man", height: "1.75", heightOptional: true, takenCodes: [] };

describe("add-avatar inline checks", () => {
  it("accepts a valid form", () => {
    assert.deepEqual(validateAvatarForm(base), {});
  });

  it("agrees with the server's code schema", () => {
    for (const code of ["NEUTRAL_MAN", "A", "MAN_2", "neutral", "2MAN", "MY MAN", "MAN-2", "_MAN"]) {
      const server = codeSchema.safeParse(code).success;
      assert.equal(!validateAvatarForm({ ...base, code }).code, server, code);
    }
  });

  it("agrees with the server's height schema, and reads a decimal comma", () => {
    for (const height of ["0.5", "2.5", "1,75", "0.49", "2.51", "3"]) {
      const value = parseHeight(height);
      assert.equal(!validateAvatarForm({ ...base, height }).height, avatarHeightSchema.safeParse(value).success, height);
    }
    assert.equal(parseHeight("1,75"), 1.75);
    assert.equal(parseHeight(""), null);
    assert.ok(Number.isNaN(parseHeight("tall") as number));
  });

  it("says what to type, including centimetres typed as metres", () => {
    assert.match(validateAvatarForm({ ...base, height: "175" }).height ?? "", /centimetres.*1\.75/);
    assert.match(validateAvatarForm({ ...base, height: "abc" }).height ?? "", /number in metres/);
    assert.match(validateAvatarForm({ ...base, code: "my man" }).code ?? "", /capital letters/);
    assert.match(validateAvatarForm({ ...base, code: "" }).code ?? "", /Required/);
    assert.match(validateAvatarForm({ ...base, name: "  " }).name ?? "", /Required/);
  });

  it("allows an empty height only where the server does", () => {
    assert.equal(validateAvatarForm({ ...base, height: "" }).height, undefined);
    assert.match(validateAvatarForm({ ...base, height: "", heightOptional: false }).height ?? "", /Required/);
  });

  it("refuses a code another avatar uses and suggests a free one", () => {
    const errors = validateAvatarForm({ ...base, code: "MANNEQUIN_MIXAMO", takenCodes: ["MANNEQUIN_MIXAMO", "MANNEQUIN_MIXAMO_2"] });
    assert.match(errors.code ?? "", /MANNEQUIN_MIXAMO_3/);
    assert.equal(freeCode("TWINFIT_MAN", []), "TWINFIT_MAN");
    assert.equal(freeCode("TWINFIT_MAN", ["twinfit_man"]), "TWINFIT_MAN_2");
  });

  it("checks file sizes against the upload limits", () => {
    assert.equal(validateAvatarForm({ ...base, fileBytes: MAX_MODEL_BYTES }).file, undefined);
    assert.match(validateAvatarForm({ ...base, fileBytes: MAX_MODEL_BYTES + 1 }).file ?? "", /limit is 100 MB/);
    assert.match(validateAvatarForm({ ...base, imageBytes: MAX_IMAGE_BYTES + 1 }).image ?? "", /limit is 20 MB/);
  });

  it("turns database and schema refusals into plain words", () => {
    assert.match(explainAvatarError('duplicate key value violates unique constraint "base_avatars_code_key"'), /already uses this code/);
    assert.match(explainAvatarError("code must be SCREAMING_SNAKE"), /capital letters/);
    assert.match(explainAvatarError("Number must be less than or equal to 2.5"), /between 0.5 and 2.5/);
    assert.equal(explainAvatarError("Meshy refused the image"), "Meshy refused the image");
  });

  it("agrees with the server's link rule", () => {
    for (const url of ["https://models.readyplayer.me/abc.glb", "http://x.com/a.glb", "https://", "models.readyplayer.me/abc.glb", "https://x.com/a b.glb", "ftp://x.com/a.glb"]) {
      assert.equal(!validateAvatarForm({ ...base, url }).url, modelUrlSchema.safeParse(url).success, url);
    }
    assert.match(validateAvatarForm({ ...base, url: "" }).url ?? "", /Required/);
    assert.equal(validateAvatarForm(base).url, undefined, "no link check where the source is not a link");
  });

  it("requires the model file and the reference image only where the source needs them", () => {
    assert.match(validateAvatarForm({ ...base, fileRequired: true }).file ?? "", /Required/);
    assert.equal(validateAvatarForm({ ...base, fileRequired: true, fileBytes: 10 }).file, undefined);
    assert.match(validateAvatarForm({ ...base, imageRequired: true }).image ?? "", /style's image/);
    assert.equal(validateAvatarForm({ ...base, imageRequired: true, imageBytes: 10 }).image, undefined);
    assert.equal(validateAvatarForm(base).image, undefined);
  });

  it("reads a name and a free code from a file name or a link", () => {
    assert.deepEqual(identityFromModel("Neutral Man.glb", []), { name: "Neutral Man", code: "NEUTRAL_MAN" });
    assert.deepEqual(identityFromModel("https://cdn.example.com/models/neutral-man.glb?v=2#x", ["NEUTRAL_MAN"]), { name: "neutral-man", code: "NEUTRAL_MAN_2" });
    assert.deepEqual(identityFromModel("https://example.com/a/Big%20Guy.gltf", []), { name: "Big Guy", code: "BIG_GUY" });
    assert.equal(identityFromModel("https://models.readyplayer.me/64bfa15f.glb", [])?.code, "M64BFA15F");
    assert.deepEqual(identityFromModel("https://models.readyplayer.me/64bfa15f0e72c63d7c3934a6.glb", []), { name: "Avatar 64BFA1", code: "AVATAR_64BFA1" });
    assert.equal(identityFromModel("https://example.com/", []), null);
    assert.equal(identityFromModel("https://", []), null);
    for (const input of ["x.glb", "https://e.com/2 heavy-guy!.glb", "https://e.com/%E2%9C%93ok.glb"]) {
      const id = identityFromModel(input, []);
      if (id) assert.ok(codeSchema.safeParse(id.code).success, input);
    }
  });

  it("says why the main action is disabled, naming the first field in form order", () => {
    assert.equal(avatarFormBlocker({}), null);
    assert.equal(avatarFormBlocker({ code: "Use capital letters" }), "Fix the code to continue.");
    assert.equal(avatarFormBlocker({ code: "x", file: "Required: choose" }), "Add the model file to continue (2 fields need attention).");
  });
});
