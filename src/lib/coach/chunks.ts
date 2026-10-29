/**
 * The chunk model of a Coach answer: one typed block per entry, edited in the phone preview and
 * serialized back to the markdown subset the app parses (`CoachMarkdownParser.kt`, ported in
 * `markdown.ts`). The stored format stays `answer_md`; chunks are an editing view of it.
 *
 * Text bodies keep the author's inline markup (`**bold**`, `[text](url)`, …) as written, so a
 * round trip through the editor changes nothing the person did not touch.
 */
import {
  imageMarkdown,
  lintMarkdown,
  parseBlocks,
  parseInline,
  type MdBlock,
  type MdInline,
  type MdWarning,
} from "./markdown.ts";

export type TextKind = "paragraph" | "heading" | "bullet" | "numbered";
export type ChunkKind = TextKind | "code" | "rule" | "image";
export type HeadingLevel = 1 | 2 | 3;

export type TextBody =
  | { kind: "paragraph"; text: string }
  | { kind: "heading"; level: HeadingLevel; text: string }
  | { kind: "bullet"; indent: number; text: string }
  | { kind: "numbered"; number: number; text: string };

export type CodeBody = { kind: "code"; code: string };
export type ImageBody = { kind: "image"; alt: string; url: string };

export type ChunkBody = TextBody | CodeBody | { kind: "rule" } | ImageBody;

export const TEXT_KINDS: readonly TextKind[] = ["paragraph", "heading", "bullet", "numbered"];
export const MAX_BULLET_INDENT = 2;
export const MAX_NUMBER = 999;

export const KIND_LABELS: Record<ChunkKind, string> = {
  paragraph: "Paragraph",
  heading: "Heading",
  bullet: "Bullet",
  numbered: "Numbered item",
  code: "Code",
  rule: "Rule",
  image: "Image",
};

export function isTextBody(body: ChunkBody): body is TextBody {
  return (TEXT_KINDS as readonly string[]).includes(body.kind);
}

/** Bodies whose text the person edits in a text field: text kinds and code. */
export function isEditableBody(body: ChunkBody): body is TextBody | CodeBody {
  return isTextBody(body) || body.kind === "code";
}

export function isListItem(body: ChunkBody): boolean {
  return body.kind === "bullet" || body.kind === "numbered";
}

/** The editable text of a body: its text, code, or alt; "" for a rule. */
export function bodyText(body: ChunkBody): string {
  if (isTextBody(body)) return body.text;
  if (body.kind === "code") return body.code;
  if (body.kind === "image") return body.alt;
  return "";
}

export function withText(body: ChunkBody, text: string): ChunkBody {
  if (isTextBody(body)) return { ...body, text };
  if (body.kind === "code") return { ...body, code: text };
  if (body.kind === "image") return { ...body, alt: text };
  return body;
}

export function clampLevel(level: number): HeadingLevel {
  const n = Math.round(level);
  return n <= 1 ? 1 : n >= 3 ? 3 : 2;
}

export function clampIndent(indent: number): number {
  const n = Math.round(indent);
  return Number.isFinite(n) ? Math.min(MAX_BULLET_INDENT, Math.max(0, n)) : 0;
}

export function clampNumber(number: number): number {
  const n = Math.round(number);
  return Number.isFinite(n) ? Math.min(MAX_NUMBER, Math.max(1, n)) : 1;
}

/** A fresh, empty body of `kind` (images need a url and are created by the caller). */
export function emptyBody(kind: Exclude<ChunkKind, "image">): ChunkBody {
  switch (kind) {
    case "paragraph":
      return { kind, text: "" };
    case "heading":
      return { kind, level: 2, text: "" };
    case "bullet":
      return { kind, indent: 0, text: "" };
    case "numbered":
      return { kind, number: 1, text: "" };
    case "code":
      return { kind, code: "" };
    case "rule":
      return { kind };
  }
}

/**
 * Changes the kind of a body, keeping its text when both kinds carry text. From code the code
 * becomes the text, from an image the alt does; a rule starts empty. `previous` is the body before
 * this one, so a new list item continues its list (same indent, next number).
 */
