import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  articleStatus,
  articlesReferencing,
  changedLocales,
  citesSource,
  draftFromArticle,
  draftWarnings,
  editorialHint,
  emptyDraft,
  fromLocalInputValue,
  insertImageMarkdown,
  isDirty,
  localizationInput,
  metaInput,
  normalizeDraft,
  planSave,
  presentLocales,
  toLocalInputValue,
  validateDraft,
  type ArticleDraft,
} from "./draft.ts";
import { ARTICLE_OPERATIONS } from "./operations.ts";
import type { Article } from "./types.ts";

const article: Article = {
  id: "a1",
  slug: "creatine-brief",
  kind: "science_brief",
  active: true,
  published_at: null,
  cover_image_url: null,
  created_at: "",
  updated_at: "",
  is_published: false,
  localizations: [
    { article_id: "a1", locale: "en", title: "Creatine", summary: null, body_md: "Takeaway. doi:10.1000/xyz123", created_at: "", updated_at: "" },
    { article_id: "a1", locale: "es", title: "Creatina", summary: "Resumen", body_md: "Texto https://doi.org/10.1000/xyz123", created_at: "", updated_at: "" },
  ],
};

const base = draftFromArticle(article);
const withLoc = (draft: ArticleDraft, locale: "en" | "es" | "fr" | "de", patch: Partial<ArticleDraft["localizations"]["en"]>): ArticleDraft => ({
  ...draft,
  localizations: { ...draft.localizations, [locale]: { ...draft.localizations[locale], ...patch } },
});

describe("draft state", () => {
  it("builds the draft from the saved article, blank for absent locales", () => {
    assert.equal(base.localizations.en.title, "Creatine");
    assert.equal(base.localizations.en.summary, "");
    assert.deepEqual(presentLocales(base), ["en", "es"]);
    assert.equal(isDirty(base, base), false);
    assert.equal(base.cover_image_url, "");
  });

  it("tracks metadata and locale edits", () => {
    assert.equal(isDirty(base, { ...base, active: false }), true);
    const edited = withLoc(base, "es", { title: "Creatina 2" });
    assert.deepEqual(changedLocales(base, edited), ["es"]);
  });
});

describe("validation", () => {
  it("accepts a complete article", () => {
    assert.deepEqual(validateDraft(base), []);
  });

  it("blocks a missing or half-filled en", () => {
    const noEn = withLoc(base, "en", { title: "", summary: "", body_md: "" });
    assert.match(validateDraft(noEn)[0].message, /en is required/);
    const halfEn = withLoc(base, "en", { body_md: "" });
    assert.ok(validateDraft(halfEn).some((p) => /body is required/.test(p.message)));
  });

  it("blocks a half-filled other locale but not an absent one", () => {
    assert.deepEqual(validateDraft(withLoc(base, "fr", { title: "", summary: "", body_md: "" })), []);
    assert.ok(validateDraft(withLoc(base, "fr", { title: "Titre" })).some((p) => p.locale === "fr"));
  });

  it("checks the slug, the cover and the lengths", () => {
    assert.ok(validateDraft({ ...base, slug: "" }).length > 0);
    assert.ok(validateDraft({ ...base, slug: "Bad Slug" }).length > 0);
    assert.ok(validateDraft({ ...base, slug: "x".repeat(81) }).length > 0);
    assert.ok(validateDraft({ ...base, cover_image_url: "http://x/y" }).length > 0);
    assert.deepEqual(validateDraft({ ...base, cover_image_url: "https://h/v1/files/1" }), []);
    assert.ok(validateDraft(withLoc(base, "en", { title: "t".repeat(121) })).length > 0);
    assert.ok(validateDraft(withLoc(base, "en", { summary: "s".repeat(301) })).length > 0);
    assert.ok(validateDraft(withLoc(base, "en", { body_md: "b".repeat(16001) })).length > 0);
    assert.deepEqual(validateDraft(withLoc(base, "en", { body_md: "b".repeat(16000) })), []);
  });
});

describe("warnings and editorial hints", () => {
  it("warns about every missing non-en locale", () => {
    const messages = draftWarnings(base).map((w) => w.locale);
    assert.deepEqual(messages, ["fr", "de"]);
  });

  it("asks a science brief for its source, an app update does not need one", () => {
    const noSource = withLoc(base, "es", { body_md: "Solo texto" });
    assert.ok(draftWarnings(noSource).some((w) => w.locale === "es" && /source/.test(w.message)));
    assert.ok(!draftWarnings({ ...noSource, kind: "app_update" }).some((w) => /source/.test(w.message)));
    assert.equal(citesSource("see 10.1234/abcd"), true);
    assert.equal(citesSource("no reference here"), false);
  });

  it("warns about a long body", () => {
    assert.ok(draftWarnings(withLoc(base, "en", { body_md: `doi:10.1000/x ${"a".repeat(3000)}` })).some((w) => /long/.test(w.message)));
  });

  it("hints at the source only for science briefs", () => {
    assert.ok(editorialHint("science_brief").some((line) => /DOI/.test(line)));
    assert.ok(!editorialHint("app_update").some((line) => /DOI/.test(line)));
  });
});

