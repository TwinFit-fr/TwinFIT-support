"use client";

import { FormEvent, useMemo, useState } from "react";
import { Badge, Button, Card, Input } from "@/components/ui/primitives";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import {
  CARD_STATUSES,
  LOCALES,
  embeddingIsStale,
  type KnowledgeCard,
  type KnowledgeSource,
} from "@/lib/coach/types";

type Response = {
  sources?: KnowledgeSource[];
  cards?: KnowledgeCard[];
  error?: string;
};

const textareaClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-400";

export default function CoachKnowledgePage() {
  const staffFetch = useStaffFetch();
  const { data, error, isLoading, mutate } = useStaffSWR<Response>("/api/coach/knowledge");
  const sources = useMemo(() => data?.sources ?? [], [data?.sources]);
  const cards = useMemo(() => data?.cards ?? [], [data?.cards]);
  const [tab, setTab] = useState<"cards" | "sources">("cards");
  const [statusFilter, setStatusFilter] = useState<"all" | string>("all");
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [sourceForm, setSourceForm] = useState({
    id: "",
    kind: "paper",
    title: "",
    authors: "",
    year: "",
    doi: "",
    url: "",
    license: "",
  });

  const [cardForm, setCardForm] = useState({
    id: "",
    source_id: "",
    topic: "",
    locale: "en",
    title: "",
    summary_md: "",
    key_claims: "",
    evidence_level: "",
    population: "",
    practical_takeaway: "",
    caveats: "",
    tags: "",
    status: "draft",
  });

  const filteredCards = useMemo(
    () =>
      statusFilter === "all"
        ? cards
        : cards.filter((card) => card.status === statusFilter),
    [cards, statusFilter],
  );

  const selectedCard = cards.find((card) => card.id === selectedCardId) ?? null;

  function editCard(card: KnowledgeCard) {
    setSelectedCardId(card.id);
    setCardForm({
      id: card.id,
      source_id: card.source_id,
      topic: card.topic ?? "",
      locale: card.locale,
      title: card.title,
      summary_md: card.summary_md ?? "",
      key_claims: (card.key_claims ?? []).join("\n"),
      evidence_level: card.evidence_level ?? "",
      population: card.population ?? "",
      practical_takeaway: card.practical_takeaway ?? "",
      caveats: card.caveats ?? "",
      tags: (card.tags ?? []).join(", "),
      status: card.status,
    });
  }

  function editSource(source: KnowledgeSource) {
    setSourceForm({
      id: source.id,
      kind: source.kind,
      title: source.title,
      authors: source.authors ?? "",
      year: source.year == null ? "" : String(source.year),
      doi: source.doi ?? "",
      url: source.url ?? "",
      license: source.license ?? "",
    });
    setTab("sources");
  }

  async function saveSource(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await staffFetch("/api/coach/knowledge", {
        method: "POST",
        body: JSON.stringify({
          action: "upsert_source",
          id: sourceForm.id || undefined,
          kind: sourceForm.kind,
          title: sourceForm.title,
          authors: sourceForm.authors,
          year: sourceForm.year,
          doi: sourceForm.doi,
          url: sourceForm.url,
          license: sourceForm.license,
        }),
      });
      setSourceForm({
        id: "",
        kind: "paper",
        title: "",
        authors: "",
        year: "",
        doi: "",
        url: "",
        license: "",
      });
      setMessage("Source saved.");
      await mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Source save failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSource(id: string) {
    if (!window.confirm("Delete this source? The database rejects deletes that still have cards.")) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await staffFetch("/api/coach/knowledge", {
        method: "POST",
        body: JSON.stringify({ action: "delete_source", id }),
      });
      setMessage("Source deleted.");
      await mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveCard(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = (await staffFetch("/api/coach/knowledge", {
        method: "POST",
        body: JSON.stringify({
          action: "upsert_card",
          ...cardForm,
          id: cardForm.id || undefined,
        }),
      })) as { card: KnowledgeCard };
      setMessage("Card saved.");
      await mutate();
      editCard(result.card);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Card save failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCard(id: string) {
    if (!window.confirm("Delete this card?")) return;
    setBusy(true);
    setMessage(null);
    try {
      await staffFetch("/api/coach/knowledge", {
        method: "POST",
        body: JSON.stringify({ action: "delete_card", id }),
      });
      setSelectedCardId(null);
      setCardForm((current) => ({ ...current, id: "", title: "" }));
      setMessage("Card deleted.");
      await mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  async function embedCard(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      await staffFetch("/api/coach/knowledge", {
        method: "POST",
        body: JSON.stringify({ action: "embed_card", id }),
      });
      setMessage("Embedding stored.");
      await mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Embed failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Coach knowledge base</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Review sources and cards. Stale embeddings show when{" "}
          <code className="text-xs">embedded_hash ≠ content_hash</code>. Embed uses the server
          Mistral key and staff JWT.
        </p>
      </div>

      {(message || error) && (
        <p className="text-sm text-zinc-700">{message ?? error?.message}</p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant={tab === "cards" ? "default" : "secondary"}
          onClick={() => setTab("cards")}
        >
          Cards
        </Button>
        <Button
          type="button"
          variant={tab === "sources" ? "default" : "secondary"}
          onClick={() => setTab("sources")}
        >
          Sources
        </Button>
      </div>

      {isLoading && <p className="text-sm text-zinc-500">Loading…</p>}

      {tab === "sources" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <form className="space-y-2" onSubmit={saveSource}>
              <h2 className="font-medium">{sourceForm.id ? "Edit source" : "New source"}</h2>
              <Input
                placeholder="title"
                value={sourceForm.title}
                onChange={(event) => setSourceForm((current) => ({ ...current, title: event.target.value }))}
                required
              />
              <Input
                placeholder="kind"
                value={sourceForm.kind}
                onChange={(event) => setSourceForm((current) => ({ ...current, kind: event.target.value }))}
              />
              <Input
                placeholder="authors"
                value={sourceForm.authors}
                onChange={(event) => setSourceForm((current) => ({ ...current, authors: event.target.value }))}
              />
              <Input
                placeholder="year"
                value={sourceForm.year}
                onChange={(event) => setSourceForm((current) => ({ ...current, year: event.target.value }))}
              />
              <Input
                placeholder="doi"
                value={sourceForm.doi}
                onChange={(event) => setSourceForm((current) => ({ ...current, doi: event.target.value }))}
              />
              <Input
                placeholder="url"
                value={sourceForm.url}
                onChange={(event) => setSourceForm((current) => ({ ...current, url: event.target.value }))}
              />
              <Input
                placeholder="license"
                value={sourceForm.license}
                onChange={(event) => setSourceForm((current) => ({ ...current, license: event.target.value }))}
              />
              <div className="flex gap-2">
                <Button type="submit" disabled={busy}>
                  Save source
                </Button>
                {sourceForm.id && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setSourceForm({
                        id: "",
                        kind: "paper",
                        title: "",
                        authors: "",
                        year: "",
                        doi: "",
                        url: "",
                        license: "",
                      })
                    }
                  >
                    Clear
                  </Button>
                )}
              </div>
            </form>
          </Card>

          <Card className="space-y-2">
            {sources.map((source) => (
              <div
                key={source.id}
                className="flex items-start justify-between gap-2 rounded-md border border-zinc-100 p-2 text-sm"
              >
                <div>
                  <p className="font-medium">{source.title}</p>
                  <p className="text-xs text-zinc-500">
                    {source.kind}
                    {source.year ? ` · ${source.year}` : ""} ·{" "}
                    {cards.filter((card) => card.source_id === source.id).length} cards
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button type="button" variant="secondary" onClick={() => editSource(source)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={busy}
                    onClick={() => deleteSource(source.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Card className="space-y-2 self-start">
            <div className="flex flex-wrap gap-1">
              {(["all", ...CARD_STATUSES] as const).map((status) => (
                <Button
                  key={status}
                  type="button"
                  variant={statusFilter === status ? "default" : "secondary"}
                  onClick={() => setStatusFilter(status)}
                >
                  {status}
                </Button>
              ))}
            </div>
            <ul className="max-h-[32rem] space-y-1 overflow-auto text-sm">
              {filteredCards.map((card) => (
                <li key={card.id}>
                  <button
                    type="button"
                    className={`w-full rounded-md px-2 py-1.5 text-left hover:bg-zinc-100 ${
                      selectedCardId === card.id ? "bg-zinc-900 text-white hover:bg-zinc-800" : ""
                    }`}
                    onClick={() => editCard(card)}
                  >
                    <span className="font-medium">{card.title}</span>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      <Badge className={selectedCardId === card.id ? "bg-white/20 text-white" : ""}>
                        {card.status}
                      </Badge>
                      {embeddingIsStale(card) && (
                        <Badge className="bg-amber-100 text-amber-800">stale embed</Badge>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setSelectedCardId(null);
                setCardForm({
                  id: "",
                  source_id: sources[0]?.id ?? "",
                  topic: "",
                  locale: "en",
                  title: "",
                  summary_md: "",
                  key_claims: "",
                  evidence_level: "",
                  population: "",
                  practical_takeaway: "",
                  caveats: "",
                  tags: "",
                  status: "draft",
                });
              }}
            >
              New card
            </Button>
          </Card>

          <Card>
            <form className="space-y-3" onSubmit={saveCard}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-medium">{cardForm.id ? "Edit card" : "New card"}</h2>
                {selectedCard && embeddingIsStale(selectedCard) && (
                  <Badge className="bg-amber-100 text-amber-800">embedding stale</Badge>
                )}
              </div>

              <label className="block text-sm">
                <span className="mb-1 block text-zinc-500">Source</span>
                <select
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  value={cardForm.source_id}
                  onChange={(event) =>
                    setCardForm((current) => ({ ...current, source_id: event.target.value }))
                  }
                  required
                  disabled={Boolean(cardForm.id)}
                >
                  <option value="">Select source…</option>
                  {sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.title}
                    </option>
                  ))}
                </select>
              </label>

              <Input
                placeholder="title"
                value={cardForm.title}
                onChange={(event) => setCardForm((current) => ({ ...current, title: event.target.value }))}
                required
              />
              <div className="grid gap-2 sm:grid-cols-3">
                <select
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  value={cardForm.locale}
                  onChange={(event) =>
                    setCardForm((current) => ({ ...current, locale: event.target.value }))
                  }
                >
                  {LOCALES.map((locale) => (
                    <option key={locale} value={locale}>
                      {locale}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                  value={cardForm.status}
                  onChange={(event) =>
                    setCardForm((current) => ({ ...current, status: event.target.value }))
                  }
                >
                  {CARD_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="topic"
                  value={cardForm.topic}
                  onChange={(event) =>
                    setCardForm((current) => ({ ...current, topic: event.target.value }))
                  }
                />
              </div>
              <textarea
                className={textareaClass}
                rows={4}
                placeholder="summary_md"
                value={cardForm.summary_md}
                onChange={(event) =>
                  setCardForm((current) => ({ ...current, summary_md: event.target.value }))
                }
              />
              <textarea
                className={textareaClass}
                rows={3}
                placeholder="key claims (one per line)"
                value={cardForm.key_claims}
                onChange={(event) =>
                  setCardForm((current) => ({ ...current, key_claims: event.target.value }))
                }
              />
              <Input
                placeholder="evidence_level"
                value={cardForm.evidence_level}
                onChange={(event) =>
                  setCardForm((current) => ({ ...current, evidence_level: event.target.value }))
                }
              />
              <Input
                placeholder="population"
                value={cardForm.population}
                onChange={(event) =>
                  setCardForm((current) => ({ ...current, population: event.target.value }))
                }
              />
              <textarea
                className={textareaClass}
                rows={3}
                placeholder="practical_takeaway"
                value={cardForm.practical_takeaway}
                onChange={(event) =>
                  setCardForm((current) => ({
                    ...current,
                    practical_takeaway: event.target.value,
                  }))
                }
              />
              <textarea
                className={textareaClass}
                rows={2}
                placeholder="caveats"
                value={cardForm.caveats}
                onChange={(event) =>
                  setCardForm((current) => ({ ...current, caveats: event.target.value }))
                }
              />
              <Input
                placeholder="tags (comma-separated)"
                value={cardForm.tags}
                onChange={(event) =>
                  setCardForm((current) => ({ ...current, tags: event.target.value }))
                }
              />

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>
                  Save card
                </Button>
                {cardForm.id && (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => embedCard(cardForm.id)}
                    >
                      Embed
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={busy}
                      onClick={() => deleteCard(cardForm.id)}
                    >
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
