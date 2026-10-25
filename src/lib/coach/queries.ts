import { staffGql } from "@/lib/staff-gql";
import type {
  KnowledgeCard,
  KnowledgeSource,
  PromptVersion,
  Suggestion,
  TierPolicy,
  TurnToolCall,
} from "./types";

const SUGGESTION_FIELDS = `
  id slug active requires_personal_data requires_plan_builder kind
  unlocks_after section_slug sort_order created_at updated_at
  localizations { suggestion_id locale text answer_md }
`;

const CARD_FIELDS = `
  id source_id topic locale title summary_md key_claims evidence_level
  population practical_takeaway caveats tags status embedding_model
  embedded_hash content_hash reviewed_by reviewed_at inserted_at updated_at
  source { id title }
`;

export async function listPromptVersions(token: string): Promise<PromptVersion[]> {
  const data = await staffGql<{ assistant_prompt_versions: PromptVersion[] }>(
    token,
    `query {
      assistant_prompt_versions(order_by: [{ prompt_key: asc }, { locale: asc }, { version: desc }]) {
        id prompt_key locale version body_md is_active created_by created_at
      }
    }`,
  );
  return data.assistant_prompt_versions ?? [];
}

export async function insertPromptVersion(
  token: string,
  input: { prompt_key: string; locale: string; body_md: string },
): Promise<PromptVersion> {
  const data = await staffGql<{ insert_assistant_prompt_versions_one: PromptVersion }>(
    token,
    `mutation($object: assistant_prompt_versions_insert_input!) {
      insert_assistant_prompt_versions_one(object: $object) {
        id prompt_key locale version body_md is_active created_by created_at
      }
    }`,
    {
      object: {
        prompt_key: input.prompt_key,
        locale: input.locale,
        body_md: input.body_md,
        is_active: false,
      },
    },
  );
  return data.insert_assistant_prompt_versions_one;
}

export async function setPromptVersionActive(
  token: string,
  id: string,
  is_active: boolean,
): Promise<PromptVersion> {
  const data = await staffGql<{ update_assistant_prompt_versions_by_pk: PromptVersion | null }>(
    token,
    `mutation($id: uuid!, $is_active: Boolean!) {
      update_assistant_prompt_versions_by_pk(pk_columns: { id: $id }, _set: { is_active: $is_active }) {
        id prompt_key locale version body_md is_active created_by created_at
      }
    }`,
    { id, is_active },
  );
  if (!data.update_assistant_prompt_versions_by_pk) {
    throw new Error("Prompt version not found");
  }
  return data.update_assistant_prompt_versions_by_pk;
}

export async function listTierPolicies(token: string): Promise<TierPolicy[]> {
  const data = await staffGql<{ assistant_tier_policies: TierPolicy[] }>(
    token,
    `query {
      assistant_tier_policies(order_by: { tier_code: asc }) {
        tier_code monthly_token_limit daily_burst_limit max_turn_tokens min_turn_tokens
        personal_data_enabled plan_builder_enabled max_tool_rounds updated_at
      }
    }`,
  );
  return data.assistant_tier_policies ?? [];
}

export async function updateTierCapabilities(
  token: string,
  tier_code: string,
  patch: {
    personal_data_enabled: boolean;
    plan_builder_enabled: boolean;
    max_tool_rounds: number;
  },
): Promise<TierPolicy> {
  const data = await staffGql<{ update_assistant_tier_policies_by_pk: TierPolicy | null }>(
    token,
    `mutation($tier_code: String!, $set: assistant_tier_policies_set_input!) {
      update_assistant_tier_policies_by_pk(pk_columns: { tier_code: $tier_code }, _set: $set) {
        tier_code monthly_token_limit daily_burst_limit max_turn_tokens min_turn_tokens
        personal_data_enabled plan_builder_enabled max_tool_rounds updated_at
      }
    }`,
    { tier_code, set: patch },
  );
  if (!data.update_assistant_tier_policies_by_pk) {
    throw new Error(`Unknown tier ${tier_code}`);
  }
  return data.update_assistant_tier_policies_by_pk;
}

export async function listSuggestions(token: string): Promise<Suggestion[]> {
  const data = await staffGql<{ assistant_suggestions: Suggestion[] }>(
    token,
    `query {
      assistant_suggestions(order_by: [{ kind: asc }, { sort_order: asc }, { slug: asc }]) {
        ${SUGGESTION_FIELDS}
      }
    }`,
  );
  return data.assistant_suggestions ?? [];
}

