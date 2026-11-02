/**
 * A lesson as one ordered list of chunks shared by every locale. Each chunk has a stable id for the
 * editing session and holds its body per locale; the per-locale `answer_md` is derived from it with
 * `en` filling in for chunks a locale lacks, which is the text the app shows for that locale.
 *
 * Nothing here is stored: `answer_md` per locale is the only persisted form. Ids, the
 * "stale" marks and the preview-only image alignment live for the session and are rebuilt on load,
 * where `alignBodies` pairs the locales' chunks by shared anchors (images, rules, identical text)
 * and by position in between.
 */
import {
  bodyText,
  chunksFromMarkdown,
  clampIndent,
  clampLevel,
  clampNumber,
  convertBody,
  isEditableBody,
  isTextBody,
  normalizeBody,
  sameBody,
  serializeBody,
  serializeChunks,
  withText,
  type ChunkBody,
  type ChunkKind,
} from "./chunks.ts";
import { pendingIdFromUrl, META_KEYS, type DraftMeta, type LessonDraft } from "./lesson-draft.ts";
import { LOCALES, type Locale } from "./types.ts";

export type ImageAlign = "full" | "left" | "center" | "right";

export type Chunk = {
  id: string;
  content: Partial<Record<Locale, ChunkBody>>;
  /** Locales whose body predates the latest en edit. Session-only: `answer_md` cannot store it. */
  stale: Locale[];
  /** Preview-only alignment of an image chunk; never written to `answer_md` (the app has no syntax for it). */
  previewAlign?: ImageAlign;
};

export type ChunkDraft = DraftMeta & {
  /** Localizations that exist, with their chip text; a locale absent here has no localization. */
  texts: Partial<Record<Locale, string>>;
  chunks: Chunk[];
};

export type NewId = () => string;

export const randomId: NewId = () => globalThis.crypto.randomUUID();

// ---- Lesson draft ↔ chunk draft ----------------------------------------------------------------

type Pair = { en: number | null; other: number | null };

/**
 * Pairs the chunks of `other` with those of `en`: identical bodies (images, rules, untranslated
 * text) anchor the two lists (longest common subsequence), and chunks between anchors pair up by
 * position. Leftovers on either side pair with null.
 */
