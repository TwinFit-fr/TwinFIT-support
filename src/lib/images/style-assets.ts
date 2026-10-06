import { deleteImageFile, uploadImageFile } from "./storage";
import { staffGql } from "@/lib/staff-gql";
import type { MuscleMapView, Subject } from "./types";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/webp": "webp",
  "image/jpeg": "jpg",
};

export function extensionForMime(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] ?? "png";
}

type UploadArgs = {
  token: string;
  bytes: Buffer;
  mimeType: string;
  name: string;
  previousFileId?: string | null;
};

/** Upload a new file and optionally delete the previous one. */
export async function replaceUploadedFile(args: UploadArgs): Promise<{ id: string; url: string }> {
  const uploaded = await uploadImageFile({
    token: args.token,
    bytes: args.bytes,
    mimeType: args.mimeType,
    name: args.name,
  });
  if (args.previousFileId && args.previousFileId !== uploaded.id) {
    try {
      await deleteImageFile(args.token, args.previousFileId);
    } catch {
      /* best-effort cleanup */
    }
  }
  return uploaded;
}

export async function upsertStyleCharacter(
  token: string,
  styleId: string,
  subject: Subject,
  fileId: string,
): Promise<void> {
  await staffGql(
    token,
    `mutation($object: images_style_characters_insert_input!) {
      insert_images_style_characters_one(
        object: $object
        on_conflict: {
          constraint: images_style_characters_pkey
          update_columns: [file_id, updated_at]
        }
      ) { style_id }
    }`,
    {
      object: {
        style_id: styleId,
        subject,
        file_id: fileId,
        updated_at: new Date().toISOString(),
      },
    },
  );
}

export async function deleteStyleCharacter(
  token: string,
  styleId: string,
  subject: Subject,
): Promise<string | null> {
  const data = await staffGql<{
    delete_images_style_characters_by_pk: { file_id: string } | null;
  }>(
    token,
    `mutation($styleId: uuid!, $subject: String!) {
      delete_images_style_characters_by_pk(style_id: $styleId, subject: $subject) { file_id }
    }`,
    { styleId, subject },
  );
  return data.delete_images_style_characters_by_pk?.file_id ?? null;
}

export async function upsertStyleSupport(
  token: string,
  styleId: string,
  supportEquipmentId: string,
  fileId: string,
): Promise<void> {
  await staffGql(
    token,
    `mutation($object: images_style_supports_insert_input!) {
      insert_images_style_supports_one(
        object: $object
        on_conflict: {
          constraint: images_style_supports_pkey
          update_columns: [file_id, updated_at]
        }
      ) { style_id }
    }`,
    {
      object: {
        style_id: styleId,
        support_equipment_id: supportEquipmentId,
        file_id: fileId,
        updated_at: new Date().toISOString(),
      },
    },
  );
}

export async function deleteStyleSupport(
  token: string,
  styleId: string,
  supportEquipmentId: string,
): Promise<string | null> {
  const data = await staffGql<{
    delete_images_style_supports_by_pk: { file_id: string } | null;
  }>(
    token,
    `mutation($styleId: uuid!, $supportId: uuid!) {
      delete_images_style_supports_by_pk(style_id: $styleId, support_equipment_id: $supportId) {
        file_id
      }
    }`,
    { styleId, supportId: supportEquipmentId },
  );
  return data.delete_images_style_supports_by_pk?.file_id ?? null;
}

export async function upsertStyleMuscleBase(
  token: string,
  styleId: string,
  view: MuscleMapView,
  fileId: string,
): Promise<void> {
  await staffGql(
    token,
    `mutation($object: images_style_muscle_bases_insert_input!) {
      insert_images_style_muscle_bases_one(
        object: $object
        on_conflict: {
          constraint: images_style_muscle_bases_pkey
          update_columns: [file_id, updated_at]
        }
      ) { style_id }
    }`,
    {
      object: {
        style_id: styleId,
        view,
        file_id: fileId,
        updated_at: new Date().toISOString(),
      },
    },
  );
}

export async function deleteStyleMuscleBase(
  token: string,
  styleId: string,
  view: MuscleMapView,
): Promise<string | null> {
  const data = await staffGql<{
    delete_images_style_muscle_bases_by_pk: { file_id: string } | null;
  }>(
    token,
    `mutation($styleId: uuid!, $view: String!) {
      delete_images_style_muscle_bases_by_pk(style_id: $styleId, view: $view) { file_id }
    }`,
    { styleId, view },
  );
  return data.delete_images_style_muscle_bases_by_pk?.file_id ?? null;
}
