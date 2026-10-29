/**
 * The markdown subset the Android app renders in Coach answers, ported from
 * TwinFIT-UI `feature/coach/CoachMarkdownParser.kt`. Keep the two in sync: this file is what the
 * phone preview renders, so a divergence here shows staff something the app will not draw.
 *
 * Supported: paragraphs, `#`–`###` headings, `-` / `*` bullets (indent by two spaces), `1.`
 * numbered items, fenced code, rules, `![alt](url)` images on a line of their own, and inline
 * `**bold**`, `*italic*`, `` `code` `` and `[text](url)`. An image inside a line of text renders as
 * a link to it. Everything else is literal text.
 */

export type MdInline =
  | { type: "text"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; label: string; url: string };

export type MdBlock =
  | { type: "paragraph"; inlines: MdInline[] }
  | { type: "heading"; level: number; inlines: MdInline[] }
  | { type: "bullet"; indent: number; inlines: MdInline[] }
  | { type: "numbered"; number: number; inlines: MdInline[] }
  | { type: "code"; code: string }
  | { type: "rule" }
  | { type: "image"; alt: string; url: string };

const imageLinePattern = /^\s*!\[([^\]\n]*)\]\(([^)\s]+)\)\s*$/;
const bulletPattern = /^(\s*)([-*•])\s+(.*)$/;
const numberedPattern = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const headingPattern = /^\s{0,3}(#{1,3})\s+(.*?)\s*#*\s*$/;
const rulePattern = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;

/**
 * A parsed block with the source text it was built from: the inline markup of a text block (as the
 * person wrote it), the body of a code block, or "" for rules and images. The chunk editor keeps
 * this text so a round trip through the editor preserves the author's markup.
 */
export type MdBlockSource = { block: MdBlock; text: string };

export function parseMarkdown(source: string): MdBlock[] {
  return parseBlocks(source).map((entry) => entry.block);
}

export function parseBlocks(source: string): MdBlockSource[] {
  const blocks: MdBlockSource[] = [];
  let paragraph: string[] = [];
  let code: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      const text = paragraph.join("\n");
      blocks.push({ block: { type: "paragraph", inlines: parseInline(text) }, text });
      paragraph = [];
    }
  };
  const flushCode = (lines: string[]) => {
    const text = lines.join("\n");
    blocks.push({ block: { type: "code", code: text }, text });
  };

  for (const line of source.replace(/\r\n/g, "\n").split("\n")) {
    if (code !== null) {
      if (line.trimStart().startsWith("```")) {
        flushCode(code);
        code = null;
      } else {
        code.push(line);
      }
      continue;
    }
    let match: RegExpMatchArray | null;
    if (line.trimStart().startsWith("```")) {
      flushParagraph();
      code = [];
    } else if (line.trim() === "") {
      flushParagraph();
    } else if ((match = line.match(imageLinePattern))) {
      flushParagraph();
      blocks.push({ block: { type: "image", alt: match[1].trim(), url: match[2] }, text: "" });
    } else if (rulePattern.test(line)) {
      flushParagraph();
      blocks.push({ block: { type: "rule" }, text: "" });
    } else if ((match = line.match(headingPattern))) {
      flushParagraph();
      blocks.push({
        block: { type: "heading", level: match[1].length, inlines: parseInline(match[2]) },
        text: match[2],
      });
    } else if ((match = line.match(bulletPattern))) {
      flushParagraph();
      blocks.push({
        block: { type: "bullet", indent: Math.floor(match[1].length / 2), inlines: parseInline(match[3]) },
        text: match[3],
      });
    } else if ((match = line.match(numberedPattern))) {
      flushParagraph();
      blocks.push({
        block: { type: "numbered", number: Number(match[1]), inlines: parseInline(match[2]) },
        text: match[2],
      });
    } else {
      paragraph.push(line.trimEnd());
    }
  }
  // An unterminated fence (the answer is still streaming) is shown as code so far.
  if (code !== null) flushCode(code);
  flushParagraph();
  return blocks;
}

const isWhitespace = (c: string | undefined) => c !== undefined && /\s/.test(c);
const isLetterOrDigit = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);

