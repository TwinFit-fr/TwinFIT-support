"use client";

import { resolveSupportHasuraRole } from "@/lib/nhost/jwt";
import { isStudioStorageUrl } from "./storage-url";

/**
 * The 3d-workspace bucket is staff-only: the browser sends the staff JWT when it loads an avatar,
 * a clip, an equipment model or a thumbnail from Storage. The workspace keeps the current token
 * here (it changes every few minutes); loaders ask for the headers right before each request.
 */

let accessToken: string | null = null;

export function setStudioAccessToken(token: string | null): void {
  accessToken = token;
}

/** Authorization headers for a Storage URL of the bucket; none for any other URL. */
export function studioAssetHeaders(url: string): Record<string, string> {
  if (!accessToken || !isStudioStorageUrl(url)) return {};
  try {
    return { Authorization: `Bearer ${accessToken}`, "x-hasura-role": resolveSupportHasuraRole(accessToken) };
  } catch {
    return { Authorization: `Bearer ${accessToken}` };
  }
}

/** fetch with the bucket headers added when the URL needs them. */
export function fetchStudioAsset(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, headers: { ...studioAssetHeaders(url), ...(init.headers ?? {}) } });
}

const objectUrls = new Map<string, Promise<string>>();

/** A blob: URL for a stored asset (thumbnails in <img>, downloads), fetched once per session. */
export function studioAssetObjectUrl(url: string): Promise<string> {
  let pending = objectUrls.get(url);
  if (!pending) {
    pending = fetchStudioAsset(url).then(async (res) => {
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      return URL.createObjectURL(await res.blob());
    });
    pending.catch(() => objectUrls.delete(url));
    objectUrls.set(url, pending);
  }
  return pending;
}

/** Save a stored asset through the browser's download prompt. */
export async function downloadStudioAsset(url: string, fileName: string): Promise<void> {
  const href = await studioAssetObjectUrl(url);
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
