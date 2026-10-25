"use client";

import { FormEvent, useMemo, useState } from "react";
import { Badge, Button, Card, Input } from "@/components/ui/primitives";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import {
  ANSWER_MD_MAX,
  LOCALES,
  SUGGESTION_KINDS,
  SUGGESTION_TEXT_MAX,
  type Suggestion,
  type SuggestionKind,
} from "@/lib/coach/types";

type Response = { suggestions?: Suggestion[]; error?: string };

const textareaClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400";

function localizationFor(suggestion: Suggestion, locale: string) {
  return suggestion.localizations.find((row) => row.locale === locale);
}

export default function CoachSuggestionsPage() {
  const staffFetch = useStaffFetch();
  const { data, error, isLoading, mutate } = useStaffSWR<Response>("/api/coach/suggestions");
  const suggestions = useMemo(() => data?.suggestions ?? [], [data?.suggestions]);
  const [kindFilter, setKindFilter] = useState<"all" | SuggestionKind>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locale, setLocale] = useState("en");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [createSlug, setCreateSlug] = useState("");
  const [createKind, setCreateKind] = useState<SuggestionKind>("lesson");
  const [createText, setCreateText] = useState("");
  const [createAnswer, setCreateAnswer] = useState("");

  const [editText, setEditText] = useState("");
  const [editAnswer, setEditAnswer] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editPersonal, setEditPersonal] = useState(false);
  const [editPlan, setEditPlan] = useState(false);
  const [editUnlocks, setEditUnlocks] = useState("");
  const [editSection, setEditSection] = useState("");
  const [editSort, setEditSort] = useState(0);

  const filtered = useMemo(
    () =>
      kindFilter === "all"
        ? suggestions
        : suggestions.filter((row) => row.kind === kindFilter),
    [suggestions, kindFilter],
  );

  const selected = suggestions.find((row) => row.id === selectedId) ?? null;

  function selectSuggestion(row: Suggestion) {
    setSelectedId(row.id);
    setLocale("en");
    const loc = localizationFor(row, "en");
    setEditText(loc?.text ?? "");
    setEditAnswer(loc?.answer_md ?? "");
    setEditActive(row.active);
    setEditPersonal(row.requires_personal_data);
    setEditPlan(row.requires_plan_builder);
    setEditUnlocks(row.unlocks_after ?? "");
    setEditSection(row.section_slug ?? "");
    setEditSort(row.sort_order);
    setMessage(null);
  }

  function switchLocale(next: string) {
    if (!selected) return;
    setLocale(next);
    const loc = localizationFor(selected, next);
    setEditText(loc?.text ?? "");
    setEditAnswer(loc?.answer_md ?? "");
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
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
      setMessage(`Created ${result.suggestion.slug}`);
      await mutate();
      selectSuggestion(result.suggestion);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveMeta() {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      await staffFetch("/api/coach/suggestions", {
        method: "POST",
        body: JSON.stringify({
          action: "update",
          id: selected.id,
          active: editActive,
          requires_personal_data: editPersonal,
          requires_plan_builder: editPlan,
          unlocks_after: editUnlocks,
          section_slug: editSection,
          sort_order: editSort,
        }),
      });
      setMessage("Flags saved.");
      await mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveLocalization() {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      await staffFetch("/api/coach/suggestions", {
        method: "POST",
        body: JSON.stringify({
          action: "upsert_localization",
          suggestion_id: selected.id,
          locale,
          text: editText,
          answer_md: editAnswer,
        }),
      });
      setMessage(`Saved ${locale} localization.`);
      await mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeSuggestion() {
    if (!selected) return;
    if (!window.confirm(`Delete suggestion ${selected.slug}?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await staffFetch("/api/coach/suggestions", {
        method: "POST",
        body: JSON.stringify({ action: "delete", id: selected.id }),
      });
      setSelectedId(null);
      setMessage("Deleted.");
      await mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(file: File) {
    if (!selected) return;
    setBusy(true);
    setMessage(null);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result ?? "");
          const base64 = result.includes(",") ? result.split(",")[1] : result;
          resolve(base64);
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });
      const uploaded = (await staffFetch("/api/coach/media", {
        method: "POST",
        body: JSON.stringify({
          mimeType: file.type || "image/png",
          data,
          slug: selected.slug,
          locale,
          fileName: file.name,
        }),
      })) as { markdown: string };
      setEditAnswer((current) =>
        current.trim() ? `${current.trim()}\n\n${uploaded.markdown}` : uploaded.markdown,
      );
      setMessage("Image uploaded; markdown inserted.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Coach suggestions</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Empty-state prompts and tutorial lessons. Chip text ≤ {SUGGESTION_TEXT_MAX}; predefined{" "}
          <code className="text-xs">answer_md</code> ≤ {ANSWER_MD_MAX}. Images go to{" "}
          <code className="text-xs">coach-media</code>.
        </p>
      </div>

      {(message || error) && (
        <p className="text-sm text-zinc-700">{message ?? error?.message}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {(["all", ...SUGGESTION_KINDS] as const).map((kind) => (
          <Button
            key={kind}
            type="button"
            variant={kindFilter === kind ? "default" : "secondary"}
            onClick={() => setKindFilter(kind)}
          >
            {kind}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="space-y-2 self-start">
          {isLoading && <p className="text-sm text-zinc-500">Loading…</p>}
          <ul className="max-h-[28rem] space-y-1 overflow-auto text-sm">
            {filtered.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className={`w-full rounded-md px-2 py-1.5 text-left hover:bg-zinc-100 ${
                    selectedId === row.id ? "bg-zinc-900 text-white hover:bg-zinc-800" : ""
                  }`}
                  onClick={() => selectSuggestion(row)}
                >
                  <span className="font-medium">{row.slug}</span>
                  <span className="ml-2 text-xs opacity-70">{row.kind}</span>
                  {!row.active && (
                    <Badge className="ml-2 bg-amber-100 text-amber-800">off</Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <form onSubmit={onCreate} className="space-y-2 border-t border-zinc-100 pt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">New</p>
            <Input
              placeholder="slug"
              value={createSlug}
              onChange={(event) => setCreateSlug(event.target.value)}
              required
            />
            <select
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
              className={textareaClass}
              rows={3}
              placeholder="optional en answer_md"
              value={createAnswer}
              maxLength={ANSWER_MD_MAX}
              onChange={(event) => setCreateAnswer(event.target.value)}
            />
            <Button type="submit" disabled={busy}>
              Create
            </Button>
          </form>
        </Card>

        {selected ? (
          <div className="space-y-3">
            <Card className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-medium">{selected.slug}</h2>
                <Badge>{selected.kind}</Badge>
                <Button type="button" variant="danger" disabled={busy} onClick={removeSuggestion}>
                  Delete
                </Button>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editActive}
                    onChange={(event) => setEditActive(event.target.checked)}
                  />
                  Active
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editPersonal}
                    onChange={(event) => setEditPersonal(event.target.checked)}
                  />
                  Requires personal data
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editPlan}
                    onChange={(event) => setEditPlan(event.target.checked)}
                  />
                  Requires plan builder
                </label>
                <label className="block">
                  <span className="mb-1 block text-zinc-500">Sort order</span>
                  <Input
                    type="number"
                    value={editSort}
                    onChange={(event) => setEditSort(Number(event.target.value))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-zinc-500">Unlocks after (lesson slug)</span>
                  <Input
                    value={editUnlocks}
                    onChange={(event) => setEditUnlocks(event.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-zinc-500">Section slug</span>
                  <Input
                    value={editSection}
                    onChange={(event) => setEditSection(event.target.value)}
                  />
                </label>
              </div>
              <Button type="button" disabled={busy} onClick={saveMeta}>
                Save flags
              </Button>
            </Card>

            <Card className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {LOCALES.map((item) => (
                  <Button
                    key={item}
                    type="button"
                    variant={locale === item ? "default" : "secondary"}
                    onClick={() => switchLocale(item)}
                  >
                    {item}
                    {localizationFor(selected, item) ? "" : " ·"}
                  </Button>
                ))}
              </div>

              <label className="block text-sm">
                <span className="mb-1 flex justify-between text-zinc-500">
                  <span>Chip text</span>
                  <span>
                    {editText.length}/{SUGGESTION_TEXT_MAX}
                  </span>
                </span>
                <Input
                  value={editText}
                  maxLength={SUGGESTION_TEXT_MAX}
                  onChange={(event) => setEditText(event.target.value)}
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 flex justify-between text-zinc-500">
                  <span>answer_md</span>
                  <span>
                    {editAnswer.length}/{ANSWER_MD_MAX}
                  </span>
                </span>
                <textarea
                  className={`${textareaClass} font-mono`}
                  rows={12}
                  value={editAnswer}
                  maxLength={ANSWER_MD_MAX}
                  onChange={(event) => setEditAnswer(event.target.value)}
                />
              </label>

              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                  <span className="rounded-md border border-zinc-300 bg-white px-3 py-2 hover:bg-zinc-50">
                    Upload image
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={busy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void onUpload(file);
                      event.target.value = "";
                    }}
                  />
                </label>
                <Button type="button" disabled={busy || !editText.trim()} onClick={saveLocalization}>
                  Save {locale}
                </Button>
              </div>

              {editAnswer.trim() && (
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Preview (raw markdown)
                  </p>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-zinc-800">
                    {editAnswer}
                  </pre>
                </div>
              )}
            </Card>
          </div>
        ) : (
          <Card>
            <p className="text-sm text-zinc-500">Select a suggestion to edit.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
