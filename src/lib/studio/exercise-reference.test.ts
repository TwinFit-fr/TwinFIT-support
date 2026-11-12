import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_REFERENCE_PREFS, TILE_PX, cardLayout, cardOpen, cardMaxWidth, nearestCorner, nextCorner, parseReferencePrefs, referenceOf, shortText } from "./exercise-reference.ts";

const CRUNCH = {
  frames: [
    { position: 2, image_url: "https://files/end" },
    { position: 0, image_url: "https://files/start" },
  ],
  poses: [
    { position: 0, pose: "Lying supine on the floor, torso at 0° from horizontal. Knees bent to 90°." },
    { position: 1, pose: "Torso at about 20° from horizontal." },
    { position: 2, pose: "Torso at about 35–40° from horizontal. Shoulder blades clear of the floor." },
  ],
};

describe("exercise reference", () => {
  it("takes the first frame as the start and the last as the end, each with its own text", () => {
    const r = referenceOf(CRUNCH);
    assert.equal(r.hasImages, true);
    assert.deepEqual(r.start, { label: "Start", position: 0, image: "https://files/start", text: CRUNCH.poses[0].pose });
    assert.deepEqual(r.end, { label: "End", position: 2, image: "https://files/end", text: CRUNCH.poses[2].pose });
  });

  it("keeps the texts when there are no frames, and says there are no images", () => {
    const r = referenceOf({ frames: [], poses: CRUNCH.poses });
    assert.equal(r.hasImages, false);
    assert.equal(r.start?.image, null);
    assert.equal(r.start?.text, CRUNCH.poses[0].pose);
    assert.equal(r.end?.text, CRUNCH.poses[2].pose);
  });

  it("has nothing at all for an exercise without frames or texts", () => {
    assert.deepEqual(referenceOf({ frames: [], poses: [] }), { start: null, end: null, hasImages: false });
  });

  it("shows a single frame once, as the start", () => {
    const r = referenceOf({ frames: [{ position: 0, image_url: "a" }], poses: [{ position: 0, pose: "Standing." }] });
    assert.equal(r.start?.image, "a");
    assert.equal(r.end, null);
  });

  it("gives a frame without its own text the nearest text on its side", () => {
    const r = referenceOf({ frames: [{ position: 0, image_url: "a" }, { position: 2, image_url: "b" }], poses: [{ position: 0, pose: "Up." }, { position: 1, pose: "Down." }] });
    assert.equal(r.end?.image, "b");
    assert.equal(r.end?.text, "Down.");
  });

  it("shortens a position text to its first sentence, cutting a long one at a word", () => {
    assert.equal(shortText(CRUNCH.poses[0].pose), "Lying supine on the floor, torso at 0° from horizontal.");
    assert.equal(shortText("Standing tall"), "Standing tall");
    const long = `${"word ".repeat(60)}end.`;
    const s = shortText(long, 80);
    assert.ok(s.length <= 81 && s.endsWith("…") && !s.includes("  "));
  });
});

describe("reference card place", () => {
  it("reads what was stored and falls back to undecided, bottom left, small", () => {
    assert.equal(DEFAULT_REFERENCE_PREFS.open, null);
    assert.deepEqual(parseReferencePrefs(null), DEFAULT_REFERENCE_PREFS);
    assert.deepEqual(parseReferencePrefs("not json"), DEFAULT_REFERENCE_PREFS);
    assert.deepEqual(parseReferencePrefs('{"open":false,"corner":"top-right","large":true}'), { open: false, corner: "top-right", large: true });
    assert.deepEqual(parseReferencePrefs('{"open":"yes","corner":"middle"}'), DEFAULT_REFERENCE_PREFS);
  });

  it("starts open on a wide stage and closed on a narrow one, until the user decides", () => {
    assert.equal(cardOpen(DEFAULT_REFERENCE_PREFS, 860), true);
    assert.equal(cardOpen(DEFAULT_REFERENCE_PREFS, 465), false);
    assert.equal(cardOpen({ ...DEFAULT_REFERENCE_PREFS, open: true }, 465), true);
    assert.equal(cardOpen({ ...DEFAULT_REFERENCE_PREFS, open: false }, 1200), false);
    assert.equal(parseReferencePrefs('{"corner":"top-left"}').open, null);
  });

  it("goes round the corners clockwise and snaps a drop to the nearest corner", () => {
    assert.equal(nextCorner("bottom-left"), "top-left");
    assert.equal(nextCorner("top-left"), "top-right");
    assert.equal(nextCorner("top-right"), "bottom-right");
    assert.equal(nextCorner("bottom-right"), "bottom-left");
    assert.equal(nearestCorner(10, 10, 800, 600), "top-left");
    assert.equal(nearestCorner(790, 10, 800, 600), "top-right");
    assert.equal(nearestCorner(790, 590, 800, 600), "bottom-right");
    assert.equal(nearestCorner(10, 590, 800, 600), "bottom-left");
  });
});

describe("reference card size", () => {
  it("shows the frames at the chosen size with every part when there is room", () => {
    const small = cardLayout(600, false, true);
    assert.deepEqual(small, { tile: TILE_PX.small, width: cardMaxWidth(false), subtitle: true, captions: true });
    assert.equal(cardLayout(800, true, true).tile, TILE_PX.large);
  });

  it("drops the subtitle, then the captions, before the frames get small", () => {
    const tight = cardLayout(240, false, true);
    assert.equal(tight.subtitle, false);
    assert.ok(tight.tile >= TILE_PX.min);
    const tighter = cardLayout(190, false, true);
    assert.equal(tighter.captions, false);
    assert.ok(tighter.tile >= TILE_PX.min);
  });

  it("never draws frames smaller than the floor, and has no footer without texts", () => {
    assert.equal(cardLayout(40, false, true).tile, TILE_PX.floor);
    assert.ok(cardLayout(200, false, false).tile > cardLayout(200, false, true).tile - 1);
  });
});