export function parseInline(source: string): MdInline[] {
  const out: MdInline[] = [];
  let text = "";

  const flushText = () => {
    if (text.length > 0) {
      out.push({ type: "text", value: text });
      text = "";
    }
  };

  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "`") {
      const end = source.indexOf("`", i + 1);
      if (end > i + 1) {
        flushText();
        out.push({ type: "code", value: source.substring(i + 1, end) });
        i = end + 1;
      } else {
        text += c;
        i++;
      }
    } else if ((c === "*" || c === "_") && source.startsWith(c + c, i)) {
      const marker = c + c;
      const end = source.indexOf(marker, i + 2);
      if (end > i + 2 && !isWhitespace(source[i + 2])) {
        flushText();
        out.push({ type: "bold", value: source.substring(i + 2, end) });
        i = end + 2;
      } else {
        text += marker;
        i += 2;
      }
    } else if (c === "*" || (c === "_" && isWordBoundaryBefore(source, i))) {
      const end = findClosing(source, c, i + 1);
      if (end > i + 1 && !isWhitespace(source[i + 1]) && !isWhitespace(source[end - 1])) {
        flushText();
        out.push({ type: "italic", value: source.substring(i + 1, end) });
        i = end + 1;
      } else {
        text += c;
        i++;
      }
    } else if (c === "[" || (c === "!" && source.startsWith("![", i))) {
      const image = c === "!";
      const open = image ? i + 1 : i;
      const close = source.indexOf("]", open + 1);
      if (close > open && source.startsWith("(", close + 1)) {
        const urlEnd = source.indexOf(")", close + 2);
        if (urlEnd > close + 2) {
          flushText();
          const label = source.substring(open + 1, close);
          const url = source.substring(close + 2, urlEnd);
          out.push({ type: "link", label: image && label.trim() === "" ? url : label, url });
          i = urlEnd + 1;
          continue;
        }
      }
      text += c;
      i++;
    } else {
      text += c;
      i++;
    }
  }
  flushText();
  return out;
}

/**
 * True when `url` is an `https` URL on one of `hosts` (case-insensitive), as `isAllowedImageUrl` in
 * the app: the app draws images from its own Storage only and shows any other image as a link.
 */
