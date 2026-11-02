import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  alignBodies,
  canonicalLesson,
  chunkDraftFromLesson,
  chunkLocaleStatus,
  copyFromEn,
  clearLocaleBody,
  deleteChunk,
  duplicateChunk,
  imageChunks,
  insertChunk,
  joinWithPrevious,
  lessonFromChunkDraft,
  localeMarkdown,
  localeSummary,
  moveChunk,
  normalizeChunk,
  pendingIdsInChunks,
  removeLocale,
  replacePendingUrls,
  setBodyText,
  setHeadingLevel,
  setImageUrl,
  setKind,
  splitChunk,
  updateBody,
  type Chunk,
  type ChunkDraft,
} from "./chunk-doc.ts";
import { chunksFromMarkdown } from "./chunks.ts";
import { isDirty, planSave, type LessonDraft } from "./lesson-draft.ts";

let counter = 0;
const ids = () => `c${++counter}`;

const STORAGE = "https://h/v1/files/11111111-1111-4111-8111-111111111111";

function lesson(localizations: LessonDraft["localizations"]): LessonDraft {
  return {
    active: true,
    requires_personal_data: false,
    requires_plan_builder: false,
    unlocks_after: "",
    section_slug: "start",
    sort_order: 1,
    localizations,
  };
}

const EN = `# Warm up\n\nStart slowly.\n\n![Squat](${STORAGE})\n\n- one\n- two\n\n---\n\nDone.`;
const ES = `# Calentamiento\n\nEmpieza despacio.\n\n![Sentadilla](${STORAGE})\n\n- uno\n- dos\n\n---\n\nHecho.`;

describe("alignBodies", () => {
  it("pairs by position when the structure matches", () => {
    const pairs = alignBodies(chunksFromMarkdown(EN), chunksFromMarkdown(ES));
    assert.deepEqual(
      pairs.map((p) => [p.en, p.other]),
      [0, 1, 2, 3, 4, 5, 6].map((i) => [i, i]),
    );
  });

  it("anchors on shared images and rules when a locale has extra or fewer paragraphs", () => {
    const en = chunksFromMarkdown("Intro\n\n![a](u)\n\nAfter");
    const other = chunksFromMarkdown("Intro-1\n\nIntro-2\n\n![a](u)");
    assert.deepEqual(
      alignBodies(en, other).map((p) => [p.en, p.other]),
      [
        [0, 0],
        [null, 1],
        [1, 2],
        [2, null],
      ],
    );
  });
});

describe("chunkDraftFromLesson / lessonFromChunkDraft", () => {
  it("builds one chunk list with every locale's body and derives the same answer_md back", () => {
    const base = lesson({ en: { text: "Warm up", answer_md: EN }, es: { text: "Calentamiento", answer_md: ES } });
    const draft = chunkDraftFromLesson(base, ids);
    assert.equal(draft.chunks.length, 7);
    assert.equal(draft.chunks.every((c) => c.content.en && c.content.es), true);
    assert.deepEqual(lessonFromChunkDraft(draft), base);
    assert.equal(isDirty(base, lessonFromChunkDraft(draft)), false);
  });

  it("keeps a locale-only chunk and marks en missing on it", () => {
    const base = lesson({
      en: { text: "t", answer_md: "One\n\n![a](u)" },
      fr: { text: "t", answer_md: "Un\n\nDeux\n\n![a](u)" },
    });
    const draft = chunkDraftFromLesson(base, ids);
    assert.deepEqual(
      draft.chunks.map((c) => [Boolean(c.content.en), Boolean(c.content.fr)]),
      [
        [true, true],
        [false, true],
        [true, true],
      ],
    );
    assert.equal(chunkLocaleStatus(draft.chunks[1], "en"), "missing");
    assert.equal(localeMarkdown(draft.chunks, "en"), "One\n\n![a](u)");
    assert.equal(localeMarkdown(draft.chunks, "fr"), "Un\n\nDeux\n\n![a](u)");
  });

  it("grades each chunk per locale: translated, same, missing, stale", () => {
    const base = lesson({
      en: { text: "t", answer_md: "# Title\n\nBody\n\nThird" },
      es: { text: "t", answer_md: "# Título\n\nBody" },
    });
    let chunks = chunkDraftFromLesson(base, ids).chunks;
    assert.deepEqual(
      chunks.map((c) => chunkLocaleStatus(c, "es")),
      ["translated", "same", "missing"],
    );
    chunks = setBodyText(chunks, chunks[0].id, "en", "Title 2");
    assert.equal(chunkLocaleStatus(chunks[0], "es"), "stale");
    chunks = setBodyText(chunks, chunks[0].id, "es", "Título 2");
    assert.equal(chunkLocaleStatus(chunks[0], "es"), "translated");
    chunks = copyFromEn(chunks, chunks[2].id, "es");
    assert.equal(chunkLocaleStatus(chunks[2], "es"), "same");
    chunks = clearLocaleBody(chunks, chunks[2].id, "es");
    assert.equal(chunkLocaleStatus(chunks[2], "es"), "missing");
    assert.deepEqual(localeSummary(chunks, "es"), { translated: 1, same: 1, missing: 1, stale: 0, total: 3 });
    assert.deepEqual(localeSummary(chunks, "fr"), { translated: 0, same: 0, missing: 3, stale: 0, total: 3 });
  });

  it("falls back to en for missing chunks, and leaves a locale without any body empty", () => {
    const base = lesson({ en: { text: "t", answer_md: "One\n\nTwo" }, es: { text: "t", answer_md: "" } });
    let chunks = chunkDraftFromLesson(base, ids).chunks;
    assert.equal(localeMarkdown(chunks, "es"), "");
    chunks = setBodyText(chunks, chunks[1].id, "es", "Dos");
    assert.equal(localeMarkdown(chunks, "es"), "One\n\nDos");
    assert.equal(localeMarkdown(chunks, "fr"), "");
  });

  it("gives Save a canonical base so loading alone is not an edit", () => {
    const base = lesson({ en: { text: "t", answer_md: "* a\n\n* b\n\n\n1) c  " } });
    const canonical = canonicalLesson(base);
    assert.equal(canonical.localizations.en!.answer_md, "- a\n- b\n\n1. c  ");
    const draft = chunkDraftFromLesson(canonical, ids);
    assert.equal(isDirty(canonical, lessonFromChunkDraft(draft)), false);
  });
});

