"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Input } from "@/components/ui/primitives";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import { SuggestionWorkspace } from "@/components/coach/suggestion-workspace";
import { cn } from "@/lib/utils";
import {
  ANSWER_MD_MAX,
  LOCALES,
  SUGGESTION_KINDS,
  SUGGESTION_TEXT_MAX,
  type Suggestion,
  type SuggestionKind,
} from "@/lib/coach/types";

type Response = { suggestions?: Suggestion[]; error?: string };

const UNSAVED_MESSAGE = "You have unsaved changes. Leave and discard them?";

/**
 * Warns before the page is unloaded or an in-app link is followed while `dirty`. Next's router has
 * no navigation events, so link clicks are intercepted at the document in the capture phase.
 */
function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older Chromium needs returnValue set to show the prompt.
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!anchor || anchor.getAttribute("target") === "_blank") return;
      const href = anchor.getAttribute("href") ?? "";
      if (href.startsWith("#")) return;
      if (!window.confirm(UNSAVED_MESSAGE)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}

export default function CoachSuggestionsPage() {
  const staffFetch = useStaffFetch();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, isLoading, mutate } = useStaffSWR<Response>("/api/coach/suggestions");
  const suggestions = useMemo(() => data?.suggestions ?? [], [data?.suggestions]);
  const [kindFilter, setKindFilter] = useState<"all" | SuggestionKind>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [createSlug, setCreateSlug] = useState("");
  const [createKind, setCreateKind] = useState<SuggestionKind>("lesson");
  const [createText, setCreateText] = useState("");
  const [createAnswer, setCreateAnswer] = useState("");

  useUnsavedGuard(dirty);

  const filtered = useMemo(
    () => (kindFilter === "all" ? suggestions : suggestions.filter((row) => row.kind === kindFilter)),
    [suggestions, kindFilter],
  );
  const selected = suggestions.find((row) => row.id === selectedId) ?? null;

  const confirmLeave = useCallback(async () => {
    if (!dirty) return true;
    return confirm({
      title: "Discard unsaved changes?",
      description: "The lesson you are editing has unsaved edits. Switching discards them.",
      confirmLabel: "Discard",
      variant: "danger",
    });
  }, [dirty, confirm]);

  async function selectSuggestion(row: Suggestion) {
    if (row.id === selectedId) return;
    if (!(await confirmLeave())) return;
    setDirty(false);
    setSelectedId(row.id);
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!(await confirmLeave())) return;
    setBusy(true);
    try {
      const result = (await staffFetch("/api/coach/suggestions", {
        method: "POST",
        body: JSON.stringify({
          slug: createSlug.trim(),
          kind: createKind,
          en_text: createText.trim(),
          en_answer_md: createAnswer.trim() || null,
        }),
      })) as { suggestion: Suggestion };
      setCreateSlug("");
      setCreateText("");
      setCreateAnswer("");
      setShowCreate(false);
      toast.success(`Created ${result.suggestion.slug}.`);
      await mutate();
      setDirty(false);
      setSelectedId(result.suggestion.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeSuggestion() {
    if (!selected) return;
    const ok = await confirm({
      title: `Delete ${selected.slug}?`,
      description: "Every localization is deleted. Images in Storage are kept.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await staffFetch("/api/coach/suggestions", {
        method: "POST",
        body: JSON.stringify({ action: "delete", id: selected.id }),
      });
      setDirty(false);
      setSelectedId(null);
      toast.success(`Deleted ${selected.slug}.`);
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[520px] flex-col gap-3 lg:h-[calc(100dvh-8.5rem)]">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Coach suggestions</h1>
          <p className="mt-0.5 text-sm text-zinc-600">
            Empty-state prompts and tutorial lessons, edited as a draft and written on Save. The phone
            shows the draft as the Android app renders it.
          </p>
        </div>
        <div className="flex gap-1">
          {(["all", ...SUGGESTION_KINDS] as const).map((kind) => (
            <Button
              key={kind}
              type="button"
              variant={kindFilter === kind ? "default" : "secondary"}
              className="h-8 px-2.5"
              onClick={() => setKindFilter(kind)}
            >
              {kind}
            </Button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error.message}</p>}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Card className="flex min-h-0 flex-col gap-2 py-3 lg:max-h-full">
          {isLoading && <p className="text-sm text-zinc-500">Loading…</p>}
          <ul className="min-h-0 flex-1 space-y-0.5 overflow-auto text-sm" aria-label="Suggestions">
            {filtered.map((row) => {
              const missing = LOCALES.filter((locale) => !row.localizations.some((l) => l.locale === locale));
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    aria-current={selectedId === row.id || undefined}
                    className={cn(
                      "w-full rounded-md px-2 py-1.5 text-left hover:bg-zinc-100",
                      selectedId === row.id && "bg-zinc-900 text-white hover:bg-zinc-800",
                    )}
                    onClick={() => void selectSuggestion(row)}
                  >
                    <span className="block truncate font-medium">{row.slug}</span>
                    <span className="flex flex-wrap items-center gap-1 text-[11px] opacity-70">
                      {row.kind}
                      {row.section_slug && ` · ${row.section_slug}`}
                      {` · #${row.sort_order}`}
                      {!row.active && <Badge className="bg-amber-100 px-1.5 py-0 text-amber-800">off</Badge>}
                      {missing.length > 0 && (
                        <span title={`Missing locales: ${missing.join(", ")}`}>· {4 - missing.length}/4</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-zinc-100 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="h-8 w-full"
              aria-expanded={showCreate}
              onClick={() => setShowCreate((v) => !v)}
            >
              {showCreate ? "Cancel" : "New suggestion"}
            </Button>
            {showCreate && (
              <form onSubmit={onCreate} className="mt-2 space-y-2">
                <Input
                  placeholder="slug"
                  value={createSlug}
                  onChange={(event) => setCreateSlug(event.target.value)}
                  required
                  autoFocus
                />
                <select
                  aria-label="Kind"
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  value={createKind}
                  onChange={(event) => setCreateKind(event.target.value as SuggestionKind)}
                >
                  {SUGGESTION_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="en chip text"
                  value={createText}
                  maxLength={SUGGESTION_TEXT_MAX}
                  onChange={(event) => setCreateText(event.target.value)}
                  required
                />
                <textarea
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400"
                  rows={3}
                  placeholder="optional en answer_md"
                  value={createAnswer}
                  maxLength={ANSWER_MD_MAX}
                  onChange={(event) => setCreateAnswer(event.target.value)}
                />
                <Button type="submit" disabled={busy} className="w-full">
                  Create
                </Button>
              </form>
            )}
          </div>
        </Card>

        {selected ? (
          <SuggestionWorkspace
            key={selected.id}
            suggestion={selected}
            suggestions={suggestions}
            onDirtyChange={setDirty}
            onSaved={mutate}
            onDelete={removeSuggestion}
            busy={busy}
          />
        ) : (
          <Card className="self-start">
            <p className="text-sm text-zinc-500">Select a suggestion to edit it with a phone preview.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