export function convertBody(body: ChunkBody, kind: Exclude<ChunkKind, "image">, previous?: ChunkBody): ChunkBody {
  if (body.kind === kind) return body;
  const text = bodyText(body);
  switch (kind) {
    case "paragraph":
      return { kind, text };
    case "heading":
      return { kind, level: 2, text };
    case "bullet":
      return { kind, indent: previous?.kind === "bullet" ? previous.indent : 0, text };
    case "numbered":
      return { kind, number: previous?.kind === "numbered" ? clampNumber(previous.number + 1) : 1, text };
    case "code":
      return { kind, code: text };
    case "rule":
      return { kind };
  }
}

// ---- Markdown ↔ chunks -------------------------------------------------------------------------

export function bodyFromBlock(block: MdBlock, text: string): ChunkBody {
  switch (block.type) {
    case "paragraph":
      return { kind: "paragraph", text };
    case "heading":
      return { kind: "heading", level: clampLevel(block.level), text };
    case "bullet":
      return { kind: "bullet", indent: block.indent, text };
    case "numbered":
      return { kind: "numbered", number: block.number, text };
    case "code":
      return { kind: "code", code: block.code };
    case "rule":
      return { kind: "rule" };
    case "image":
      return { kind: "image", alt: block.alt, url: block.url };
  }
}

/** Splits `answer_md` into chunk bodies exactly as the app's parser splits it into blocks. */
export function chunksFromMarkdown(source: string): ChunkBody[] {
  return parseBlocks(source).map(({ block, text }) => bodyFromBlock(block, text));
}

/** The markdown line(s) of one body, in the form the parser reads back as the same block. */
export function serializeBody(body: ChunkBody): string {
  switch (body.kind) {
    case "paragraph":
      return body.text;
    case "heading":
      return `${"#".repeat(body.level)} ${body.text}`;
    case "bullet":
      return `${"  ".repeat(body.indent)}- ${body.text}`;
    case "numbered":
      return `${body.number}. ${body.text}`;
    case "code":
      return "```\n" + body.code + "\n```";
    case "rule":
      return "---";
    case "image":
      return imageMarkdown(body.alt, body.url);
  }
}

/**
 * Joins bodies into `answer_md`: items of one list on consecutive lines, everything else separated
 * by a blank line (which is what ends a paragraph for the parser). Empty paragraphs are left out:
 * the parser would drop them anyway.
 */
export function serializeChunks(bodies: readonly ChunkBody[]): string {
  let out = "";
  let previous: ChunkBody | null = null;
  for (const body of bodies) {
    const line = serializeBody(body);
    if (body.kind === "paragraph" && line.trim() === "") continue;
    if (previous) out += isListItem(previous) && previous.kind === body.kind ? "\n" : "\n\n";
    out += line;
    previous = body;
  }
  return out;
}

/** The blocks the app draws for `body`: one, unless its text holds structure the parser splits. */
export function blocksOf(body: ChunkBody): MdBlock[] {
  return parseBlocks(serializeBody(body)).map((entry) => entry.block);
}

/** The inline parts of a text body, as the app renders them. */
export function inlinesOf(body: TextBody): MdInline[] {
  return parseInline(body.text);
}

/**
 * The body(ies) the parser reads back from `body`. A text body whose text contains a structural
 * line (`- item`, `# title`, a fence, a blank line) becomes several chunks, the way the app would
 * split it; an empty text body stays as it is so the person can keep typing in it.
 */
export function normalizeBody(body: ChunkBody): ChunkBody[] {
  if (!isEditableBody(body)) return [body];
  if (bodyText(body).trim() === "") return [body];
  const parsed = chunksFromMarkdown(serializeBody(body));
  return parsed.length > 0 ? parsed : [body];
}

/** Markup in `body` that the app renders differently from CommonMark (see `lintMarkdown`). */
export function lintBody(body: ChunkBody): MdWarning[] {
  if (!isTextBody(body)) return [];
  return lintMarkdown(serializeBody(body));
}

/** Whether two bodies serialize to the same markdown. */
export function sameBody(a: ChunkBody | undefined, b: ChunkBody | undefined): boolean {
  if (!a || !b) return !a && !b;
  return serializeBody(a) === serializeBody(b);
}
