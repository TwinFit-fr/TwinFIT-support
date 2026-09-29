import { HasuraStorageClient } from "@nhost/nhost-js";
import { resolveSupportHasuraRole } from "@/lib/nhost/jwt";
import { IMAGES_BUCKET } from "./types";

function storageBaseUrl(): string {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
  const region = process.env.NEXT_PUBLIC_NHOST_REGION;
  if (!subdomain || !region) {
    throw new Error("NEXT_PUBLIC_NHOST_SUBDOMAIN and NEXT_PUBLIC_NHOST_REGION are required");
  }
  return `https://${subdomain}.storage.${region}.nhost.run/v1`;
}

export function publicFileUrl(fileId: string): string {
  return `${storageBaseUrl()}/files/${fileId}`;
}

export async function uploadImageFile(input: {
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
    bucketId: IMAGES_BUCKET,
    headers: { "x-hasura-role": resolveSupportHasuraRole(input.token) },
  });
  if (error) {
    throw new Error(error.message || `Storage upload failed (${error.status})`);
  }
  return { id: fileMetadata.id, url: publicFileUrl(fileMetadata.id) };
}

export async function downloadImageFile(
  token: string,
  fileId: string,
): Promise<{ bytes: Buffer; contentType: string }> {
  const role = resolveSupportHasuraRole(token);
  const res = await fetch(publicFileUrl(fileId), {
    headers: {
      Authorization: `Bearer ${token}`,
      "x-hasura-role": role,
    },
  });
  if (!res.ok) {
    throw new Error(`Storage download failed (${res.status})`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return {
    bytes: Buffer.from(arrayBuffer),
    contentType: res.headers.get("Content-Type") || "application/octet-stream",
  };
}

export async function deleteImageFile(token: string, fileId: string): Promise<void> {
  const role = resolveSupportHasuraRole(token);
  const res = await fetch(publicFileUrl(fileId), {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      "x-hasura-role": role,
    },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Storage delete failed (${res.status})`);
  }
}
