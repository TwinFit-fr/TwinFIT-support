import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fileProxyHeaders,
  imageUploadProblem,
  isStorageFileId,
  sniffImageType,
  withImageExtension,
} from "./image-type.ts";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const WEBP = new Uint8Array([...Buffer.from("RIFF"), 0x24, 0, 0, 0, ...Buffer.from("WEBPVP8 ")]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const HTML = Buffer.from("<!doctype html><script>fetch('/x')</script>");
const RIFF_WAVE = new Uint8Array([...Buffer.from("RIFF"), 0x24, 0, 0, 0, ...Buffer.from("WAVEfmt ")]);

describe("sniffImageType", () => {
  it("recognises PNG, JPEG and WebP from their magic bytes", () => {
    assert.equal(sniffImageType(PNG), "image/png");
    assert.equal(sniffImageType(JPEG), "image/jpeg");
    assert.equal(sniffImageType(WEBP), "image/webp");
  });

  it("refuses SVG, HTML, other RIFF files, GIF and truncated files", () => {
    assert.equal(sniffImageType(SVG), null);
    assert.equal(sniffImageType(HTML), null);
    assert.equal(sniffImageType(RIFF_WAVE), null);
    assert.equal(sniffImageType(Buffer.from("GIF89a")), null);
    assert.equal(sniffImageType(PNG.subarray(0, 4)), null);
    assert.equal(sniffImageType(new Uint8Array()), null);
  });
});

describe("imageUploadProblem", () => {
  it("accepts an allowed image whose bytes match the declared type", () => {
    assert.equal(imageUploadProblem(PNG, "image/png", 1024), null);
    assert.equal(imageUploadProblem(WEBP, "image/webp", 1024), null);
    assert.equal(imageUploadProblem(JPEG, "image/jpeg", 1024), null);
  });

  it("refuses SVG and HTML whatever type the client declares", () => {
    assert.match(imageUploadProblem(SVG, "image/svg+xml", 1024) ?? "", /Only PNG, WebP and JPEG/);
    assert.match(imageUploadProblem(HTML, "text/html", 1024) ?? "", /Only PNG, WebP and JPEG/);
    assert.match(imageUploadProblem(SVG, "image/png", 1024) ?? "", /not a PNG, WebP or JPEG/);
    assert.match(imageUploadProblem(HTML, "image/jpeg", 1024) ?? "", /not a PNG, WebP or JPEG/);
  });

  it("refuses a mismatched type, an empty file and a file over the limit", () => {
    assert.match(imageUploadProblem(JPEG, "image/png", 1024) ?? "", /content is image\/jpeg, not image\/png/);
    assert.match(imageUploadProblem(new Uint8Array(), "image/png", 1024) ?? "", /empty/);
    assert.match(imageUploadProblem(PNG, "image/png", 4) ?? "", /must be under/);
  });
});

describe("withImageExtension", () => {
  it("gives the stored name the extension of the real type", () => {
    assert.equal(withImageExtension("evil.svg", "image/png"), "evil.png");
    assert.equal(withImageExtension("page.html", "image/jpeg"), "page.jpg");
    assert.equal(withImageExtension("photo.JPEG", "image/jpeg"), "photo.JPEG");
    assert.equal(withImageExtension("squat.webp", "image/webp"), "squat.webp");
    assert.equal(withImageExtension("image", "image/png"), "image.png");
    assert.equal(withImageExtension(".hidden", "image/png"), ".hidden.png");
  });
});

describe("file proxy", () => {
  it("only accepts UUID file ids", () => {
    assert.equal(isStorageFileId("3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e"), true);
    assert.equal(isStorageFileId("../../v1/version"), false);
    assert.equal(isStorageFileId("3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e/x"), false);
    assert.equal(isStorageFileId(""), false);
  });

  it("serves images typed, unsniffable, sandboxed and same-origin only", () => {
    const headers = fileProxyHeaders("3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e", "image/webp");
    assert.equal(headers["Content-Type"], "image/webp");
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.equal(
      headers["Content-Disposition"],
      'inline; filename="3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e.webp"',
    );
    assert.match(headers["Content-Security-Policy"], /default-src 'none'/);
    assert.match(headers["Content-Security-Policy"], /\bsandbox\b/);
    assert.equal(headers["Cross-Origin-Resource-Policy"], "same-origin");
  });
});