export async function createSuggestion(
  token: string,
  input: {
    slug: string;
    kind: string;
    active: boolean;
    requires_personal_data: boolean;
    requires_plan_builder: boolean;
    unlocks_after: string | null;
    section_slug: string | null;
    sort_order: number;
    en_text: string;
    en_answer_md: string | null;
  },
): Promise<Suggestion> {
  const data = await staffGql<{ insert_assistant_suggestions_one: Suggestion }>(
    token,
    `mutation($object: assistant_suggestions_insert_input!) {
      insert_assistant_suggestions_one(object: $object) {
        ${SUGGESTION_FIELDS}
      }
    }`,
    {
      object: {
        slug: input.slug,
        kind: input.kind,
        active: input.active,
        requires_personal_data: input.requires_personal_data,
        requires_plan_builder: input.requires_plan_builder,
        unlocks_after: input.unlocks_after,
        section_slug: input.section_slug,
        sort_order: input.sort_order,
        localizations: {
          data: [
            {
              locale: "en",
              text: input.en_text,
              answer_md: input.en_answer_md,
            },
          ],
        },
      },
    },
  );
  return data.insert_assistant_suggestions_one;
}

export async function updateSuggestion(
  token: string,
  id: string,
  patch: {
    slug?: string;
    active?: boolean;
    requires_personal_data?: boolean;
    requires_plan_builder?: boolean;
    kind?: string;
    unlocks_after?: string | null;
    section_slug?: string | null;
    sort_order?: number;
  },
): Promise<Suggestion> {
  const data = await staffGql<{ update_assistant_suggestions_by_pk: Suggestion | null }>(
    token,
    `mutation($id: uuid!, $set: assistant_suggestions_set_input!) {
      update_assistant_suggestions_by_pk(pk_columns: { id: $id }, _set: $set) {
        ${SUGGESTION_FIELDS}
      }
    }`,
    { id, set: patch },
  );
  if (!data.update_assistant_suggestions_by_pk) {
    throw new Error("Suggestion not found");
  }
  return data.update_assistant_suggestions_by_pk;
}

export async function deleteSuggestion(token: string, id: string): Promise<void> {
  await staffGql(
    token,
    `mutation($id: uuid!) { delete_assistant_suggestions_by_pk(id: $id) { id } }`,
    { id },
  );
}

export async function upsertSuggestionLocalization(
  token: string,
  input: {
    suggestion_id: string;
    locale: string;
    text: string;
    answer_md: string | null;
  },
): Promise<void> {
  await staffGql(
    token,
    `mutation($object: assistant_suggestion_localizations_insert_input!) {
      insert_assistant_suggestion_localizations_one(
        object: $object
        on_conflict: {
          constraint: suggestion_localizations_pkey
          update_columns: [text, answer_md]
        }
      ) { suggestion_id locale }
    }`,
    { object: input },
  );
}

export async function deleteSuggestionLocalization(
  token: string,
  suggestion_id: string,
  locale: string,
): Promise<void> {
  await staffGql(
    token,
    `mutation($suggestion_id: uuid!, $locale: String!) {
      delete_assistant_suggestion_localizations_by_pk(
        suggestion_id: $suggestion_id
        locale: $locale
      ) { suggestion_id }
    }`,
    { suggestion_id, locale },
  );
}

export async function listKnowledgeSources(token: string): Promise<KnowledgeSource[]> {
  const data = await staffGql<{ assistant_knowledge_sources: KnowledgeSource[] }>(
    token,
    `query {
      assistant_knowledge_sources(order_by: { title: asc }) {
        id kind title authors year doi url license inserted_at updated_at
      }
    }`,
  );
  return data.assistant_knowledge_sources ?? [];
}

export async function upsertKnowledgeSource(
  token: string,
  input: {
    id?: string;
    kind: string;
    title: string;
    authors: string | null;
    year: number | null;
    doi: string | null;
    url: string | null;
    license: string | null;
  },
): Promise<KnowledgeSource> {
  if (input.id) {
    const { id, ...set } = input;
    const data = await staffGql<{ update_assistant_knowledge_sources_by_pk: KnowledgeSource | null }>(
      token,
      `mutation($id: uuid!, $set: assistant_knowledge_sources_set_input!) {
        update_assistant_knowledge_sources_by_pk(pk_columns: { id: $id }, _set: $set) {
          id kind title authors year doi url license inserted_at updated_at
        }
      }`,
      { id, set },
    );
    if (!data.update_assistant_knowledge_sources_by_pk) throw new Error("Source not found");
    return data.update_assistant_knowledge_sources_by_pk;
  }
  const data = await staffGql<{ insert_assistant_knowledge_sources_one: KnowledgeSource }>(
    token,
    `mutation($object: assistant_knowledge_sources_insert_input!) {
      insert_assistant_knowledge_sources_one(object: $object) {
        id kind title authors year doi url license inserted_at updated_at
      }
    }`,
    {
      object: {
        kind: input.kind,
        title: input.title,
        authors: input.authors,
        year: input.year,
        doi: input.doi,
        url: input.url,
        license: input.license,
      },
    },
  );
  return data.insert_assistant_knowledge_sources_one;
}

export async function deleteKnowledgeSource(token: string, id: string): Promise<void> {
  await staffGql(
    token,
    `mutation($id: uuid!) { delete_assistant_knowledge_sources_by_pk(id: $id) { id } }`,
    { id },
  );
}

