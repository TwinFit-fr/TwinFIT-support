import { HasuraStorageClient } from "@nhost/nhost-js";
import { resolveSupportHasuraRole } from "@/lib/nhost/jwt";
import { publicFileUrl } from "@/lib/images/storage";
import { COACH_MEDIA_BUCKET, COACH_MEDIA_MAX_BYTES } from "./types";

export async function uploadCoachMediaFile(input: {
  token: string;
  bytes: Buffer;
  mimeType: string;
  /** Storage object name, e.g. lessons/{slug}/{locale}/{file}. */
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

/** Deletes a coach-media file by id; a missing file is not an error. */
export async function deleteCoachMediaFile(token: string, fileId: string): Promise<void> {
  const res = await fetch(publicFileUrl(fileId), {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-hasura-role": resolveSupportHasuraRole(token),
    },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Storage delete failed (${res.status})`);
  }
}
