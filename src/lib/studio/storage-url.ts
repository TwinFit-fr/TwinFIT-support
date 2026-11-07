/**
 * Where the 3d-workspace files live, built from the public Nhost env so the browser and the
 * server agree. Rows store `file_id` (stable across environments) and a `*_url` snapshot; readers
 * prefer the id, so a row seeded from another environment still resolves here.
 */

export function storageBaseUrl(): string {
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

/** The URL to load a stored asset from: by file id when the row has one, else the stored URL. */
export function studioAssetUrl(fileId: string | null | undefined, storedUrl: string | null | undefined): string | null {
  if (fileId) {
    try {
      return studioFileUrl(fileId);
    } catch {
      return storedUrl ?? null;
    }
  }
  return storedUrl ?? null;
}

/** True for a URL inside the 3d-workspace Storage: it needs the staff JWT. */
export function isStudioStorageUrl(url: string): boolean {
  try {
    return url.startsWith(`${storageBaseUrl()}/files/`);
  } catch {
    return false;
  }
}