export function isAllowedImageUrl(url: string, hosts: readonly string[]): boolean {
  if (!/^https:\/\//i.test(url)) return false;
  const rest = url.slice("https://".length);
  const end = rest.search(/[/:?#]/);
  const host = end < 0 ? rest : rest.slice(0, end);
  if (host === "" || host.includes("@")) return false;
  return hosts.some((h) => h.toLowerCase() === host.toLowerCase());
}

function isWordBoundaryBefore(source: string, index: number): boolean {
  return index === 0 || !isLetterOrDigit(source[index - 1]);
}

function findClosing(source: string, marker: string, from: number): number {
  let j = from;
  while (j < source.length) {
    if (source[j] === marker && !(marker === "_" && isLetterOrDigit(source[j + 1]))) {
      return j;
    }
    j++;
  }
  return -1;
}

// ---- Unsupported markup ------------------------------------------------------------------------

export type MdWarning = {
  /** 1-based line in the source. */
  line: number;
  /** Stable id, one per rule, for tests and de-duplication. */
  rule: MdWarningRule;
  message: string;
};

export type MdWarningRule =
  | "inline-image"
  | "table"
  | "html"
  | "heading-level"
  | "blockquote"
  | "nested-emphasis"
  | "strikethrough"
  | "reference-link"
  | "setext-heading"
  | "task-list"
  | "tilde-fence"
  | "escape"
  | "link-title"
  | "indented-numbered";

const RULE_MESSAGES: Record<MdWarningRule, string> = {
  "inline-image": "Images inside a line of text render as a link to the image; put the image on its own line to show it.",
  table: "Tables are not supported; the app shows the pipes as plain text.",
  html: "HTML and autolinks are not supported; tags are shown as plain text.",
  "heading-level": "Only #, ## and ### headings are supported; deeper levels render as text.",
  blockquote: "Blockquotes (>) are not supported; the “>” is shown as text.",
  "nested-emphasis": "Nested emphasis (***, **_…_**) is not supported; only one style applies.",
  strikethrough: "Strikethrough (~~) is not supported; the tildes are shown as text.",
  "reference-link": "Reference links ([text][ref], [ref]: url) are not supported.",
  "setext-heading": "Underlined headings are not supported: the underline renders as a rule.",
  "task-list": "Task lists (- [ ]) are not supported; the brackets are shown as text.",
  "tilde-fence": "Only ``` fences are supported; ~~~ renders as text.",
  escape: "Backslash escapes are not supported; the backslash is shown as text.",
  "link-title": "Link titles ([text](url \"title\")) are not supported; the title becomes part of the URL.",
  "indented-numbered": "Numbered items ignore indentation in the app; this one renders flush left.",
};

/** Reports markup in `source` that the app renders differently from CommonMark. */
export function lintMarkdown(source: string): MdWarning[] {
  const warnings: MdWarning[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let inFence = false;
  let previousWasText = false;

  const add = (line: number, rule: MdWarningRule) =>
    warnings.push({ line, rule, message: RULE_MESSAGES[rule] });

  lines.forEach((line, index) => {
    const n = index + 1;
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      previousWasText = false;
      return;
    }
    if (inFence) return;
    const trimmed = line.trim();
    if (/^~~~/.test(trimmed)) add(n, "tilde-fence");
    if (/^\|.*\|$/.test(trimmed) || /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(trimmed)) {
      add(n, "table");
    }
    if (/<\/?[a-zA-Z][^<>]*>/.test(line)) add(n, "html");
    if (/^\s{0,3}#{4,}\s/.test(line)) add(n, "heading-level");
    if (/^\s{0,3}>/.test(line)) add(n, "blockquote");
    if (/^\s*[-*+]\s+\[[ xX]\]\s/.test(line)) add(n, "task-list");
    if (/^\s+\d{1,3}[.)]\s+/.test(line)) add(n, "indented-numbered");
    if (
      previousWasText &&
      (/^\s{0,3}=+\s*$/.test(line) || /^\s{0,3}-{3,}\s*$/.test(line))
    ) {
      add(n, "setext-heading");
    }
    if (!rulePattern.test(line) && /\*\*\*\S|\S\*\*\*|\*\*_|_\*\*|__\*|\*__/.test(line)) {
      add(n, "nested-emphasis");
    }
    if (/~~\S.*\S~~/.test(line)) add(n, "strikethrough");
    if (/\]\[[^\]]*\]/.test(line) || /^\s{0,3}\[[^\]]+\]:\s+\S/.test(line)) add(n, "reference-link");
    if (/\\[\\`*_{}[\]()#+\-.!|>]/.test(line)) add(n, "escape");
    if (/\]\([^)\s]+\s+"[^"]*"\)/.test(line)) add(n, "link-title");
    if (/!\[[^\]]*\]\([^)\s]+\)/.test(line) && !imageLinePattern.test(line)) add(n, "inline-image");

    const isStructural =
      trimmed === "" ||
      imageLinePattern.test(line) ||
      rulePattern.test(line) ||
      headingPattern.test(line) ||
      bulletPattern.test(line) ||
      numberedPattern.test(line);
    previousWasText = !isStructural;
  });
  return warnings;
}

// ---- Images ------------------------------------------------------------------------------------

export type MdImage = {
  alt: string;
  url: string;
  /** Offset of the `!` in the source. */
  start: number;
  /** Offset just past the closing `)`. */
  end: number;
};

const IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

/** Every `![alt](url)` in `source`, in document order. */
export function findImages(source: string): MdImage[] {
  const out: MdImage[] = [];
  for (const match of source.matchAll(IMAGE_PATTERN)) {
    out.push({
      alt: match[1],
      url: match[2],
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    });
  }
  return out;
}

export function imageMarkdown(alt: string, url: string): string {
  return `![${alt.replace(/[[\]\n]/g, " ").trim()}](${url})`;
}

/** Rewrites the image at `image` (an entry of `findImages(source)`) with a new alt and/or url. */
export function replaceImage(
  source: string,
  image: MdImage,
  next: { alt?: string; url?: string },
): string {
  return (
    source.slice(0, image.start) +
    imageMarkdown(next.alt ?? image.alt, next.url ?? image.url) +
    source.slice(image.end)
  );
}

/** Removes the image and the blank line it leaves behind. */
export function removeImage(source: string, image: MdImage): string {
  const before = source.slice(0, image.start);
  const after = source.slice(image.end);
  const joined = before + after;
  // Collapse the empty line left when the image sat alone on its line.
  return joined.replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "");
}
