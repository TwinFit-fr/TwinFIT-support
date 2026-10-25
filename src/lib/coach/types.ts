export const PROMPT_KEYS = [
  "system_identity",
  "system_style",
  "system_muscle_status",
  "system_drafts",
  "health_reminder",
] as const;

export type PromptKey = (typeof PROMPT_KEYS)[number];

export const LOCALES = ["en", "es", "fr", "de"] as const;
export type Locale = (typeof LOCALES)[number];

export const SUGGESTION_KINDS = ["prompt", "lesson"] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

export const CARD_STATUSES = ["draft", "approved", "retired"] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export const ANSWER_MD_MAX = 16000;
export const SUGGESTION_TEXT_MAX = 120;
export const PROMPT_BODY_MAX = 4000;
export const COACH_MEDIA_BUCKET = "coach-media";
export const COACH_MEDIA_MAX_BYTES = 5 * 1024 * 1024;

export type PromptVersion = {
  id: string;
  prompt_key: string;
  locale: string;
  version: number;
  body_md: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
};

export type TierPolicy = {
  tier_code: string;
  monthly_token_limit: number | null;
  daily_burst_limit: number | null;
  max_turn_tokens: number;
  min_turn_tokens: number;
  personal_data_enabled: boolean;
  plan_builder_enabled: boolean;
  max_tool_rounds: number;
  updated_at: string;
};

export type SuggestionLocalization = {
  suggestion_id: string;
  locale: string;
  text: string;
  answer_md: string | null;
};

export type Suggestion = {
  id: string;
  slug: string;
  active: boolean;
  requires_personal_data: boolean;
  requires_plan_builder: boolean;
  kind: SuggestionKind;
  unlocks_after: string | null;
  section_slug: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  localizations: SuggestionLocalization[];
};

export type KnowledgeSource = {
  id: string;
  kind: string;
  title: string;
  authors: string | null;
  year: number | null;
  doi: string | null;
  url: string | null;
  license: string | null;
  inserted_at: string;
  updated_at: string;
};

export type KnowledgeCard = {
  id: string;
  source_id: string;
  topic: string | null;
  locale: string;
  title: string;
  summary_md: string | null;
  key_claims: string[] | null;
  evidence_level: string | null;
  population: string | null;
  practical_takeaway: string | null;
  caveats: string | null;
  tags: string[] | null;
  status: CardStatus;
  embedding_model: string | null;
  embedded_hash: string | null;
  content_hash: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  inserted_at: string;
  updated_at: string;
  source?: { id: string; title: string } | null;
};

export type TurnToolCall = {
  id: string;
  turn_id: string;
  position: number;
  round: number;
  tool: string;
  arg_keys: string[] | null;
  code_args: unknown;
  query_chars: number | null;
  result_chars: number | null;
  hits: number | null;
  top_similarity: number | null;
  zero_result: boolean;
  error_code: string | null;
  ms: number | null;
  created_at: string;
};

export function embeddingIsStale(card: Pick<KnowledgeCard, "embedded_hash" | "content_hash">): boolean {
  return card.embedded_hash == null || card.embedded_hash !== card.content_hash;
}
