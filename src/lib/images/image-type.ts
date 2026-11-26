/**
 * The only image types Support stores or serves from user uploads: raster formats that can never
 * run script. SVG, HTML and anything else are refused on upload and never served by the file
 * proxy, whatever Content-Type the client or Storage claims; the type comes from the bytes.
 */
import { API_CONTENT_SECURITY_POLICY } from "../security-headers.ts";

export const ALLOWED_IMAGE_MIME_TYPES = ["image/png", "image/webp", "image/jpeg"] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/** `accept` attribute of the image file inputs. */
export const IMAGE_FILE_ACCEPT = ALLOWED_IMAGE_MIME_TYPES.join(",");

const EXTENSION_BY_MIME: Record<AllowedImageMimeType, string> = {
  "image/png": "png",
  "image/webp": "webp",
  "image/jpeg": "jpg",
};

export function isAllowedImageMimeType(value: string): value is AllowedImageMimeType {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

/** The image type of `bytes` from its magic number, or null when it is not PNG, WebP or JPEG. */
export function sniffImageType(bytes: Uint8Array): AllowedImageMimeType | null {
  if (startsWith(bytes, PNG)) return "image/png";
  if (startsWith(bytes, JPEG)) return "image/jpeg";
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return "image/webp";
  return null;
}

/**
 * Why an upload is refused, or null when it may be stored: the declared type must be allowed,
 * the bytes must match it, and the file must fit `maxBytes`.
 */
export function imageUploadProblem(
  bytes: Uint8Array,
  declaredMimeType: string,
  maxBytes: number,
): string | null {
  if (!isAllowedImageMimeType(declaredMimeType)) {
    return "Only PNG, WebP and JPEG images are allowed";
  }
  if (bytes.length === 0) return "The file is empty";
  if (bytes.length > maxBytes) {
    return `Image must be under ${Math.round(maxBytes / (1024 * 1024))} MB`;
  }
  const actual = sniffImageType(bytes);
  if (!actual) return "The file is not a PNG, WebP or JPEG image";
  if (actual !== declaredMimeType) {
    return `The file content is ${actual}, not ${declaredMimeType}`;
  }
  return null;
}

/** `fileName` with the extension of `mimeType`, so a stored name never claims another type. */
export function withImageExtension(fileName: string, mimeType: AllowedImageMimeType): string {
  const extension = EXTENSION_BY_MIME[mimeType];
  const dot = fileName.lastIndexOf(".");
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const current = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  if (current === extension || (mimeType === "image/jpeg" && current === "jpeg")) return fileName;
  return `${stem || "image"}.${extension}`;
}

const STORAGE_FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Storage file ids are UUIDs; anything else never reaches the Storage URL. */
export function isStorageFileId(value: string): boolean {
  return STORAGE_FILE_ID.test(value);
}

/** Headers of a file served by `GET /api/images/files/[id]`; `mimeType` comes from the bytes. */
export function fileProxyHeaders(fileId: string, mimeType: AllowedImageMimeType): Record<string, string> {
  return {
    "Content-Type": mimeType,
    "Content-Disposition": `inline; filename="${fileId}.${EXTENSION_BY_MIME[mimeType]}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": API_CONTENT_SECURITY_POLICY,
    "Cross-Origin-Resource-Policy": "same-origin",
    "Cache-Control": "private, max-age=3600",
  };
}