describe("chunk operations", () => {
  const start = () =>
    chunkDraftFromLesson(
      lesson({ en: { text: "t", answer_md: "# H\n\nPara one\n\n- a\n- b\n\n![pic](pending:p1)" }, es: { text: "t", answer_md: "# T" } }),
      ids,
    );

  it("inserts text for one locale and shared images for all listed locales", () => {
    const { chunks } = start();
    const text = insertChunk(chunks, 0, { kind: "paragraph", text: "new" }, "es", ["en", "es"], ids);
    assert.deepEqual(Object.keys(text.chunks[1].content), ["es"]);
    const image = insertChunk(chunks, -1, { kind: "image", alt: "x", url: "pending:p2" }, "es", ["en", "es"], ids);
    assert.deepEqual(Object.keys(image.chunks[0].content).sort(), ["en", "es"]);
    assert.equal(image.chunks[0].id, image.id);
  });

  it("duplicates, deletes and moves", () => {
    const { chunks } = start();
    const dup = duplicateChunk(chunks, chunks[0].id, ids);
    assert.equal(dup.chunks.length, 6);
    assert.deepEqual(dup.chunks[1].content, chunks[0].content);
    assert.notEqual(dup.chunks[1].id, chunks[0].id);
    assert.equal(deleteChunk(chunks, chunks[0].id).length, 4);
    assert.equal(moveChunk(chunks, chunks[0].id, 1)[1].id, chunks[0].id);
    assert.equal(moveChunk(chunks, chunks[0].id, -1)[0].id, chunks[0].id);
  });

  it("splits at the caret and continues lists", () => {
    const { chunks } = start();
    const para = splitChunk(chunks, chunks[1].id, "en", 4, ids)!;
    assert.deepEqual(para.chunks[1].content.en, { kind: "paragraph", text: "Para" });
    assert.deepEqual(para.chunks[2].content.en, { kind: "paragraph", text: " one" });
    const bullet = splitChunk(chunks, chunks[2].id, "en", 1, ids)!;
    assert.deepEqual(bullet.chunks[3].content.en, { kind: "bullet", indent: 0, text: "" });
    assert.equal(splitChunk(chunks, chunks[4].id, "en", 0, ids), null);
  });

  it("joins with the previous text chunk and removes an empty chunk after an image", () => {
    const { chunks } = start();
    const joined = joinWithPrevious(chunks, chunks[1].id, "en")!;
    assert.deepEqual(joined.chunks[0].content.en, { kind: "heading", level: 1, text: "HPara one" });
    assert.deepEqual([joined.id, joined.caret], [chunks[0].id, 1]);
    const after = insertChunk(chunks, 4, { kind: "paragraph", text: "" }, "en", ["en"], ids);
    const removed = joinWithPrevious(after.chunks, after.id, "en")!;
    assert.equal(removed.chunks.length, 5);
    assert.deepEqual([removed.id, removed.caret], [chunks[4].id, null]);
    assert.equal(joinWithPrevious(chunks, chunks[0].id, "en"), null);
  });

  it("takes the parser's reading after a structural edit only", () => {
    const { chunks } = start();
    const typed = setBodyText(chunks, chunks[1].id, "en", "- now a bullet");
    const normalized = normalizeChunk(typed, chunks[1].id, "en", ids);
    assert.equal(normalized.changed, true);
    assert.deepEqual(normalized.chunks[1].content.en, { kind: "bullet", indent: 0, text: "now a bullet" });
    const plain = normalizeChunk(setBodyText(chunks, chunks[1].id, "en", "Para one "), chunks[1].id, "en", ids);
    assert.equal(plain.changed, false);
    assert.deepEqual(plain.chunks[1].content.en, { kind: "paragraph", text: "Para one " });
    const split = normalizeChunk(setBodyText(chunks, chunks[1].id, "en", "a\n\nb"), chunks[1].id, "en", ids);
    assert.equal(split.chunks.length, 6);
    assert.equal(split.lastId, split.chunks[2].id);
  });

  it("applies structure to every locale and text to one", () => {
    const { chunks } = start();
    const kind = setKind(chunks, chunks[0].id, "paragraph");
    assert.deepEqual(kind[0].content.en, { kind: "paragraph", text: "H" });
    assert.deepEqual(kind[0].content.es, { kind: "paragraph", text: "T" });
    const level = setHeadingLevel(chunks, chunks[0].id, 3);
    assert.equal(level[0].content.es?.kind === "heading" && level[0].content.es.level, 3);
    const url = setImageUrl(chunks, chunks[4].id, "https://h/v1/files/x");
    assert.equal(url[4].content.en?.kind === "image" && url[4].content.en.url, "https://h/v1/files/x");
    const edited = updateBody(chunks, chunks[0].id, "en", { kind: "heading", level: 1, text: "H" });
    assert.equal(chunkLocaleStatus(edited[0], "es"), "stale");
  });

  it("removes a locale with its bodies and drops chunks left empty", () => {
    const draft: ChunkDraft = { ...start(), texts: { en: "t", es: "t" } };
    const extra = insertChunk(draft.chunks, 0, { kind: "paragraph", text: "solo es" }, "es", ["en", "es"], ids);
    const removed = removeLocale({ ...draft, chunks: extra.chunks }, "es");
    assert.equal(removed.texts.es, undefined);
    assert.equal(removed.chunks.length, 5);
    assert.equal(removed.chunks.every((c) => !c.content.es), true);
  });
});

