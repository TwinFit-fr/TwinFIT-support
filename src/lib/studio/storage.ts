import { HasuraStorageClient } from "@nhost/nhost-js";
import { resolveSupportHasuraRole } from "@/lib/nhost/jwt";
import { STUDIO_BUCKET } from "./types";

function storageBaseUrl(): string {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
  const region = process.env.NEXT_PUBLIC_NHOST_REGION;
  if (!subdomain || !region) {
    throw new Error("NEXT_PUBLIC_NHOST_SUBDOMAIN and NEXT_PUBLIC_NHOST_REGION are required");
  }
  return `https://${subdomain}.storage.${region}.nhost.run/v1`;
}

export function studioFileUrl(fileId: string): string {
  return `${storageBaseUrl()}/files/${fileId}`;
}

/** Upload a model or clip into the 3d-workspace bucket with the staff JWT (Hasura permission on storage.files). */
export async function uploadStudioFile(input: {
  token: string;
  bytes: Buffer;
  mimeType: string;
  name: string;
}): Promise<{ id: string; url: string }> {
  // Per-request client: a shared one would leak one user's token into another's request.
  const storage = new HasuraStorageClient({ url: storageBaseUrl() });
  storage.setAccessToken(input.token);

  const { fileMetadata, error } = await storage.upload({
    file: new File([new Uint8Array(input.bytes)], input.name, { type: input.mimeType }),
    name: input.name,
    bucketId: STUDIO_BUCKET,
    headers: { "x-hasura-role": resolveSupportHasuraRole(input.token) },
  });
  if (error) {
    throw new Error(error.message || `Storage upload failed (${error.status})`);
  }
  return { id: fileMetadata.id, url: studioFileUrl(fileMetadata.id) };
}

/** Best-effort removal of a file this request uploaded and can no longer use (the row insert failed). */
export async function deleteStudioFile(token: string, fileId: string): Promise<void> {
  try {
    await fetch(studioFileUrl(fileId), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "x-hasura-role": resolveSupportHasuraRole(token) },
    });
  } catch {
    // The orphan is harmless; staff can remove it from the bucket later.
  }
}
