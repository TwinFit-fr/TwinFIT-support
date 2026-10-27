import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findImages,
  insertBlockAt,
  lintMarkdown,
  parseInline,
  parseMarkdown,
  removeImage,
  replaceImage,
} from "./markdown.ts";

describe("parseMarkdown (port of CoachMarkdownParser.kt)", () => {
  it("splits paragraphs on blank lines and keeps single newlines inside one", () => {
    const blocks = parseMarkdown("line one\nline two\n\nsecond");
    assert.equal(blocks.length, 2);
    assert.deepEqual(blocks[0], { type: "paragraph", inlines: [{ type: "text", value: "line one\nline two" }] });
  });

  it("parses headings up to ### and leaves #### as text", () => {
    assert.deepEqual(parseMarkdown("## Title ##")[0], {
      type: "heading",
      level: 2,
      inlines: [{ type: "text", value: "Title" }],
    });
    assert.equal(parseMarkdown("#### Deep")[0].type, "paragraph");
  });

  it("parses bullets with two-space indents and numbered items", () => {
    const blocks = parseMarkdown("- a\n    * b\n2) c");
    assert.deepEqual(blocks[0], { type: "bullet", indent: 0, inlines: [{ type: "text", value: "a" }] });
    assert.deepEqual(blocks[1], { type: "bullet", indent: 2, inlines: [{ type: "text", value: "b" }] });
    assert.deepEqual(blocks[2], { type: "numbered", number: 2, inlines: [{ type: "text", value: "c" }] });
  });

  it("treats a dashed line as a rule, not a bullet or setext underline", () => {
    assert.deepEqual(parseMarkdown("- - -"), [{ type: "rule" }]);
    assert.deepEqual(parseMarkdown("Title\n---").map((b) => b.type), ["paragraph", "rule"]);
  });

  it("keeps fenced code verbatim and closes an unterminated fence", () => {
    assert.deepEqual(parseMarkdown("```\n# not a heading\n```"), [{ type: "code", code: "# not a heading" }]);
    assert.deepEqual(parseMarkdown("```\nstill"), [{ type: "code", code: "still" }]);
  });

  it("does not parse tables or HTML: they stay one literal paragraph", () => {
    const blocks = parseMarkdown("| a | b |\n|---|---|\n<b>x</b>");
    assert.equal(blocks.length, 1);
    assert.deepEqual(blocks[0], {
      type: "paragraph",
      inlines: [{ type: "text", value: "| a | b |\n|---|---|\n<b>x</b>" }],
    });
  });
});

describe("parseInline", () => {
  it("parses bold, italic, code and links", () => {
    assert.deepEqual(parseInline("**b** *i* `c` [l](u)"), [
      { type: "bold", value: "b" },
      { type: "text", value: " " },
      { type: "italic", value: "i" },
      { type: "text", value: " " },
      { type: "code", value: "c" },
      { type: "text", value: " " },
      { type: "link", label: "l", url: "u" },
    ]);
  });

  it("leaves half-written markup literal", () => {
    assert.deepEqual(parseInline("**open"), [{ type: "text", value: "**open" }]);
    assert.deepEqual(parseInline("a * b"), [{ type: "text", value: "a * b" }]);
    assert.deepEqual(parseInline("snake_case_name"), [{ type: "text", value: "snake_case_name" }]);
  });

  it("renders an image as a bang followed by a link, like the app", () => {
    assert.deepEqual(parseInline("![alt](https://x/y.png)"), [
      { type: "text", value: "!" },
      { type: "link", label: "alt", url: "https://x/y.png" },
    ]);
  });
});

describe("lintMarkdown", () => {
  const rulesOf = (source: string) => lintMarkdown(source).map((w) => w.rule);

  it("is silent on the supported subset", () => {
    assert.deepEqual(
      rulesOf("# H\n\n- a\n- b\n\n1. one\n\n**bold** *it* `code` [l](https://x)\n\n---\n\n```\nx | y\n```"),
      [],
    );
  });

  it("flags markup the app renders differently", () => {
    assert.deepEqual(rulesOf("![a](b)"), ["image"]);
    assert.deepEqual(rulesOf("| a | b |"), ["table"]);
    assert.deepEqual(rulesOf("<br>"), ["html"]);
    assert.deepEqual(rulesOf("#### deep"), ["heading-level"]);
    assert.deepEqual(rulesOf("> quote"), ["blockquote"]);
    assert.deepEqual(rulesOf("- [ ] task"), ["task-list"]);
    assert.deepEqual(rulesOf("Title\n===="), ["setext-heading"]);
    assert.deepEqual(rulesOf("***both***"), ["nested-emphasis"]);
    assert.deepEqual(rulesOf("~~gone~~"), ["strikethrough"]);
    assert.deepEqual(rulesOf("[a][ref]"), ["reference-link"]);
    assert.deepEqual(rulesOf("not \\*bold\\*"), ["escape"]);
    assert.deepEqual(rulesOf('[a](https://x "title")'), ["link-title"]);
    assert.deepEqual(rulesOf("  1. nested"), ["indented-numbered"]);
  });

  it("reports the 1-based line and ignores fenced code", () => {
    const warnings = lintMarkdown("ok\n```\n| not | a table |\n```\n<b>");
    assert.deepEqual(
      warnings.map((w) => [w.line, w.rule]),
      [[5, "html"]],
    );
  });
});

describe("images", () => {
  const source = "intro\n\n![one](pending:abc)\n\ntext ![two](https://h/v1/files/x) end";

  it("finds every image with its offsets", () => {
    const images = findImages(source);
    assert.deepEqual(images.map((i) => [i.alt, i.url]), [
      ["one", "pending:abc"],
      ["two", "https://h/v1/files/x"],
    ]);
    assert.equal(source.slice(images[0].start, images[0].end), "![one](pending:abc)");
  });

  it("replaces alt or url in place", () => {
    const [first] = findImages(source);
    assert.equal(replaceImage(source, first, { url: "https://h/v1/files/y" }).includes("![one](https://h/v1/files/y)"), true);
    assert.equal(replaceImage(source, first, { alt: "re[named]" }).includes("![re named](pending:abc)"), true);
  });

  it("removes an image and the blank line it leaves", () => {
    const [first] = findImages(source);
    assert.equal(removeImage(source, first), "intro\n\ntext ![two](https://h/v1/files/x) end");
  });

  it("inserts a block on its own paragraph at the cursor", () => {
    assert.deepEqual(insertBlockAt("ab", 1, 1, "X"), { text: "a\n\nX\n\nb", caret: 6 });
    assert.deepEqual(insertBlockAt("", 0, 0, "X"), { text: "X\n", caret: 2 });
    assert.deepEqual(insertBlockAt("a\n\n", 3, 3, "X"), { text: "a\n\nX\n", caret: 5 });
  });
});