describe("images and Save", () => {
  const base = lesson({ en: { text: "t", answer_md: `Intro\n\n![old](${STORAGE})` } });

  it("lists pending ids, maps uploads back into every locale, and plans the save", () => {
    let chunks = chunkDraftFromLesson(base, ids).chunks;
    chunks = insertChunk(chunks, 1, { kind: "image", alt: "new", url: "pending:p1" }, "en", ["en"], ids).chunks;
    chunks = deleteChunk(chunks, chunks[1].id);
    assert.deepEqual([...pendingIdsInChunks(chunks)], ["p1"]);
    assert.deepEqual(imageChunks(chunks, "en").map((i) => i.url), ["pending:p1"]);

    const draft: ChunkDraft = { ...base, texts: { en: "t" }, chunks };
    const plan = planSave(base, lessonFromChunkDraft(draft));
    assert.deepEqual(plan.uploads, ["p1"]);
    assert.deepEqual(plan.droppedUrls, [STORAGE]);
    assert.deepEqual(plan.summary, ["en"]);

    const uploaded = replacePendingUrls(chunks, new Map([["p1", "https://h/v1/files/new"]]));
    assert.equal(localeMarkdown(uploaded, "en"), "Intro\n\n![new](https://h/v1/files/new)");
    assert.deepEqual([...pendingIdsInChunks(uploaded)], []);
    const saved = lessonFromChunkDraft({ ...draft, chunks: uploaded });
    assert.deepEqual(planSave(saved, saved).steps, []);
  });

  it("never lists an image removed before Save", () => {
    let chunks = chunkDraftFromLesson(base, ids).chunks;
    const added = insertChunk(chunks, 1, { kind: "image", alt: "x", url: "pending:gone" }, "en", ["en"], ids);
    chunks = deleteChunk(added.chunks, added.id);
    const plan = planSave(base, lessonFromChunkDraft({ ...base, texts: { en: "t" }, chunks }));
    assert.deepEqual(plan.uploads, []);
    assert.deepEqual(plan.steps, []);
  });

  it("keeps a shared image in sync across locales when uploaded", () => {
    const two = lesson({ en: { text: "t", answer_md: "![a](pending:p1)" }, es: { text: "t", answer_md: "![b](pending:p1)" } });
    const chunks = replacePendingUrls(chunkDraftFromLesson(two, ids).chunks, new Map([["p1", "https://h/v1/files/z"]]));
    assert.equal(localeMarkdown(chunks, "en"), "![a](https://h/v1/files/z)");
    assert.equal(localeMarkdown(chunks, "es"), "![b](https://h/v1/files/z)");
    const chunk: Chunk = chunks[0];
    assert.equal(chunkLocaleStatus(chunk, "es"), "translated");
  });
});
