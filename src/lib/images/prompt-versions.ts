import { staffGql } from "@/lib/staff-gql";

/** A saved text of a style prompt slot (images.prompt_versions). */
export type PromptVersion = {
  id: string;
  prompt_id: string;
  content: string;
  saved_at: string;
  saved_by: string | null;
};

/** Every saved text of a slot, newest first. */
export async function listPromptVersions(
  token: string,
  promptId: string,
): Promise<PromptVersion[]> {
  const data = await staffGql<{ images_prompt_versions: PromptVersion[] }>(
    token,
    `query($promptId: uuid!) {
      images_prompt_versions(where: { prompt_id: { _eq: $promptId } }, order_by: { saved_at: desc }) {
        id prompt_id content saved_at saved_by
      }
    }`,
    { promptId },
  );
  return data.images_prompt_versions;
}

/** The current version of each slot, to stamp on the images they make. */
export async function currentPromptVersions(
  token: string,
  promptIds: string[],
): Promise<Map<string, Pick<PromptVersion, "id" | "saved_at">>> {
  if (!promptIds.length) return new Map();
  const data = await staffGql<{ images_prompt_versions: PromptVersion[] }>(
    token,
    `query($ids: [uuid!]!) {
      images_prompt_versions(
        where: { prompt_id: { _in: $ids } }
        order_by: [{ prompt_id: asc }, { saved_at: desc }]
        distinct_on: prompt_id
      ) { id prompt_id saved_at }
    }`,
    { ids: promptIds },
  );
  return new Map(data.images_prompt_versions.map((v) => [v.prompt_id, v]));
}
