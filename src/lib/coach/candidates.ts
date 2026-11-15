import type { KnowledgeCandidate } from "./types";

/** Hasura wraps the Function's answer: `error` is a short text, `code` the stable machine code. */
const ACCEPT_ERROR_TEXT: Record<string, string> = {
  candidate_not_found: "This candidate no longer exists.",
  candidate_not_pending:
    "This candidate was already accepted or dismissed. Restore a dismissed one to pending first.",
  knowledge_source_exists:
    "A source with the same PMID or DOI already exists (added by hand since discovery). Dismiss this candidate.",
  candidate_no_text:
    "Europe PMC has neither an abstract nor an open-access text for this paper. Nothing was written; dismiss it.",
  literature_unavailable: "Europe PMC answered an error. Try again in a moment.",
  summary_failed: "The model could not draft usable cards. Nothing was written; try again.",
  accept_failed: "The database refused the accept. Try again; if it repeats, check the backend logs.",
  llm_not_configured: "The Coach model is not configured on this backend (local stack with the dummy key).",
};

/** The message staff see when `admin-accept-knowledge-candidate` answers an error. */
export function acceptErrorMessage(status: number, body: unknown): string {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const code = typeof record.code === "string" ? record.code : null;
  if (code && ACCEPT_ERROR_TEXT[code]) return ACCEPT_ERROR_TEXT[code];
  const error = typeof record.error === "string" ? record.error : null;
  if (error && ACCEPT_ERROR_TEXT[error]) return ACCEPT_ERROR_TEXT[error];
  return error ?? `Accept failed (${status})`;
}

export type AcceptedCandidate = {
  candidateId: string;
  sourceId: string;
  cardIds: string[];
  textSource: "full_text" | "abstract";
};

/** Reads the 200 body of `admin-accept-knowledge-candidate`; throws when it has no source id. */
export function parseAcceptResult(body: unknown): AcceptedCandidate {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (typeof record.candidateId !== "string" || typeof record.sourceId !== "string") {
    throw new Error("Accept answered without a source id");
  }
  return {
    candidateId: record.candidateId,
    sourceId: record.sourceId,
    cardIds: Array.isArray(record.cardIds) ? record.cardIds.map(String) : [],
    textSource: record.textSource === "full_text" ? "full_text" : "abstract",
  };
}

const KIND_LABEL: Record<string, string> = {
  position_stand: "Position stand",
  meta_analysis: "Meta-analysis",
  systematic_review: "Systematic review",
  guideline: "Guideline",
};

export function candidateKindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

/** DOI link (preferred) or null; the PubMed link is `pubmed_url`. */
export function candidateDoiUrl(candidate: Pick<KnowledgeCandidate, "doi">): string | null {
  const doi = candidate.doi?.trim();
  return doi ? `https://doi.org/${doi}` : null;
}

/** "Journal · 2025" with whatever of the two is known. */
export function candidateVenue(candidate: Pick<KnowledgeCandidate, "journal" | "year">): string {
  return [candidate.journal, candidate.year].filter((part) => part != null && part !== "").join(" · ");
}
