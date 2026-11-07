import { HasuraStorageClient } from "@nhost/nhost-js";
import { resolveSupportHasuraRole } from "@/lib/nhost/jwt";
import { storageBaseUrl, studioFileUrl } from "./storage-url";
import { STUDIO_BUCKET } from "./types";

export { studioFileUrl };

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
export async function deleteStudioFile(token: string, fileId: string): Promise<boolean> {
  try {
    const res = await fetch(studioFileUrl(fileId), {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "x-hasura-role": resolveSupportHasuraRole(token) },
    });
    return res.ok || res.status === 404;
  } catch {
    // The orphan is harmless; the orphan sweep (Settings) removes it later.
    return false;
  }
}