describe("status", () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  it("derives draft, scheduled, published and retired", () => {
    assert.equal(articleStatus({ active: true, published_at: null }, now), "draft");
    assert.equal(articleStatus({ active: true, published_at: "2026-11-16T00:00:00Z" }, now), "scheduled");
    assert.equal(articleStatus({ active: true, published_at: "2026-11-14T00:00:00Z" }, now), "published");
    assert.equal(articleStatus({ active: false, published_at: "2026-11-14T00:00:00Z" }, now), "retired");
  });

  it("round-trips the datetime-local value", () => {
    const iso = "2026-11-15T10:30:00.000Z";
    assert.equal(fromLocalInputValue(toLocalInputValue(iso)), iso);
    assert.equal(toLocalInputValue(null), "");
    assert.equal(fromLocalInputValue(""), null);
    assert.equal(fromLocalInputValue("nope"), null);
  });
});

describe("save plan", () => {
  it("is empty when nothing changed", () => {
    assert.deepEqual(planSave(base, base), { meta: null, upserts: [], deletes: [] });
  });

  it("writes publish, edits and new locales, deletes cleared ones", () => {
    let draft: ArticleDraft = { ...base, published_at: "2026-11-15T10:00:00.000Z", cover_image_url: " https://h/v1/files/1 " };
    draft = withLoc(draft, "en", { title: "Creatine 2" });
    draft = withLoc(draft, "fr", { title: "Creatine", body_md: "Texte" });
    draft = withLoc(draft, "es", { title: "", summary: "", body_md: "" });
    assert.deepEqual(planSave(base, draft), {
      meta: { published_at: "2026-11-15T10:00:00.000Z", cover_image_url: "https://h/v1/files/1" },
      upserts: ["en", "fr"],
      deletes: ["es"],
    });
  });

  it("never plans to delete en", () => {
    const draft = withLoc(base, "en", { title: "", summary: "", body_md: "" });
    assert.deepEqual(planSave(base, draft).deletes, []);
  });

  it("builds the rows to send", () => {
    const draft = withLoc(emptyDraft(), "en", { title: " T ", summary: " ", body_md: " B " });
    assert.deepEqual(localizationInput(draft, "en"), { locale: "en", title: "T", summary: null, body_md: "B" });
    assert.deepEqual(metaInput({ ...draft, slug: "s", cover_image_url: " " }), {
      slug: "s",
      kind: "app_update",
      active: true,
      published_at: null,
      cover_image_url: null,
    });
  });
});

describe("usage", () => {
  it("finds the articles that embed an image, as cover or in a body", () => {
    const url = "https://h/v1/files/11111111-1111-4111-8111-111111111111";
    const rows = [
      { slug: "a", cover_image_url: url, localizations: [] },
      { slug: "b", cover_image_url: null, localizations: [{ body_md: `![x](${url})` }] },
      { slug: "c", cover_image_url: null, localizations: [{ body_md: "none" }] },
    ] as unknown as Article[];
    assert.deepEqual(articlesReferencing(rows, url), ["a", "b"]);
  });
});

describe("operations", () => {
  it("are fixed, named and unique", () => {
    for (const [name, document] of Object.entries(ARTICLE_OPERATIONS)) {
      assert.match(document, new RegExp(`^(query|mutation) ${name}\\b`), name);
    }
    assert.equal(new Set(Object.values(ARTICLE_OPERATIONS)).size, Object.keys(ARTICLE_OPERATIONS).length);
  });
});

describe("editing helpers", () => {
  it("inserts an image on a line of its own", () => {
    assert.deepEqual(insertImageMarkdown("One\n\nTwo", 3, 3, "a b", "https://h/1"), {
      body: "One\n\n![a b](https://h/1)\n\nTwo",
      cursor: 3 + "\n\n![a b](https://h/1)".length,
    });
    assert.equal(insertImageMarkdown("", 0, 0, "x", "https://h/1").body, "![x](https://h/1)");
    assert.equal(insertImageMarkdown("Text", 4, 4, "x", "https://h/1").body, "Text\n\n![x](https://h/1)");
    assert.equal(insertImageMarkdown("Text\n\n", 6, 6, "x", "https://h/1").body, "Text\n\n![x](https://h/1)");
  });

  it("normalizes whitespace and blank locales", () => {
    const messy = withLoc(withLoc(base, "es", { title: " Hola ", body_md: "\nTexto\n" }), "fr", { title: " ", body_md: "  " });
    const normal = normalizeDraft({ ...messy, slug: " s ", cover_image_url: " " });
    assert.equal(normal.slug, "s");
    assert.equal(normal.cover_image_url, "");
    assert.equal(normal.localizations.es.title, "Hola");
    assert.equal(normal.localizations.es.body_md, "Texto");
    assert.equal(normal.localizations.fr.title, "");
  });
});
