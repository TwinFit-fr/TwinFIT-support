import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findImages,
  insertBlockAt,
  isAllowedImageUrl,
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

  it("turns an image inside text into a link to it, like the app", () => {
    assert.deepEqual(parseInline("see ![alt](https://x/y.png) now"), [
      { type: "text", value: "see " },
      { type: "link", label: "alt", url: "https://x/y.png" },
      { type: "text", value: " now" },
    ]);
    assert.deepEqual(parseInline("![](https://x/y.png)"), [
      { type: "link", label: "https://x/y.png", url: "https://x/y.png" },
    ]);
    assert.deepEqual(parseInline("Wow! [no link"), [{ type: "text", value: "Wow! [no link" }]);
  });
});

describe("images in the parser", () => {
  it("makes an image on its own line a block", () => {
    assert.deepEqual(parseMarkdown("Intro\n  ![Squat depth](https://h/v1/files/1)  \nAfter"), [
      { type: "paragraph", inlines: [{ type: "text", value: "Intro" }] },
      { type: "image", alt: "Squat depth", url: "https://h/v1/files/1" },
      { type: "paragraph", inlines: [{ type: "text", value: "After" }] },
    ]);
  });

  it("leaves an unfinished image literal while streaming", () => {
    assert.deepEqual(parseMarkdown("![alt](https://h/a"), [
      { type: "paragraph", inlines: [{ type: "text", value: "![alt](https://h/a" }] },
    ]);
  });

  it("allows https images on the listed hosts only", () => {
    const hosts = ["abc.storage.eu-central-1.nhost.run"];
    assert.equal(isAllowedImageUrl("https://abc.storage.eu-central-1.nhost.run/v1/files/1", hosts), true);
    assert.equal(isAllowedImageUrl("HTTPS://ABC.storage.eu-central-1.nhost.run/v1/files/1", hosts), true);
    assert.equal(isAllowedImageUrl("https://abc.storage.eu-central-1.nhost.run:443/v1/files/1", hosts), true);
    assert.equal(isAllowedImageUrl("http://abc.storage.eu-central-1.nhost.run/v1/files/1", hosts), false);
    assert.equal(isAllowedImageUrl("https://evil.example/abc.storage.eu-central-1.nhost.run", hosts), false);
    assert.equal(isAllowedImageUrl("https://abc.storage.eu-central-1.nhost.run.evil.example/x", hosts), false);
    assert.equal(isAllowedImageUrl("https://user@abc.storage.eu-central-1.nhost.run/x", hosts), false);
    assert.equal(isAllowedImageUrl("https://abc.storage.eu-central-1.nhost.run/x", []), false);
  });
});

describe("lintMarkdown", () => {
  const rulesOf = (source: string) => lintMarkdown(source).map((w) => w.rule);

  it("is silent on the supported subset", () => {
    assert.deepEqual(
      rulesOf("# H\n\n- a\n- b\n\n1. one\n\n**bold** *it* `code` [l](https://x)\n\n![pic](https://x/p.png)\n\n---\n\n```\nx | y\n```"),
      [],
    );
  });

  it("flags markup the app renders differently", () => {
    assert.deepEqual(rulesOf("text ![a](b)"), ["inline-image"]);
    assert.deepEqual(rulesOf("- ![a](b)"), ["inline-image"]);
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
