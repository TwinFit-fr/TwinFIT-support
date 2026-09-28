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

/** Build multipart/form-data manually for Node uploads. */
function multipartFileBody(
  bytes: Buffer,
  name: string,
  mimeType: string,
): { body: Buffer; contentType: string } {
  const boundary = `----TwinFIT${Date.now().toString(16)}`;
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${name.replace(/"/g, "")}"\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
    "utf8",
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return {
    body: Buffer.concat([head, bytes, tail]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

export async function uploadImageFile(input: {
  token: string;
  bytes: Buffer;
  mimeType: string;
  name: string;
  metadata?: Record<string, string>;
}): Promise<{ id: string; url: string }> {
  const role = resolveSupportHasuraRole(input.token);
  const { body, contentType } = multipartFileBody(
    input.bytes,
    input.name,
    input.mimeType,
  );

  const res = await fetch(`${storageBaseUrl()}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.token}`,
      "x-hasura-role": role,
      "x-nhost-bucket-id": IMAGES_BUCKET,
      "x-nhost-file-name": input.name,
      "Content-Type": contentType,
    },
    body,
  });

  const text = await res.text();
  let parsedBody: unknown = null;
  try {
    parsedBody = text ? JSON.parse(text) : null;
  } catch {
    parsedBody = { raw: text };
  }
  if (!res.ok) {
    const message =
      typeof parsedBody === "object" && parsedBody && "error" in parsedBody
        ? String((parsedBody as { error: unknown }).error)
        : typeof parsedBody === "object" && parsedBody && "reason" in parsedBody
          ? String((parsedBody as { reason: unknown }).reason)
          : `Storage upload failed (${res.status})`;
    throw new Error(message);
  }

  const parsed = parsedBody as { id?: string; processedFiles?: { id: string }[] };
  const fileId = parsed.processedFiles?.[0]?.id ?? parsed.id;
  if (!fileId) {
    throw new Error("Storage upload did not return a file id");
  }
  return { id: fileId, url: publicFileUrl(fileId) };
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
