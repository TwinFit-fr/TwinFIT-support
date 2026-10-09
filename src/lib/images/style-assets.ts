import { deleteImageFile, uploadImageFile } from "./storage";
import { staffGql } from "@/lib/staff-gql";
import type { MuscleMapSlot, Subject } from "./types";

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

/** An uploaded image: its file and the public URL the app shows. */
type UploadedImage = { id: string; url: string };

export async function upsertStyleSupport(
  token: string,
  styleId: string,
  supportEquipmentId: string,
  file: UploadedImage,
): Promise<void> {
  await staffGql(
    token,
    `mutation($object: images_style_supports_insert_input!) {
      insert_images_style_supports_one(
        object: $object
        on_conflict: {
          constraint: images_style_supports_pkey
          update_columns: [file_id, image_url, updated_at]
        }
      ) { style_id }
    }`,
    {
      object: {
        style_id: styleId,
        support_equipment_id: supportEquipmentId,
        file_id: file.id,
        image_url: file.url,
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

export async function upsertStyleEquipment(
  token: string,
  styleId: string,
  equipmentId: string,
  file: UploadedImage,
): Promise<void> {
  await staffGql(
    token,
    `mutation($object: images_style_equipment_insert_input!) {
      insert_images_style_equipment_one(
        object: $object
        on_conflict: {
          constraint: images_style_equipment_pkey
          update_columns: [file_id, image_url, updated_at]
        }
      ) { style_id }
    }`,
    {
      object: {
        style_id: styleId,
        equipment_id: equipmentId,
        file_id: file.id,
        image_url: file.url,
        updated_at: new Date().toISOString(),
      },
    },
  );
}

export async function deleteStyleEquipment(
  token: string,
  styleId: string,
  equipmentId: string,
): Promise<string | null> {
  const data = await staffGql<{
    delete_images_style_equipment_by_pk: { file_id: string } | null;
  }>(
    token,
    `mutation($styleId: uuid!, $equipmentId: uuid!) {
      delete_images_style_equipment_by_pk(style_id: $styleId, equipment_id: $equipmentId) {
        file_id
      }
    }`,
    { styleId, equipmentId },
  );
  return data.delete_images_style_equipment_by_pk?.file_id ?? null;
}

export async function upsertStyleMuscleBase(
  token: string,
  styleId: string,
  { view, crop }: MuscleMapSlot,
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
        crop,
        file_id: fileId,
        updated_at: new Date().toISOString(),
      },
    },
  );
}

export async function deleteStyleMuscleBase(
  token: string,
  styleId: string,
  { view, crop }: MuscleMapSlot,
): Promise<string | null> {
  const data = await staffGql<{
    delete_images_style_muscle_bases_by_pk: { file_id: string } | null;
  }>(
    token,
    `mutation($styleId: uuid!, $view: String!, $crop: String!) {
      delete_images_style_muscle_bases_by_pk(style_id: $styleId, view: $view, crop: $crop) {
        file_id
      }
    }`,
    { styleId, view, crop },
  );
  return data.delete_images_style_muscle_bases_by_pk?.file_id ?? null;
}
