"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Card, Input } from "@/components/ui/primitives";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import {
  CANDIDATE_LIST_LIMIT,
  candidateDoiUrl,
  candidateKindLabel,
  candidateVenue,
  type AcceptedCandidate,
  type CandidateCounts,
  type CandidateStatus,
  type KnowledgeCandidate,
} from "@/lib/coach";

type Response = {
  candidates?: KnowledgeCandidate[];
  counts?: CandidateCounts;
  error?: string;
};

const STATUS_TABS: { status: CandidateStatus; label: string }[] = [
  { status: "pending", label: "Pending" },
  { status: "dismissed", label: "Dismissed" },
  { status: "accepted", label: "Accepted" },
];

const linkClass = "text-xs font-medium text-blue-700 underline-offset-2 hover:underline";

/**
 * Papers the weekly PubMed discovery proposes for the Coach knowledge base. Accepting drafts a
 * source and draft cards in the backend (10 to 40 s); the cards then wait in the Cards tab.
 */
export function KnowledgeCandidates({
  onViewCards,
  onCardsChanged,
}: {
  /** Opens the Cards tab on the cards of this source. */
  onViewCards: (sourceId: string) => void;
  /** The cards list is stale after an accept. */
  onCardsChanged: () => void;
}) {
  const staffFetch = useStaffFetch();
  const [status, setStatus] = useState<CandidateStatus>("pending");
  const [topic, setTopic] = useState("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { data, error, isLoading, mutate } = useStaffSWR<Response>(
    `/api/coach/knowledge/candidates?status=${status}`,
  );
  const candidates = useMemo(() => data?.candidates ?? [], [data?.candidates]);
  const counts = data?.counts;

  const topics = useMemo(
    () => Array.from(new Set(candidates.map((candidate) => candidate.topic))).sort(),
    [candidates],
  );
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return candidates.filter(
      (candidate) =>
        (topic === "all" || candidate.topic === topic) &&
        (!needle ||
          candidate.title.toLowerCase().includes(needle) ||
          (candidate.journal ?? "").toLowerCase().includes(needle) ||
          candidate.pmid.includes(needle)),
    );
  }, [candidates, topic, search]);

  async function act(candidate: KnowledgeCandidate, action: "accept" | "dismiss" | "restore") {
    setBusyId(candidate.id);
    setMessage(null);
    try {
      const result = (await staffFetch("/api/coach/knowledge/candidates", {
        method: "POST",
        body: JSON.stringify({ action, id: candidate.id }),
      })) as { accepted?: AcceptedCandidate };
      if (action === "accept" && result.accepted) {
        const { cardIds, textSource } = result.accepted;
        setMessage(
          `Accepted: ${cardIds.length} draft card${cardIds.length === 1 ? "" : "s"} from the ${
            textSource === "full_text" ? "open-access full text" : "abstract"
          }. Review them in the Cards tab.`,
        );
        onCardsChanged();
      } else if (action === "dismiss") {
        setMessage("Dismissed. It stays in the Dismissed list and can be restored.");
      } else if (action === "restore") {
        setMessage("Restored to pending.");
      }
      await mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Candidate action failed");
      await mutate();
    } finally {
      setBusyId(null);
    }
  }

  function confirmAccept(candidate: KnowledgeCandidate) {
    if (
      window.confirm(
        `Accept "${candidate.title}"?\n\nThe backend reads the paper (open-access full text, else the abstract) and drafts the source and 1 to 5 draft cards. This takes up to a minute.`,
      )
    ) {
      void act(candidate, "accept");
    }
  }

  const total = counts?.[status] ?? 0;

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600">
        New high-evidence papers (meta-analyses, systematic reviews, position stands, guidelines)
        PubMed lists on the Coach topics, found weekly. Accept one to create its source and draft
        cards; nothing reaches the Coach until you approve the cards.
      </p>

      {(message || error) && <p className="text-sm text-zinc-700">{message ?? error?.message}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab.status}
            type="button"
            variant={status === tab.status ? "default" : "secondary"}
            onClick={() => {
              setStatus(tab.status);
              setTopic("all");
              setMessage(null);
            }}
          >
            {tab.label}
            {counts ? ` (${counts[tab.status]})` : ""}
          </Button>
        ))}
        <select
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          aria-label="Topic"
        >
          <option value="all">All topics</option>
          {topics.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <Input
          className="max-w-xs"
          placeholder="Search title, journal, PMID"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {isLoading && <p className="text-sm text-zinc-500">Loading…</p>}
      {!isLoading && visible.length === 0 && (
        <Card>
          <p className="text-sm text-zinc-500">
            {status === "pending" && candidates.length === 0
              ? "No pending candidates. The discovery job runs weekly; new papers appear here."
              : "No candidates match."}
          </p>
        </Card>
      )}
      {total > candidates.length && (
        <p className="text-xs text-zinc-500">
          Showing the {CANDIDATE_LIST_LIMIT} newest of {total}.
        </p>
      )}

      <ul className="space-y-2">
        {visible.map((candidate) => {
          const doiUrl = candidateDoiUrl(candidate);
          const busy = busyId === candidate.id;
          const venue = candidateVenue(candidate);
          return (
            <li key={candidate.id}>
              <Card className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium">{candidate.title}</p>
                    <p className="text-xs text-zinc-500">
                      {[venue, candidate.authors].filter(Boolean).join(" · ")}
                    </p>
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge>{candidateKindLabel(candidate.kind)}</Badge>
                      <Badge className="bg-sky-100 text-sky-800">{candidate.topic}</Badge>
                      {(candidate.publication_types ?? []).map((type) => (
                        <Badge key={type} className="bg-zinc-50 text-zinc-600">
                          {type}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {candidate.pubmed_url && (
                        <a
                          className={linkClass}
                          href={candidate.pubmed_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          PubMed {candidate.pmid}
                        </a>
                      )}
                      {doiUrl && (
                        <a className={linkClass} href={doiUrl} target="_blank" rel="noopener noreferrer">
                          DOI
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {candidate.status === "pending" && (
                      <>
                        <Button
                          type="button"
                          disabled={busyId !== null}
                          onClick={() => confirmAccept(candidate)}
                        >
                          {busy ? "Drafting cards…" : "Accept"}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busyId !== null}
                          onClick={() => void act(candidate, "dismiss")}
                        >
                          Dismiss
                        </Button>
                      </>
                    )}
                    {candidate.status === "dismissed" && (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busyId !== null}
                        onClick={() => void act(candidate, "restore")}
                      >
                        Restore
                      </Button>
                    )}
                    {candidate.status === "accepted" && candidate.source_id && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => onViewCards(candidate.source_id as string)}
                      >
                        View cards
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
