import { downloadImageFile } from "./storage";
import type { ImageSettings } from "./types";

export type ImageInput = { bytes: Buffer; mimeType: string };

/** The configured brand logo as an edit input, or null if none is set or it cannot be read. */
export async function loadLogoInput(
  token: string,
  settings: ImageSettings,
): Promise<ImageInput | null> {
  const fileId = settings.params.logo_file_id;
  if (!fileId) return null;
  try {
    const file = await downloadImageFile(token, fileId);
    return { bytes: file.bytes, mimeType: file.contentType };
  } catch {
    // A missing logo must never block generation.
    return null;
  }
}