export function alignBodies(en: readonly ChunkBody[], other: readonly ChunkBody[]): Pair[] {
  const n = en.length;
  const m = other.length;
  const enText = en.map(serializeBody);
  const otherText = other.map(serializeBody);
  const equal = (i: number, j: number) => enText[i] === otherText[j];
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = equal(i, j) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const anchors: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (equal(i, j)) {
      anchors.push([i, j]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  const pairs: Pair[] = [];
  let ei = 0;
  let oj = 0;
  const segment = (enEnd: number, otherEnd: number) => {
    while (ei < enEnd || oj < otherEnd) {
      pairs.push({ en: ei < enEnd ? ei : null, other: oj < otherEnd ? oj : null });
      if (ei < enEnd) ei++;
      if (oj < otherEnd) oj++;
    }
  };
  for (const [a, b] of anchors) {
    segment(a, b);
    pairs.push({ en: a, other: b });
    ei = a + 1;
    oj = b + 1;
  }
  segment(n, m);
  return pairs;
}

function metaOf(draft: DraftMeta): DraftMeta {
  const meta = {} as DraftMeta;
  for (const key of META_KEYS) (meta as Record<string, unknown>)[key] = draft[key];
  return meta;
}

/** Builds the chunk list from each locale's `answer_md`, aligned against `en`. */
export function chunkDraftFromLesson(draft: LessonDraft, newId: NewId = randomId): ChunkDraft {
  const texts: ChunkDraft["texts"] = {};
  for (const locale of LOCALES) {
    const loc = draft.localizations[locale];
    if (loc) texts[locale] = loc.text;
  }
  const enBodies = chunksFromMarkdown(draft.localizations.en?.answer_md ?? "");
  const aligned: Chunk[] = enBodies.map((body) => ({ id: newId(), content: { en: body }, stale: [] }));
  // Chunks a locale has and en lacks, keyed by the en chunk they follow (-1: before the first).
  const extras = new Map<number, Chunk[]>();
  for (const locale of LOCALES) {
    if (locale === "en") continue;
    const md = draft.localizations[locale]?.answer_md ?? "";
    if (!md.trim()) continue;
    const bodies = chunksFromMarkdown(md);
    let lastEn = -1;
    for (const pair of alignBodies(enBodies, bodies)) {
      if (pair.en !== null) {
        lastEn = pair.en;
        if (pair.other !== null) aligned[pair.en].content[locale] = bodies[pair.other];
      } else if (pair.other !== null) {
        const list = extras.get(lastEn) ?? [];
        list.push({ id: newId(), content: { [locale]: bodies[pair.other] }, stale: [] });
        extras.set(lastEn, list);
      }
    }
  }
  const chunks: Chunk[] = [...(extras.get(-1) ?? [])];
  aligned.forEach((chunk, index) => {
    chunks.push(chunk, ...(extras.get(index) ?? []));
  });
  return { ...metaOf(draft), texts, chunks };
}

/** The bodies a locale shows, in order: its own, or en's where it has none. */
export function localeBodies(
  chunks: readonly Chunk[],
  locale: Locale,
): { chunk: Chunk; body: ChunkBody; fallback: boolean }[] {
  const out: { chunk: Chunk; body: ChunkBody; fallback: boolean }[] = [];
  for (const chunk of chunks) {
    const own = chunk.content[locale];
    if (own) out.push({ chunk, body: own, fallback: false });
    else if (chunk.content.en) out.push({ chunk, body: chunk.content.en, fallback: true });
  }
  return out;
}

/** Whether a locale has at least one body of its own; without any, its answer stays empty. */
export function localeHasAnswer(chunks: readonly Chunk[], locale: Locale): boolean {
  return chunks.some((chunk) => Boolean(chunk.content[locale]));
}

/**
 * The `answer_md` written for a locale: its chunks with en filling the gaps. A locale with no body
 * of its own gets an empty answer, as today: the app then asks the Coach instead of showing en.
 */
export function localeMarkdown(chunks: readonly Chunk[], locale: Locale): string {
  if (!localeHasAnswer(chunks, locale)) return "";
  return serializeChunks(localeBodies(chunks, locale).map((row) => row.body));
}

export function lessonFromChunkDraft(draft: ChunkDraft): LessonDraft {
  const localizations: LessonDraft["localizations"] = {};
  for (const locale of LOCALES) {
    const text = draft.texts[locale];
    if (text !== undefined) localizations[locale] = { text, answer_md: localeMarkdown(draft.chunks, locale) };
  }
  return { ...metaOf(draft), localizations };
}

/** The lesson draft as the chunk editor writes it back: the form Save compares edits against. */
export function canonicalLesson(draft: LessonDraft): LessonDraft {
  return lessonFromChunkDraft(chunkDraftFromLesson(draft));
}

// ---- Status ------------------------------------------------------------------------------------

export type ChunkLocaleStatus = "translated" | "same" | "missing" | "stale";

export const STATUS_LABELS: Record<ChunkLocaleStatus, string> = {
  translated: "Translated",
  same: "Same as en",
  missing: "Missing: shows en",
  stale: "Stale: en changed since",
};

export function chunkLocaleStatus(chunk: Chunk, locale: Locale): ChunkLocaleStatus {
  const own = chunk.content[locale];
  if (!own) return "missing";
  if (locale === "en") return "translated";
  if (chunk.stale.includes(locale)) return "stale";
  if (sameBody(own, chunk.content.en)) return "same";
  return "translated";
}

export type LocaleSummary = Record<ChunkLocaleStatus, number> & { total: number };

export function localeSummary(chunks: readonly Chunk[], locale: Locale): LocaleSummary {
  const summary: LocaleSummary = { translated: 0, same: 0, missing: 0, stale: 0, total: chunks.length };
  for (const chunk of chunks) summary[chunkLocaleStatus(chunk, locale)]++;
  return summary;
}

// ---- Operations (pure) -------------------------------------------------------------------------

export function indexOfChunk(chunks: readonly Chunk[], id: string): number {
  return chunks.findIndex((chunk) => chunk.id === id);
}

function mapChunk(chunks: readonly Chunk[], id: string, fn: (chunk: Chunk) => Chunk): Chunk[] {
  return chunks.map((chunk) => (chunk.id === id ? fn(chunk) : chunk));
}

/** The body a locale edits in `chunk`: its own, or en's as the starting point. */
export function editableBody(chunk: Chunk, locale: Locale): ChunkBody | undefined {
  return chunk.content[locale] ?? chunk.content.en;
}

/**
 * Sets a locale's body. An en edit marks every other locale that has a differing body as stale;
 * an edit in another locale clears its own stale mark.
 */
export function updateBody(chunks: readonly Chunk[], id: string, locale: Locale, body: ChunkBody): Chunk[] {
  return mapChunk(chunks, id, (chunk) => {
    const content = { ...chunk.content, [locale]: body };
    let stale: Locale[];
    if (locale === "en") {
      stale = LOCALES.filter(
        (other) =>
          other !== "en" &&
          content[other] !== undefined &&
          (chunk.stale.includes(other) || !sameBody(content[other], body)),
      );
    } else {
      stale = chunk.stale.filter((other) => other !== locale);
    }
    return { ...chunk, content, stale };
  });
}

export function setBodyText(chunks: readonly Chunk[], id: string, locale: Locale, text: string): Chunk[] {
  const chunk = chunks[indexOfChunk(chunks, id)];
  if (!chunk) return [...chunks];
  const base = editableBody(chunk, locale) ?? { kind: "paragraph", text: "" };
  return updateBody(chunks, id, locale, withText(base, text));
}

/** Changes the kind of a chunk in every locale that has it (text travels, see `convertBody`). */
export function setKind(chunks: readonly Chunk[], id: string, kind: Exclude<ChunkKind, "image">): Chunk[] {
  const index = indexOfChunk(chunks, id);
  if (index < 0) return [...chunks];
  const previous = chunks[index - 1];
  return mapChunk(chunks, id, (chunk) => {
    const content: Chunk["content"] = {};
    for (const locale of LOCALES) {
      const body = chunk.content[locale];
      if (body) content[locale] = convertBody(body, kind, previous ? editableBody(previous, locale) : undefined);
    }
    return { ...chunk, content };
  });
}

function mapBodies(chunks: readonly Chunk[], id: string, fn: (body: ChunkBody) => ChunkBody): Chunk[] {
  return mapChunk(chunks, id, (chunk) => {
    const content: Chunk["content"] = {};
    for (const locale of LOCALES) {
      const body = chunk.content[locale];
      if (body) content[locale] = fn(body);
    }
    return { ...chunk, content };
  });
}

export function setHeadingLevel(chunks: readonly Chunk[], id: string, level: number): Chunk[] {
  return mapBodies(chunks, id, (body) => (body.kind === "heading" ? { ...body, level: clampLevel(level) } : body));
}

export function setBulletIndent(chunks: readonly Chunk[], id: string, indent: number): Chunk[] {
  return mapBodies(chunks, id, (body) => (body.kind === "bullet" ? { ...body, indent: clampIndent(indent) } : body));
}

export function setNumber(chunks: readonly Chunk[], id: string, number: number): Chunk[] {
  return mapBodies(chunks, id, (body) => (body.kind === "numbered" ? { ...body, number: clampNumber(number) } : body));
}

/** The picture is shared by every locale; only the alt text is per locale. */
export function setImageUrl(chunks: readonly Chunk[], id: string, url: string): Chunk[] {
  return mapBodies(chunks, id, (body) => (body.kind === "image" ? { ...body, url } : body));
}

export function setPreviewAlign(chunks: readonly Chunk[], id: string, previewAlign: ImageAlign): Chunk[] {
  return mapChunk(chunks, id, (chunk) => ({ ...chunk, previewAlign }));
}

/**
 * Inserts a chunk after `afterIndex` (-1: first). Text bodies belong to `locale` only; images and
 * rules are the same in every language, so they go into every locale listed in `locales`.
 */
export function insertChunk(
  chunks: readonly Chunk[],
  afterIndex: number,
  body: ChunkBody,
  locale: Locale,
  locales: readonly Locale[],
  newId: NewId = randomId,
): { chunks: Chunk[]; id: string } {
  const id = newId();
  const content: Chunk["content"] = {};
  const shared = body.kind === "image" || body.kind === "rule";
  const targets: Locale[] = shared ? [...new Set<Locale>([locale, "en", ...locales])] : [locale];
  for (const target of targets) content[target] = body;
  const next = [...chunks];
  next.splice(afterIndex + 1, 0, { id, content, stale: [] });
  return { chunks: next, id };
}

export function duplicateChunk(chunks: readonly Chunk[], id: string, newId: NewId = randomId): { chunks: Chunk[]; id: string } {
  const index = indexOfChunk(chunks, id);
  if (index < 0) return { chunks: [...chunks], id };
  const copy: Chunk = { ...chunks[index], id: newId(), content: { ...chunks[index].content }, stale: [...chunks[index].stale] };
  const next = [...chunks];
  next.splice(index + 1, 0, copy);
  return { chunks: next, id: copy.id };
}

export function deleteChunk(chunks: readonly Chunk[], id: string): Chunk[] {
  return chunks.filter((chunk) => chunk.id !== id);
}

export function moveChunk(chunks: readonly Chunk[], id: string, delta: number): Chunk[] {
  const index = indexOfChunk(chunks, id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= chunks.length) return [...chunks];
  const next = [...chunks];
  const [chunk] = next.splice(index, 1);
  next.splice(target, 0, chunk);
  return next;
}

/** The body an Enter at the end of `body` continues with: a list continues, anything else is a paragraph. */
function continuation(body: ChunkBody, text: string): ChunkBody {
  switch (body.kind) {
    case "bullet":
      return { kind: "bullet", indent: body.indent, text };
    case "numbered":
      return { kind: "numbered", number: clampNumber(body.number + 1), text };
    default:
      return { kind: "paragraph", text };
  }
}

/** Splits the text of `locale`'s body at `caret`: the head stays, the tail starts a new chunk after it. */
export function splitChunk(
  chunks: readonly Chunk[],
  id: string,
  locale: Locale,
  caret: number,
  newId: NewId = randomId,
): { chunks: Chunk[]; id: string } | null {
  const index = indexOfChunk(chunks, id);
  const chunk = chunks[index];
  const body = chunk ? editableBody(chunk, locale) : undefined;
  if (!chunk || !body || !isEditableBody(body)) return null;
  const text = bodyText(body);
  const at = Math.max(0, Math.min(text.length, caret));
  const head = updateBody(chunks, id, locale, withText(body, text.slice(0, at)));
  const tail = continuation(body, text.slice(at));
  const next = [...head];
  const created: Chunk = { id: newId(), content: { [locale]: tail }, stale: [] };
  next.splice(index + 1, 0, created);
  return { chunks: next, id: created.id };
}

/**
 * Backspace at the start of a chunk: its text is appended to the previous text chunk and the
 * chunk goes away; an empty chunk after an image or rule just goes away. Returns where the caret
 * lands, or null when nothing can be joined.
 */
export function joinWithPrevious(
  chunks: readonly Chunk[],
  id: string,
  locale: Locale,
): { chunks: Chunk[]; id: string; caret: number | null } | null {
  const index = indexOfChunk(chunks, id);
  if (index <= 0) return null;
  const chunk = chunks[index];
  const previous = chunks[index - 1];
  const body = editableBody(chunk, locale);
  const previousBody = editableBody(previous, locale);
  const text = body ? bodyText(body) : "";
  if (previousBody && isEditableBody(previousBody) && body && isEditableBody(body)) {
    const previousText = bodyText(previousBody);
    const joined = updateBody(chunks, previous.id, locale, withText(previousBody, previousText + text));
    return { chunks: deleteChunk(joined, id), id: previous.id, caret: previousText.length };
  }
  if (text.trim() === "") return { chunks: deleteChunk(chunks, id), id: previous.id, caret: null };
  return null;
}

/**
 * After a text edit: if the app's parser would split the body (a list marker typed at the start, a
 * fence, a blank line, a second structural line), the chunk takes the parser's reading, with extra
 * blocks as new chunks after it. Otherwise the text stays exactly as typed.
 */
export function normalizeChunk(
  chunks: readonly Chunk[],
  id: string,
  locale: Locale,
  newId: NewId = randomId,
): { chunks: Chunk[]; changed: boolean; lastId: string } {
  const index = indexOfChunk(chunks, id);
  const chunk = chunks[index];
  const body = chunk?.content[locale];
  if (!chunk || !body) return { chunks: [...chunks], changed: false, lastId: id };
  const parts = normalizeBody(body);
  const structural = (a: ChunkBody, b: ChunkBody) =>
    a.kind === b.kind &&
    (a.kind !== "heading" || b.kind !== "heading" || a.level === b.level) &&
    (a.kind !== "bullet" || b.kind !== "bullet" || a.indent === b.indent) &&
    (a.kind !== "numbered" || b.kind !== "numbered" || a.number === b.number);
  if (parts.length === 1 && structural(parts[0], body)) return { chunks: [...chunks], changed: false, lastId: id };
  let next = updateBody(chunks, id, locale, parts[0]);
  let lastId = id;
  parts.slice(1).forEach((part, offset) => {
    const created: Chunk = { id: newId(), content: { [locale]: part }, stale: [] };
    next = [...next];
    next.splice(index + 1 + offset, 0, created);
    lastId = created.id;
  });
  return { chunks: next, changed: true, lastId };
}

/** Seeds `to` with `from`'s body; the caller confirms first when `to` already has one. */
export function copyBody(chunks: readonly Chunk[], id: string, from: Locale, to: Locale): Chunk[] {
  return mapChunk(chunks, id, (chunk) => {
    const source = chunk.content[from];
    if (!source || from === to) return chunk;
    return {
      ...chunk,
      content: { ...chunk.content, [to]: source },
      stale: chunk.stale.filter((other) => other !== to),
    };
  });
}

export function copyFromEn(chunks: readonly Chunk[], id: string, locale: Locale): Chunk[] {
  return copyBody(chunks, id, "en", locale);
}

/** Drops a locale's body so the chunk falls back to en again. */
export function clearLocaleBody(chunks: readonly Chunk[], id: string, locale: Locale): Chunk[] {
  if (locale === "en") return [...chunks];
  return mapChunk(chunks, id, (chunk) => {
    const content = { ...chunk.content };
    delete content[locale];
    return { ...chunk, content, stale: chunk.stale.filter((other) => other !== locale) };
  });
}

/** Removes a localization: its chip text and every body it had. Chunks left empty go away. */
export function removeLocale(draft: ChunkDraft, locale: Locale): ChunkDraft {
  if (locale === "en") return draft;
  const texts = { ...draft.texts };
  delete texts[locale];
  const chunks = draft.chunks
    .map((chunk) => {
      const content = { ...chunk.content };
      delete content[locale];
      return { ...chunk, content, stale: chunk.stale.filter((other) => other !== locale) };
    })
    .filter((chunk) => Object.keys(chunk.content).length > 0);
  return { ...draft, texts, chunks };
}

// ---- Images ------------------------------------------------------------------------------------

export type ChunkImage = { id: string; url: string; alt: string };

/** Every image chunk with the url and alt the locale shows. */
export function imageChunks(chunks: readonly Chunk[], locale: Locale): ChunkImage[] {
  const out: ChunkImage[] = [];
  for (const { chunk, body } of localeBodies(chunks, locale)) {
    if (body.kind === "image") out.push({ id: chunk.id, url: body.url, alt: body.alt });
  }
  return out;
}

/** Pending image ids referenced by any locale's image chunks. */
export function pendingIdsInChunks(chunks: readonly Chunk[]): Set<string> {
  const ids = new Set<string>();
  for (const chunk of chunks) {
    for (const body of Object.values(chunk.content)) {
      const id = body?.kind === "image" ? pendingIdFromUrl(body.url) : null;
      if (id) ids.add(id);
    }
  }
  return ids;
}

/** After Save uploaded the pending images: swaps `pending:` urls for the Storage urls, in every locale. */
export function replacePendingUrls(chunks: readonly Chunk[], uploaded: ReadonlyMap<string, string>): Chunk[] {
  return chunks.map((chunk) => {
    const content: Chunk["content"] = {};
    for (const locale of LOCALES) {
      const body = chunk.content[locale];
      if (!body) continue;
      const pendingId = body.kind === "image" ? pendingIdFromUrl(body.url) : null;
      const url = pendingId ? uploaded.get(pendingId) : undefined;
      content[locale] = url && body.kind === "image" ? { ...body, url } : body;
    }
    return { ...chunk, content };
  });
}

/** Whether `chunk` is text in the locale shown (so "same as en" means untranslated, not shared). */
export function isTextChunk(chunk: Chunk, locale: Locale): boolean {
  const body = editableBody(chunk, locale);
  return Boolean(body && isTextBody(body));
}
