import { NextResponse } from "next/server";
import { staffGql } from "@/lib/staff-gql";
import { getUserIdFromToken } from "./queries";
import { downloadImageFile } from "./storage";
import { MAX_RUN_REFERENCES } from "./types";
import type { ReferenceLink, ReferenceTarget, StyleReference } from "./types";

export { MAX_RUN_REFERENCES };

const REFERENCE_FIELDS = `
  id
  style_id
  name
  instruction
  prompt
  file_id
  inserted_at
  updated_at
  links {
    exo_id
    muscle_id
    muscle_group_id
    exercise { display_name }
    muscle { name }
    muscle_group { name }
  }
`;

type RawLink = {
  exo_id: number | null;
  muscle_id: string | null;
  muscle_group_id: string | null;
  exercise: { display_name: string } | null;
  muscle: { name: string } | null;
  muscle_group: { name: string } | null;
};

type RawReference = Omit<StyleReference, "links"> & { links: RawLink[] };

const KIND_ORDER: Record<ReferenceTarget["kind"], number> = {
  muscle_group: 0,
  muscle: 1,
  exercise: 2,
};

function toLink(link: RawLink): ReferenceLink {
  if (link.exo_id != null) {
    const name = link.exercise?.display_name ?? `#${link.exo_id}`;
    return { kind: "exercise", id: link.exo_id, name };
  }
  if (link.muscle_id) {
    return { kind: "muscle", id: link.muscle_id, name: link.muscle?.name ?? "Muscle" };
  }
  return {
    kind: "muscle_group",
    id: link.muscle_group_id as string,
    name: link.muscle_group?.name ?? "Group",
  };
}

function toReference(row: RawReference): StyleReference {
  return {
    ...row,
    links: row.links
      .map(toLink)
      .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name)),
  };
}

/** Hasura row of a link to `target`. */
function linkColumns(target: ReferenceTarget) {
  return {
    exo_id: target.kind === "exercise" ? target.id : null,
    muscle_id: target.kind === "muscle" ? target.id : null,
    muscle_group_id: target.kind === "muscle_group" ? target.id : null,
  };
}

/** Hasura filter for links pointing at `target`. */
function linkWhere(target: ReferenceTarget) {
  if (target.kind === "exercise") return { exo_id: { _eq: target.id } };
  if (target.kind === "muscle") return { muscle_id: { _eq: target.id } };
  return { muscle_group_id: { _eq: target.id } };
}

export async function listStyleReferences(
  token: string,
  styleId: string,
): Promise<StyleReference[]> {
  const data = await staffGql<{ images_style_references: RawReference[] }>(
    token,
    `query($styleId: uuid!) {
      images_style_references(
        where: { style_id: { _eq: $styleId } }
        order_by: [{ name: asc }]
      ) { ${REFERENCE_FIELDS} }
    }`,
    { styleId },
  );
  return (data.images_style_references ?? []).map(toReference);
}

/** References of a style linked to one target, in name order. */
export async function listLinkedReferences(
  token: string,
  styleId: string,
  target: ReferenceTarget,
): Promise<StyleReference[]> {
  const data = await staffGql<{ images_style_references: RawReference[] }>(
    token,
    `query($where: images_style_references_bool_exp!) {
      images_style_references(where: $where, order_by: [{ name: asc }]) { ${REFERENCE_FIELDS} }
    }`,
    { where: { style_id: { _eq: styleId }, links: linkWhere(target) } },
  );
  return (data.images_style_references ?? []).map(toReference);
}

export async function getStyleReference(
  token: string,
  id: string,
): Promise<StyleReference | null> {
  const data = await staffGql<{ images_style_references_by_pk: RawReference | null }>(
    token,
    `query($id: uuid!) { images_style_references_by_pk(id: $id) { ${REFERENCE_FIELDS} } }`,
    { id },
  );
  return data.images_style_references_by_pk
    ? toReference(data.images_style_references_by_pk)
    : null;
}

export type ReferenceInput = {
  name: string;
  instruction: string;
  prompt: string | null;
  links: ReferenceTarget[];
};

