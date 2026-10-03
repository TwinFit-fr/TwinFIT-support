import { downloadImageFile } from "./storage";
import type { ImageStyle } from "./types";

export type ImageInput = { bytes: Buffer; mimeType: string };

/** The style's brand logo as an edit input, or null if none is set or it cannot be read. */
export async function loadLogoInput(
  token: string,
  style: Pick<ImageStyle, "logo_file_id">,
): Promise<ImageInput | null> {
  const fileId = style.logo_file_id;
  if (!fileId) return null;
  try {
    const file = await downloadImageFile(token, fileId);
    return { bytes: file.bytes, mimeType: file.contentType };
  } catch {
    // A missing logo must never block generation.
    return null;
  }
}
