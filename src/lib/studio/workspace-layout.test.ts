import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LAYOUT_TOKENS,
  arrangeIn,
  defaultLayout,
  dragResult,
  fitSidePanes,
  floatingSize,
  initialSize,
  maxSizeNow,
  parseStoredLayout,
  readLayoutJson,
  scaledSize,
  separatorKey,
  serializeLayout,
} from "./workspace-layout.ts";

const { panes, stageMinWidth } = LAYOUT_TOKENS;
/** The defaults as storage gives them back: nobody arranged them, so no window width. */
const unarranged = (windowWidth?: number) => ({ ...defaultLayout(windowWidth), at: null });

describe("stored layout", () => {
  it("round-trips through storage", () => {
    const layout = { left: { size: 300, collapsed: true }, right: { size: 420, collapsed: false }, dock: { size: 200, collapsed: false }, at: 1440 };
    assert.deepEqual(readLayoutJson(serializeLayout(layout)), layout);
  });

  it("reads a layout saved without the window it was arranged in", () => {
    const layout = parseStoredLayout({ v: 1, left: { size: 300, collapsed: false }, right: { size: 400, collapsed: false }, dock: { size: 200, collapsed: false } });
    assert.equal(layout.at, null);
    assert.equal(layout.left.size, 300);
    assert.equal(parseStoredLayout({ v: 1, at: "wide" }).at, null);
    assert.equal(parseStoredLayout({ v: 1, at: -5 }).at, null);
  });

  it("falls back to the defaults when absent, broken or from another version", () => {
    assert.deepEqual(readLayoutJson(null), unarranged());
    assert.deepEqual(readLayoutJson("{not json"), unarranged());
    assert.deepEqual(readLayoutJson(JSON.stringify({ v: 99, left: { size: 300, collapsed: true } })), unarranged());
    assert.deepEqual(parseStoredLayout("left"), unarranged());
  });

  it("repairs field by field and clamps sizes to the limits", () => {
    const layout = parseStoredLayout({ v: 1, left: { size: 10_000, collapsed: "yes" }, right: { size: Number.NaN, collapsed: true }, dock: null });
    assert.equal(layout.left.size, panes.left.max);
    assert.equal(layout.left.collapsed, false);
    assert.equal(layout.right.size, panes.right.initial);
    assert.equal(layout.right.collapsed, true);
    assert.deepEqual(layout.dock, defaultLayout().dock);
  });
});

describe("first-time sizes", () => {
  it("scale with the window so the stage keeps most of the room", () => {
    for (const w of [1024, 1280, 1440, 1920, 2560]) {
      const d = defaultLayout(w);
      assert.ok(d.left.size >= panes.left.min && d.left.size <= panes.left.max, `left at ${w}`);
      assert.ok(d.right.size >= panes.right.min && d.right.size <= panes.right.max, `right at ${w}`);
      assert.ok((w - d.left.size - d.right.size) / w >= 0.45, `stage share at ${w}`);
    }
    assert.ok((1920 - defaultLayout(1920).left.size - defaultLayout(1920).right.size) / 1920 >= 0.6);
  });

  it("never grow past their cap on very wide screens", () => {
    assert.equal(initialSize("left", 5000), panes.left.initialMax);
    assert.equal(initialSize("right", 5000), panes.right.initialMax);
  });

  it("fall back to the fixed size when the window width is unknown", () => {
    assert.equal(initialSize("left"), panes.left.initial);
    assert.equal(initialSize("right", Number.NaN), panes.right.initial);
    assert.equal(initialSize("dock", 1440), panes.dock.initial);
  });

  it("are used when nothing valid is stored", () => {
    assert.deepEqual(readLayoutJson(null, 1280), unarranged(1280));
    assert.deepEqual(readLayoutJson("{not json", 1920), unarranged(1920));
    assert.equal(parseStoredLayout({ v: 1, left: { size: 300, collapsed: false } }, 1280).right.size, initialSize("right", 1280));
  });
});

describe("fitting the side panes", () => {
  const open = (size: number) => ({ size, collapsed: false });

  it("keeps the chosen widths when the window has room", () => {
    assert.deepEqual(fitSidePanes(1920, open(300), open(400)), { left: 300, right: 400 });
  });

  it("gives a collapsed pane no width", () => {
    assert.deepEqual(fitSidePanes(1280, { size: 300, collapsed: true }, open(400)), { left: 0, right: 400 });
  });

  it("shrinks both panes so the stage keeps its minimum width", () => {
    const fit = fitSidePanes(1024, open(panes.left.initial), open(panes.right.initial));
    assert.ok(1024 - fit.left - fit.right >= stageMinWidth - 1);
    assert.ok(fit.left >= panes.left.min && fit.right >= panes.right.min);
  });

  it("never goes below the minimums, even when the window is too small", () => {
    assert.deepEqual(fitSidePanes(700, open(400), open(500)), { left: panes.left.min, right: panes.right.min });
  });
});