export async function createStyleReference(
  token: string,
  styleId: string,
  input: ReferenceInput,
): Promise<StyleReference> {
  const data = await staffGql<{ insert_images_style_references_one: RawReference }>(
    token,
    `mutation($object: images_style_references_insert_input!) {
      insert_images_style_references_one(object: $object) { ${REFERENCE_FIELDS} }
    }`,
    {
      object: {
        style_id: styleId,
        name: input.name,
        instruction: input.instruction,
        prompt: input.prompt,
        updated_by: getUserIdFromToken(token),
        links: { data: input.links.map(linkColumns) },
      },
    },
  );
  return toReference(data.insert_images_style_references_one);
}

/** Update fields and, when given, replace every link. */
export async function updateStyleReference(
  token: string,
  id: string,
  input: Partial<ReferenceInput> & { file_id?: string | null },
): Promise<StyleReference> {
  const { links, ...fields } = input;
  await staffGql(
    token,
    `mutation(
      $id: uuid!
      $set: images_style_references_set_input!
      $replaceLinks: Boolean!
      $links: [images_style_reference_links_insert_input!]!
    ) {
      update_images_style_references_by_pk(pk_columns: { id: $id }, _set: $set) { id }
      delete_images_style_reference_links(where: { reference_id: { _eq: $id } })
        @include(if: $replaceLinks) { affected_rows }
      insert_images_style_reference_links(objects: $links) @include(if: $replaceLinks) {
        affected_rows
      }
    }`,
    {
      id,
      set: { ...fields, updated_by: getUserIdFromToken(token) },
      replaceLinks: links !== undefined,
      links: (links ?? []).map((target) => ({ reference_id: id, ...linkColumns(target) })),
    },
  );
  const updated = await getStyleReference(token, id);
  if (!updated) throw new Error("Reference not found");
  return updated;
}

/** Delete a reference (and its links); returns its file id for cleanup. */
export async function deleteStyleReference(token: string, id: string): Promise<string | null> {
  const data = await staffGql<{
    delete_images_style_references_by_pk: { file_id: string | null } | null;
  }>(
    token,
    `mutation($id: uuid!) { delete_images_style_references_by_pk(id: $id) { file_id } }`,
    { id },
  );
  return data.delete_images_style_references_by_pk?.file_id ?? null;
}

/**
 * References a run sends: exactly `referenceIds` when given (the user's choice for this run),
 * otherwise the ones linked to `target`. Only references with an image are sent.
 */
export async function resolveRunReferences(
  token: string,
  styleId: string,
  target: ReferenceTarget,
  referenceIds?: string[],
): Promise<StyleReference[]> {
  let references: StyleReference[];
  if (referenceIds) {
    if (!referenceIds.length) return [];
    const data = await staffGql<{ images_style_references: RawReference[] }>(
      token,
      `query($styleId: uuid!, $ids: [uuid!]!) {
        images_style_references(where: { style_id: { _eq: $styleId }, id: { _in: $ids } }) {
          ${REFERENCE_FIELDS}
        }
      }`,
      { styleId, ids: referenceIds },
    );
    const byId = new Map(
      (data.images_style_references ?? []).map((row) => [row.id, toReference(row)]),
    );
    if (byId.size !== new Set(referenceIds).size) {
      throw NextResponse.json({ error: "Unknown reference for this style" }, { status: 400 });
    }
    references = [...new Set(referenceIds)].map((id) => byId.get(id) as StyleReference);
  } else {
    references = await listLinkedReferences(token, styleId, target);
  }
  const withImage = references.filter((r) => r.file_id);
  if (withImage.length > MAX_RUN_REFERENCES) {
    throw NextResponse.json(
      {
        error: `At most ${MAX_RUN_REFERENCES} library references per image (${withImage.length} selected)`,
      },
      { status: 400 },
    );
  }
  return withImage;
}

/** Download the images of `references`, in order. */
export async function loadReferenceInputs(
  token: string,
  references: StyleReference[],
): Promise<{ bytes: Buffer; mimeType: string }[]> {
  return Promise.all(
    references.map(async (reference) => {
      const file = await downloadImageFile(token, reference.file_id as string);
      return { bytes: file.bytes, mimeType: file.contentType };
    }),
  );
}
