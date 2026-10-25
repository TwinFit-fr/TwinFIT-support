import { getKnowledgeCard, setCardEmbedding } from "./queries";

const DIMS = 1024;

/** Text the embedding represents — keep aligned with backend knowledge/embed.mjs. */
export function embedInput(card: {
  title: string;
  summary_md: string | null;
  practical_takeaway: string | null;
}): string {
  return [card.title, card.summary_md, card.practical_takeaway].filter(Boolean).join("\n\n");
}

function embedConfig(): { baseUrl: string; apiKey: string; model: string } {
  const baseUrl = process.env.ASSISTANT_LLM_BASE_URL || "https://api.mistral.ai/v1";
  const apiKey = process.env.ASSISTANT_LLM_API_KEY || process.env.MISTRAL_API_KEY || "";
  const model = process.env.ASSISTANT_EMBED_MODEL || "mistral-embed";
  if (!apiKey || apiKey === "dummy-local") {
    throw new Error("MISTRAL_API_KEY (or ASSISTANT_LLM_API_KEY) is not configured");
  }
  return { baseUrl, apiKey, model };
}

async function embedText(text: string): Promise<{ vector: number[]; model: string }> {
  const { baseUrl, apiKey, model } = embedConfig();
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: [text] }),
  });
  const json = (await res.json().catch(() => null)) as {
    data?: Array<{ embedding?: number[] }>;
    message?: string;
    error?: { message?: string };
  } | null;
  const vector = json?.data?.[0]?.embedding;
  if (!res.ok || !Array.isArray(vector) || vector.length !== DIMS) {
    const detail = json?.message || json?.error?.message || res.status;
    throw new Error(`Embeddings request failed: ${detail}`);
  }
  return { vector, model };
}

/** Embed one card with the staff JWT (Hasura mutation) and the server-side LLM key. */
export async function embedKnowledgeCard(
  token: string,
  cardId: string,
): Promise<{ id: string; embedded_hash: string; content_hash: string }> {
  const card = await getKnowledgeCard(token, cardId);
  if (!card) throw new Error("Card not found");
  const { vector, model } = await embedText(embedInput(card));
  const row = await setCardEmbedding(token, cardId, vector, model);
  if (row.embedded_hash !== row.content_hash) {
    throw new Error("Embedding was not stored as current");
  }
  return row;
}
