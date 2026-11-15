"use client";

import { useCallback, useMemo, useState } from "react";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { useConfirm } from "@/components/ui/confirm";
import { useStaffSWR } from "@/hooks/use-staff-fetch";
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";
import { ArticleWorkspace, STATUS_STYLES } from "@/components/articles/article-workspace";
import { articleStatus } from "@/lib/articles/draft";
import { ARTICLE_KINDS, ARTICLE_KIND_LABELS, type Article, type ArticleKind } from "@/lib/articles/types";
import { LOCALES } from "@/lib/coach/types";
import { cn } from "@/lib/utils";

type Response = { articles?: Article[]; error?: string };

/** Coach News: app updates and science briefs (`assistant.articles`), edited by staff without a migration. */
export default function CoachArticlesPage() {
  const confirm = useConfirm();
  const { data, error, isLoading, mutate } = useStaffSWR<Response>("/api/articles");
  const articles = useMemo(() => data?.articles ?? [], [data?.articles]);
  const [kindFilter, setKindFilter] = useState<"all" | ArticleKind>("all");
  /** An article id, "new", or null. */
  const [selected, setSelected] = useState<string | null>(null);
  const [newKind, setNewKind] = useState<ArticleKind>("app_update");
  const [dirty, setDirty] = useState(false);

  useUnsavedGuard(dirty);

  const filtered = useMemo(
    () => (kindFilter === "all" ? articles : articles.filter((row) => row.kind === kindFilter)),
    [articles, kindFilter],
  );
  const current = selected && selected !== "new" ? (articles.find((row) => row.id === selected) ?? null) : null;

  const confirmLeave = useCallback(async () => {
    if (!dirty) return true;
    return confirm({
      title: "Discard unsaved changes?",
      description: "The article you are editing has unsaved edits. Switching discards them.",
      confirmLabel: "Discard",
      variant: "danger",
    });
  }, [dirty, confirm]);

  async function select(next: string | null, kind?: ArticleKind) {
    if (next === selected) return;
    if (!(await confirmLeave())) return;
    setDirty(false);
    if (kind) setNewKind(kind);
    setSelected(next);
  }

  const onSaved = useCallback(
    async (article?: Article) => {
      await mutate();
      if (article && selected === "new") {
        setDirty(false);
        setSelected(article.id);
      }
    },
    [mutate, selected],
  );

  const onDeleted = useCallback(async () => {
    setDirty(false);
    setSelected(null);
    await mutate();
  }, [mutate]);

  const count = (kind: "all" | ArticleKind) => (kind === "all" ? articles.length : articles.filter((row) => row.kind === kind).length);

  return (
    <div className="flex min-h-[520px] flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Coach News</h1>
          <p className="mt-0.5 text-sm text-zinc-600">
            App updates and science briefs shown in the Coach tab. Draft, publish and unpublish without a release;{" "}
            <code>en</code> is required, other languages fall back to it.
          </p>
        </div>
        <div className="flex gap-1">
          {(["all", ...ARTICLE_KINDS] as const).map((kind) => (
            <Button
              key={kind}
              type="button"
              variant={kindFilter === kind ? "default" : "secondary"}
              className="h-8 px-2.5"
              onClick={() => setKindFilter(kind)}
            >
              {kind === "all" ? "All" : ARTICLE_KIND_LABELS[kind]} ({count(kind)})
            </Button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error.message}</p>}

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="flex flex-col gap-2 py-3 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)] lg:self-start">
          <div className="flex gap-1">
            <Button
              type="button"
              className="h-8 flex-1"
              onClick={() => void select("new", kindFilter === "all" ? "app_update" : kindFilter)}
            >
              New article
            </Button>
          </div>
          {isLoading && <p className="text-sm text-zinc-500">Loading…</p>}
          {!isLoading && filtered.length === 0 && <p className="text-sm text-zinc-500">No articles yet.</p>}
          <ul className="min-h-0 flex-1 space-y-0.5 overflow-auto text-sm" aria-label="Articles">
            {filtered.map((row) => {
              const status = articleStatus(row);
              const title = row.localizations.find((l) => l.locale === "en")?.title ?? row.slug;
              const have = LOCALES.filter((locale) => row.localizations.some((l) => l.locale === locale)).length;
              const active = selected === row.id;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    aria-current={active || undefined}
                    className={cn(
                      "w-full rounded-md px-2 py-1.5 text-left hover:bg-zinc-100",
                      active && "bg-zinc-900 text-white hover:bg-zinc-800",
                    )}
                    onClick={() => void select(row.id)}
                  >
                    <span className="block truncate font-medium">{title}</span>
                    <span className="block truncate text-[11px] opacity-70">{row.slug}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] opacity-90">
                      <Badge className={cn("px-1.5 py-0", STATUS_STYLES[status])}>{status}</Badge>
                      <span>{ARTICLE_KIND_LABELS[row.kind]}</span>
                      <span title={have < LOCALES.length ? "Some locales are missing: users read en there" : "All locales"}>
                        · {have}/{LOCALES.length}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        {selected === "new" ? (
          <ArticleWorkspace
            key={`new-${newKind}`}
            article={null}
            initialKind={newKind}
            onDirtyChange={setDirty}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
        ) : current ? (
          <ArticleWorkspace
            key={current.id}
            article={current}
            onDirtyChange={setDirty}
            onSaved={onSaved}
            onDeleted={onDeleted}
          />
        ) : (
          <Card className="self-start">
            <p className="text-sm text-zinc-500">Select an article, or create one, to edit it with a preview.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
