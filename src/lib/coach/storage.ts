import { HasuraStorageClient } from "@nhost/nhost-js";
import { resolveSupportHasuraRole } from "@/lib/nhost/jwt";
import { publicFileUrl } from "@/lib/images/storage";
import { staffGql } from "@/lib/staff-gql";
import type { MediaFile } from "./media";
import { COACH_MEDIA_BUCKET, COACH_MEDIA_MAX_BYTES } from "./types";

export async function uploadCoachMediaFile(input: {
  token: string;
  bytes: Buffer;
  mimeType: string;
  /** Storage object name, e.g. lessons/{slug}/{timestamp}-{file}. */
  name: string;
}): Promise<{ id: string; url: string }> {
  if (input.bytes.byteLength > COACH_MEDIA_MAX_BYTES) {
    throw new Error(`File exceeds the ${COACH_MEDIA_MAX_BYTES / (1024 * 1024)} MiB coach-media limit`);
  }

  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
  const region = process.env.NEXT_PUBLIC_NHOST_REGION;
  if (!subdomain || !region) {
    throw new Error("NEXT_PUBLIC_NHOST_SUBDOMAIN and NEXT_PUBLIC_NHOST_REGION are required");
  }
  const url = `https://${subdomain}.storage.${region}.nhost.run/v1`;
  const storage = new HasuraStorageClient({ url });
  storage.setAccessToken(input.token);

  const { fileMetadata, error } = await storage.upload({
    file: new File([new Uint8Array(input.bytes)], input.name, { type: input.mimeType }),
    name: input.name,
    bucketId: COACH_MEDIA_BUCKET,
    headers: { "x-hasura-role": resolveSupportHasuraRole(input.token) },
  });
  if (error) {
    throw new Error(error.message || `Storage upload failed (${error.status})`);
  }
  return { id: fileMetadata.id, url: publicFileUrl(fileMetadata.id) };
}

type FileRow = {
  id: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  createdAt: string;
  updatedAt: string;
};

const FILE_FIELDS = "id name mimeType size createdAt updatedAt";

function toMediaFile(row: FileRow): MediaFile {
  return { ...row, url: publicFileUrl(row.id) };
}

/** Every uploaded file of the coach-media bucket, by name; `prefix` narrows to one folder subtree. */
export async function listCoachMediaFiles(token: string, prefix?: string): Promise<MediaFile[]> {
  const where: Record<string, unknown> = { bucketId: { _eq: COACH_MEDIA_BUCKET }, isUploaded: { _eq: true } };
  if (prefix) where.name = { _like: `${prefix.replace(/[%_\\]/g, (c) => `\\${c}`)}/%` };
  const data = await staffGql<{ files: FileRow[] }>(
    token,
    `query CoachMedia($where: files_bool_exp!) {
      files(where: $where, order_by: { name: asc }, limit: 5000) { ${FILE_FIELDS} }
    }`,
    { where },
  );
  return (data.files ?? []).map(toMediaFile);
}

/** One coach-media file, or null when it does not exist or sits in another bucket. */
export async function getCoachMediaFile(token: string, fileId: string): Promise<MediaFile | null> {
  const data = await staffGql<{ file: (FileRow & { bucketId: string }) | null }>(
    token,
    `query CoachMediaFile($id: uuid!) {
      file(id: $id) { ${FILE_FIELDS} bucketId }
    }`,
    { id: fileId },
  );
  const row = data.file;
  return row && row.bucketId === COACH_MEDIA_BUCKET ? toMediaFile(row) : null;
}

/** Moves or renames a file: the object name is metadata, the public URL (by id) does not change. */
export async function renameCoachMediaFile(token: string, fileId: string, name: string): Promise<MediaFile> {
  const current = await getCoachMediaFile(token, fileId);
  if (!current) throw new Error("File not found in coach-media");
  const data = await staffGql<{ updateFile: FileRow | null }>(
    token,
    `mutation RenameCoachMedia($id: uuid!, $name: String!) {
      updateFile(pk_columns: { id: $id }, _set: { name: $name }) { ${FILE_FIELDS} }
    }`,
    { id: fileId, name },
  );
  if (!data.updateFile) throw new Error("Rename failed");
  return toMediaFile(data.updateFile);
}

/**
 * Deletes a coach-media file by id; a missing file is not an error. With `underFolder`, only a file
 * inside that folder is deleted: library images in other folders are kept for reuse.
 */
export async function deleteCoachMediaFile(
  token: string,
  fileId: string,
  options: { underFolder?: string } = {},
): Promise<{ deleted: boolean; reason?: "missing" | "outside-folder" }> {
  if (options.underFolder) {
    const file = await getCoachMediaFile(token, fileId);
    if (!file) return { deleted: false, reason: "missing" };
    if (!file.name.startsWith(`${options.underFolder}/`)) return { deleted: false, reason: "outside-folder" };
  }
  const res = await fetch(publicFileUrl(fileId), {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-hasura-role": resolveSupportHasuraRole(token),
    },
  });
  if (res.status === 404) return { deleted: false, reason: "missing" };
  if (!res.ok) {
    throw new Error(`Storage delete failed (${res.status})`);
  }
  return { deleted: true };
}
