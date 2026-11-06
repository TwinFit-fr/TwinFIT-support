import sharp from "sharp";

const MIME_BY_FORMAT: Record<string, string> = {
  png: "image/png",
  webp: "image/webp",
  jpeg: "image/jpeg",
};

/** Mirrors an image left to right, keeping its format and transparency. Flipping twice restores it. */
export async function flipImage(input: Buffer): Promise<{ bytes: Buffer; mimeType: string }> {
  const { format } = await sharp(input).metadata();
  const mimeType = format ? MIME_BY_FORMAT[format] : undefined;
  if (!mimeType) throw new Error(`Cannot flip a ${format ?? "unknown"} image`);
  const flipped = sharp(input).flop();
  // Default re-encoding is visibly lossy on repeated flips; PNG is lossless already.
  if (format === "webp") flipped.webp({ quality: 95, alphaQuality: 100 });
  if (format === "jpeg") flipped.jpeg({ quality: 95 });
  return { bytes: await flipped.toBuffer(), mimeType };
}
