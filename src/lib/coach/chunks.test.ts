import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  blocksOf,
  chunksFromMarkdown,
  convertBody,
  emptyBody,
  lintBody,
  normalizeBody,
  sameBody,
  serializeBody,
  serializeChunks,
  type ChunkBody,
} from "./chunks.ts";
import { parseMarkdown } from "./markdown.ts";

const roundTrip = (source: string) => serializeChunks(chunksFromMarkdown(source));

/** Every construct the app parses, written the way the editor writes it back. */
const CANONICAL = [
  "# Title",
  "## Sub **bold** *it* `code` [l](https://x)",
  "### Deep",
  "A paragraph\nwith a soft break",
  "- one\n- two\n  - nested\n    - deeper",
  "1. first\n2. second",
  "---",
  "![Squat depth](https://h/v1/files/11111111-1111-4111-8111-111111111111)",
  "```\n# not a heading\n\nkeeps blank lines\n```",
  "![pending](pending:abc)",
  "| a | b |\n|---|---|",
  "<b>html</b> and > quote",
  "Last paragraph.",
].join("\n\n");

describe("markdown → chunks → markdown", () => {
  it("is stable for every supported construct", () => {
    assert.equal(roundTrip(CANONICAL), CANONICAL);
  });

  it("renders the same blocks as the original for any input", () => {
    const sources = [
      CANONICAL,
      "* star bullet\n+ plus is text\n1) paren number",
      "- a\n\n- b\n\n\n- c",
      "Title\n---\ntext",
      "## Heading ##\n#### deep heading",
      "```\nstill streaming",
      "see ![inline](https://x/a.png) now\n  ![own line](https://x/b.png)  ",
      "__under__ _it_ snake_case a * b **open",
      "   # indented heading\n  text with lead",
    ];
    for (const source of sources) {
      const once = roundTrip(source);
      assert.deepEqual(parseMarkdown(once), parseMarkdown(source), source);
      assert.equal(roundTrip(once), once, source);
    }
  });

  it("keeps the author's inline markup as written", () => {
    const [body] = chunksFromMarkdown("__bold__ and _it_ and `c`");
    assert.deepEqual(body, { kind: "paragraph", text: "__bold__ and _it_ and `c`" });
  });

  it("maps every block type to a body and back", () => {
    assert.deepEqual(chunksFromMarkdown("## T\n- x\n2. y\n---\n![a](u)\n```\nc\n```\np"), [
      { kind: "heading", level: 2, text: "T" },
      { kind: "bullet", indent: 0, text: "x" },
      { kind: "numbered", number: 2, text: "y" },
      { kind: "rule" },
      { kind: "image", alt: "a", url: "u" },
      { kind: "code", code: "c" },
      { kind: "paragraph", text: "p" },
    ]);
  });

  it("joins one list on consecutive lines and everything else with a blank line", () => {
    const bodies: ChunkBody[] = [
      { kind: "bullet", indent: 0, text: "a" },
      { kind: "numbered", number: 1, text: "b" },
      { kind: "paragraph", text: "c" },
      { kind: "paragraph", text: "" },
      { kind: "paragraph", text: "   " },
      { kind: "rule" },
    ];
    assert.equal(serializeChunks(bodies), "- a\n\n1. b\n\nc\n\n---");
  });

  it("serializes each body in the form the parser reads back", () => {
    assert.equal(serializeBody({ kind: "heading", level: 3, text: "H" }), "### H");
    assert.equal(serializeBody({ kind: "bullet", indent: 2, text: "b" }), "    - b");
    assert.equal(serializeBody({ kind: "numbered", number: 12, text: "n" }), "12. n");
    assert.equal(serializeBody({ kind: "image", alt: "a[b]", url: "u" }), "![a b](u)");
    assert.equal(serializeBody({ kind: "code", code: "x\ny" }), "```\nx\ny\n```");
  });
});

describe("bodies", () => {
  it("renders what the app draws, not the raw text", () => {
    assert.deepEqual(blocksOf({ kind: "heading", level: 1, text: "Title ##" }), [
      { type: "heading", level: 1, inlines: [{ type: "text", value: "Title" }] },
    ]);
    assert.deepEqual(blocksOf({ kind: "paragraph", text: "" }), []);
  });

  it("normalizes text the parser would split, and leaves plain typing alone", () => {
    assert.deepEqual(normalizeBody({ kind: "paragraph", text: "- item" }), [{ kind: "bullet", indent: 0, text: "item" }]);
    assert.deepEqual(normalizeBody({ kind: "paragraph", text: "intro\n\n## Next" }), [
      { kind: "paragraph", text: "intro" },
      { kind: "heading", level: 2, text: "Next" },
    ]);
    assert.deepEqual(normalizeBody({ kind: "heading", level: 1, text: "a\nb" }), [
      { kind: "heading", level: 1, text: "a" },
      { kind: "paragraph", text: "b" },
    ]);
    assert.deepEqual(normalizeBody({ kind: "paragraph", text: "typing " }), [{ kind: "paragraph", text: "typing" }]);
    assert.deepEqual(normalizeBody({ kind: "paragraph", text: "  " }), [{ kind: "paragraph", text: "  " }]);
    assert.deepEqual(normalizeBody({ kind: "code", code: "a\n```\nb" }), [
      { kind: "code", code: "a" },
      { kind: "paragraph", text: "b" },
      { kind: "code", code: "" },
    ]);
    assert.deepEqual(normalizeBody({ kind: "image", alt: "- x", url: "u" }), [{ kind: "image", alt: "- x", url: "u" }]);
  });

  it("converts kinds keeping the text and continuing lists", () => {
    const previous: ChunkBody = { kind: "numbered", number: 3, text: "p" };
    assert.deepEqual(convertBody({ kind: "paragraph", text: "t" }, "numbered", previous), { kind: "numbered", number: 4, text: "t" });
    assert.deepEqual(convertBody({ kind: "code", code: "c" }, "paragraph"), { kind: "paragraph", text: "c" });
    assert.deepEqual(convertBody({ kind: "image", alt: "alt", url: "u" }, "heading"), { kind: "heading", level: 2, text: "alt" });
    assert.deepEqual(convertBody({ kind: "paragraph", text: "t" }, "rule"), { kind: "rule" });
    assert.deepEqual(emptyBody("bullet"), { kind: "bullet", indent: 0, text: "" });
  });

  it("lints a text body with the markdown lint and compares by serialization", () => {
    assert.deepEqual(lintBody({ kind: "paragraph", text: "| a | b |" }).map((w) => w.rule), ["table"]);
    assert.deepEqual(lintBody({ kind: "image", alt: "| a |", url: "u" }), []);
    assert.equal(sameBody({ kind: "paragraph", text: "x" }, { kind: "paragraph", text: "x" }), true);
    assert.equal(sameBody({ kind: "paragraph", text: "x" }, { kind: "heading", level: 1, text: "x" }), false);
    assert.equal(sameBody(undefined, undefined), true);
  });
});