export async function listKnowledgeCards(token: string): Promise<KnowledgeCard[]> {
  const data = await staffGql<{ assistant_knowledge_cards: KnowledgeCard[] }>(
    token,
    `query {
      assistant_knowledge_cards(order_by: [{ status: asc }, { title: asc }]) {
        ${CARD_FIELDS}
      }
    }`,
  );
  return data.assistant_knowledge_cards ?? [];
}

export async function upsertKnowledgeCard(
  token: string,
  input: {
    id?: string;
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
    status: string;
  },
): Promise<KnowledgeCard> {
  if (input.id) {
    const { id, source_id: _sourceId, ...set } = input;
    void _sourceId;
    const data = await staffGql<{ update_assistant_knowledge_cards_by_pk: KnowledgeCard | null }>(
      token,
      `mutation($id: uuid!, $set: assistant_knowledge_cards_set_input!) {
        update_assistant_knowledge_cards_by_pk(pk_columns: { id: $id }, _set: $set) {
          ${CARD_FIELDS}
        }
      }`,
      { id, set },
    );
    if (!data.update_assistant_knowledge_cards_by_pk) throw new Error("Card not found");
    return data.update_assistant_knowledge_cards_by_pk;
  }
  const data = await staffGql<{ insert_assistant_knowledge_cards_one: KnowledgeCard }>(
    token,
    `mutation($object: assistant_knowledge_cards_insert_input!) {
      insert_assistant_knowledge_cards_one(object: $object) {
        ${CARD_FIELDS}
      }
    }`,
    {
      object: {
        source_id: input.source_id,
        topic: input.topic,
        locale: input.locale,
        title: input.title,
        summary_md: input.summary_md,
        key_claims: input.key_claims,
        evidence_level: input.evidence_level,
        population: input.population,
        practical_takeaway: input.practical_takeaway,
        caveats: input.caveats,
        tags: input.tags,
        status: input.status,
      },
    },
  );
  return data.insert_assistant_knowledge_cards_one;
}

export async function deleteKnowledgeCard(token: string, id: string): Promise<void> {
  await staffGql(
    token,
    `mutation($id: uuid!) { delete_assistant_knowledge_cards_by_pk(id: $id) { id } }`,
    { id },
  );
}

export async function getKnowledgeCard(
  token: string,
  id: string,
): Promise<KnowledgeCard | null> {
  const data = await staffGql<{ assistant_knowledge_cards_by_pk: KnowledgeCard | null }>(
    token,
    `query($id: uuid!) {
      assistant_knowledge_cards_by_pk(id: $id) { ${CARD_FIELDS} }
    }`,
    { id },
  );
  return data.assistant_knowledge_cards_by_pk;
}

export async function setCardEmbedding(
  token: string,
  cardId: string,
  embedding: number[],
  model: string,
): Promise<{ id: string; embedded_hash: string; content_hash: string }> {
  const data = await staffGql<{
    assistant_set_card_embedding: Array<{
      id: string;
      embedded_hash: string;
      content_hash: string;
    }>;
  }>(
    token,
    `mutation($id: uuid!, $e: jsonb!, $model: String!) {
      assistant_set_card_embedding(args: { p_card_id: $id, p_embedding: $e, p_model: $model }) {
        id embedded_hash content_hash
      }
    }`,
    { id: cardId, e: embedding, model },
  );
  const row = data.assistant_set_card_embedding?.[0];
  if (!row) throw new Error("Embedding mutation returned no row");
  return row;
}

export type ToolCallFilters = {
  tool?: string;
  zero_result?: boolean;
  since?: string;
  until?: string;
  limit?: number;
};

export async function listTurnToolCalls(
  token: string,
  filters: ToolCallFilters = {},
): Promise<TurnToolCall[]> {
  const where: Record<string, unknown> = {};
  if (filters.tool) where.tool = { _eq: filters.tool };
  if (filters.zero_result !== undefined) where.zero_result = { _eq: filters.zero_result };
  if (filters.since || filters.until) {
    where.created_at = {
      ...(filters.since ? { _gte: filters.since } : {}),
      ...(filters.until ? { _lte: filters.until } : {}),
    };
  }
  const data = await staffGql<{ assistant_turn_tool_calls: TurnToolCall[] }>(
    token,
    `query($where: assistant_turn_tool_calls_bool_exp!, $limit: Int!) {
      assistant_turn_tool_calls(
        where: $where
        order_by: { created_at: desc }
        limit: $limit
      ) {
        id turn_id position round tool arg_keys code_args query_chars result_chars
        hits top_similarity zero_result error_code ms created_at
      }
    }`,
    { where, limit: filters.limit ?? 100 },
  );
  return data.assistant_turn_tool_calls ?? [];
}

export async function listToolNames(token: string): Promise<string[]> {
  const data = await staffGql<{
    assistant_turn_tool_calls: Array<{ tool: string }>;
  }>(
    token,
    `query {
      assistant_turn_tool_calls(distinct_on: tool, order_by: { tool: asc }) { tool }
    }`,
  );
  return (data.assistant_turn_tool_calls ?? []).map((row) => row.tool);
}