describe("a layout arranged in a larger window", () => {
  const open = (size: number) => ({ size, collapsed: false });
  // Arranged at 1440: catalog 368, inspector 418, so the stage had 654 px (45%).
  const left = open(368);
  const right = open(418);
  const share = (w: number) => {
    const fit = fitSidePanes(w, left, right, 1440);
    return (w - fit.left - fit.right) / w;
  };

  it("keeps its sizes in that window and in wider ones", () => {
    assert.deepEqual(fitSidePanes(1440, left, right, 1440), { left: 368, right: 418 });
    assert.deepEqual(fitSidePanes(1920, left, right, 1440), { left: 368, right: 418 });
  });

  it("scales a pane with the window, never below its minimum", () => {
    assert.equal(scaledSize("left", 368, 1440, 1280), Math.round((368 * 1280) / 1440));
    assert.equal(scaledSize("left", 368, 1440, 1920), 368);
    assert.equal(scaledSize("right", 418, 1440, 800), panes.right.min);
    assert.equal(scaledSize("left", 368, null, 800), 368);
  });

  it("gives the stage half of a smaller window, where the minimums allow", () => {
    const fit = fitSidePanes(1280, left, right, 1440);
    assert.equal(1280 - fit.left - fit.right, 640);
    assert.ok(fit.left >= panes.left.min && fit.left < 368);
    assert.ok(fit.right >= panes.right.min && fit.right < 418);
    assert.deepEqual(fitSidePanes(1024, left, right, 1440), { left: panes.left.min, right: panes.right.min });
  });

  it("never lets the stage lose share as the window shrinks, without a jump", () => {
    let previous = share(1440);
    let previousStage = 1440 - 368 - 418;
    for (let w = 1439; w >= 1100; w--) {
      const now = share(w);
      const stage = Math.round(now * w);
      assert.ok(now >= previous - 0.001, `share at ${w}`);
      assert.ok(Math.abs(stage - previousStage) <= 2, `stage jumps at ${w}`);
      previous = now;
      previousStage = stage;
    }
  });

  it("keeps the share of a stage that already had most of the room", () => {
    const fit = fitSidePanes(1280, open(300), open(360), 1920);
    assert.deepEqual(fit, { left: panes.left.min, right: panes.right.min });
    const wide = fitSidePanes(1600, open(400), open(480), 1920);
    assert.deepEqual(wide, { left: Math.round((400 * 1600) / 1920), right: 400 });
  });

  it("is taken as arranged in the smaller window once a pane is resized there", () => {
    const here = arrangeIn({ left, right, dock: open(220), at: 1440 }, 1280);
    const fit = fitSidePanes(1280, left, right, 1440);
    assert.equal(here.at, 1280);
    assert.deepEqual([here.left.size, here.right.size], [fit.left, fit.right]);
    // What shows does not move, and from there a drag is free down to the stage minimum.
    assert.deepEqual(fitSidePanes(1280, here.left, here.right, here.at), fit);
    assert.deepEqual(fitSidePanes(1280, here.left, { ...here.right, size: here.right.size + 50 }, here.at), { left: fit.left, right: fit.right + 50 });
  });

  it("keeps a collapsed pane collapsed and scales the width it reopens at", () => {
    const here = arrangeIn({ left: { size: 368, collapsed: true }, right, dock: open(220), at: 1440 }, 1280);
    assert.equal(here.left.collapsed, true);
    assert.equal(here.left.size, scaledSize("left", 368, 1440, 1280));
    assert.equal(arrangeIn({ left, right, dock: open(220), at: 1280 }, 1920).left.size, 368);
  });
});

describe("drag limits", () => {
  it("leaves the stage its minimum next to the other pane", () => {
    assert.equal(maxSizeNow("left", 1280, 380, false), 1280 - 380 - stageMinWidth);
  });

  it("caps at the pane maximum on a wide window", () => {
    assert.equal(maxSizeNow("right", 2560, 288, false), panes.right.max);
  });

  it("floating panes leave a gutter of the stage", () => {
    assert.equal(floatingSize("right", 600, 500), 500 - LAYOUT_TOKENS.overlayGutter);
    assert.equal(floatingSize("left", 288, 800), 288);
  });
});

describe("separator keyboard", () => {
  const limits = { min: 200, max: 500 };

  it("grows with the pane's own arrow and shrinks with the opposite one", () => {
    assert.deepEqual(separatorKey("ArrowLeft", false, 300, limits, "ArrowLeft"), { type: "size", size: 300 + LAYOUT_TOKENS.keyStep });
    assert.deepEqual(separatorKey("ArrowRight", true, 300, limits, "ArrowLeft"), { type: "size", size: 300 - LAYOUT_TOKENS.keyStepLarge });
  });

  it("clamps, jumps with Home / End and toggles with Enter", () => {
    assert.deepEqual(separatorKey("ArrowRight", true, 490, limits, "ArrowRight"), { type: "size", size: 500 });
    assert.deepEqual(separatorKey("Home", false, 300, limits, "ArrowRight"), { type: "size", size: 200 });
    assert.deepEqual(separatorKey("End", false, 300, limits, "ArrowRight"), { type: "size", size: 500 });
    assert.deepEqual(separatorKey("Enter", false, 300, limits, "ArrowRight"), { type: "toggle" });
    assert.equal(separatorKey("a", false, 300, limits, "ArrowRight"), null);
  });
});

describe("end of a drag", () => {
  const limits = { min: 200, max: 500 };

  it("clamps a normal drag", () => {
    assert.deepEqual(dragResult(650, 300, limits), { size: 500, collapsed: false });
    assert.deepEqual(dragResult(180, 300, limits), { size: 200, collapsed: false });
  });

  it("collapses a pane dragged well below its minimum and keeps its size to reopen", () => {
    assert.deepEqual(dragResult(20, 320, limits), { size: 320, collapsed: true });
  });
});
