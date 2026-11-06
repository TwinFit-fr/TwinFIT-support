import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { flipImage } from "./flip.ts";

type Rgba = { r: number; g: number; b: number; alpha: number };

const RED: Rgba = { r: 255, g: 0, b: 0, alpha: 1 };
const BLUE: Rgba = { r: 0, g: 0, b: 255, alpha: 1 };

/** 8×8 image: red on the left half, blue on the right half. */
function halves(left: Rgba, right: Rgba) {
  return sharp({ create: { width: 8, height: 8, channels: 4, background: right } }).composite([
    {
      input: { create: { width: 4, height: 8, channels: 4, background: left } },
      left: 0,
      top: 0,
    },
  ]);
}

async function pixel(bytes: Buffer, x: number) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (4 * info.width + x) * info.channels;
  return [...data.subarray(at, at + 4)];
}

describe("flipImage", () => {
  it("mirrors left to right and keeps the format", async () => {
    const input = await halves(RED, BLUE).png().toBuffer();
    const { bytes, mimeType } = await flipImage(input);
    assert.equal(mimeType, "image/png");
    assert.deepEqual(await pixel(bytes, 0), [0, 0, 255, 255]);
    assert.deepEqual(await pixel(bytes, 7), [255, 0, 0, 255]);
  });

  it("keeps transparency", async () => {
    const input = await halves(RED, { r: 0, g: 0, b: 0, alpha: 0 }).png().toBuffer();
    const { bytes } = await flipImage(input);
    assert.equal((await pixel(bytes, 0))[3], 0);
    assert.equal((await pixel(bytes, 7))[3], 255);
  });

  it("restores the image when flipped twice", async () => {
    const input = await halves(RED, BLUE).png().toBuffer();
    const twice = await flipImage((await flipImage(input)).bytes);
    assert.deepEqual(await pixel(twice.bytes, 0), await pixel(input, 0));
  });

  it("keeps webp as webp", async () => {
    const input = await halves(RED, BLUE).webp({ lossless: true }).toBuffer();
    const { bytes, mimeType } = await flipImage(input);
    assert.equal(mimeType, "image/webp");
    assert.equal((await sharp(bytes).metadata()).format, "webp");
  });

  it("refuses a format the asset routes do not accept", async () => {
    const input = await halves(RED, BLUE).gif().toBuffer();
    await assert.rejects(flipImage(input), /Cannot flip a gif image/);
  });
});
