import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { frameDirectives, logoDirective, startGuideDirective } from "./reference.ts";

const none = { support: false, equipment: false, references: [], logo: false };

describe("frameDirectives", () => {
  it("numbers every input of a Start in send order", () => {
    const out = frameDirectives({
      kind: "start",
      primary: true,
      support: true,
      equipment: true,
      references: [{ name: "grip", instruction: "Copy the grip." }],
      logo: true,
    });
    assert.equal(out.length, 5);
    assert.match(out[0], /^CHARACTER REFERENCE \(INPUT IMAGE 1\)/);
    assert.match(out[1], /^SUPPORT EQUIPMENT REFERENCE \(INPUT IMAGE 2\)/);
    assert.match(out[2], /^LOAD EQUIPMENT REFERENCE \(INPUT IMAGE 3\)/);
    assert.match(out[3], /^REFERENCE IMAGE 4 \("grip"\)/);
    assert.match(out[4], /input image 5 is the brand symbol/);
  });

  it("lets a Start place and orient the support", () => {
    const [, support] = frameDirectives({ ...none, kind: "start", primary: true, support: true });
    assert.match(support, /Rotate or mirror it/);
  });

  it("keeps the Start's support in place on an edit, with no rotate or mirror order", () => {
    const out = frameDirectives({ ...none, kind: "edit", primary: true, support: true, equipment: true });
    assert.match(out[0], /^EDIT OF THE START FRAME \(INPUT IMAGE 1\)/);
    assert.match(out[0], /reference cards only/);
    assert.match(out[1], /^SUPPORT EQUIPMENT CARD \(INPUT IMAGE 2\)/);
    assert.match(out[1], /Do not move, rotate, mirror/);
    assert.match(out[2], /^LOAD EQUIPMENT CARD \(INPUT IMAGE 3\)/);
    for (const text of out) assert.doesNotMatch(text, /Rotate or mirror it|Place it where/);
  });

  it("asks an edit to keep only planted feet still, not every pair of feet", () => {
    const [guide] = frameDirectives({ ...none, kind: "edit", primary: true });
    assert.match(guide, /feet while they stay planted/);
    assert.doesNotMatch(guide, /Keep the feet in exactly the same place/);
    assert.doesNotMatch(guide, /reference cards only/);
  });

  it("numbers from 1 when there is no primary image", () => {
    const out = frameDirectives({ ...none, kind: "start", primary: false, support: true });
    assert.equal(out.length, 1);
    assert.match(out[0], /INPUT IMAGE 1/);
  });
});

describe("prompt texts", () => {
  it("puts the logo on the left of the chest, never centered", () => {
    assert.match(logoDirective(), /left side of the chest/);
    assert.doesNotMatch(logoDirective(), /small and centered/);
  });

  it("names the Start input by its number", () => {
    assert.match(startGuideDirective(1), /input image 1 is the start position/);
  });
});
