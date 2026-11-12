/**
 * Inline checks of the add-avatar form, with the very schemas the avatar routes validate against
 * (schemas.ts), so a value the form accepts is a value the server accepts. Every message names
 * what to do. Pure.
 */

import { codeFromFileName } from "./prompt.ts";
import { AVATAR_HEIGHT_M, MAX_IMAGE_BYTES, MAX_MODEL_BYTES, avatarHeightSchema, avatarNameSchema, codeSchema, modelUrlSchema } from "./schemas.ts";

export type AvatarFormInput = {
  code: string;
  name: string;
  /** As typed: "1.75", "1,75", "" (empty keeps the model's own units where allowed). */
  height: string;
  /** False where the server needs a height (the paid build); true where empty is allowed. */
  heightOptional: boolean;
  /** Codes other avatars already use. */
  takenCodes: readonly string[];
  /** Size in bytes of the chosen model file / reference image, when one is chosen. */
  fileBytes?: number | null;
  imageBytes?: number | null;
  /** The source needs a model file (upload) / a reference image (the paid build with "my image"). */
  fileRequired?: boolean;
  imageRequired?: boolean;
  /** The model link as typed, where the source is a link; leave it out otherwise. */
  url?: string;
};

export type AvatarFormField = "file" | "url" | "image" | "name" | "code" | "height";
export type AvatarFormErrors = Partial<Record<AvatarFormField, string>>;

/** "1,75" and " 1.75 " read as 1.75; empty is null; anything else NaN. */
export function parseHeight(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  return /^\d*\.?\d+$|^\d+\.$/.test(t) ? Number(t) : Number.NaN;
}

/** The first free code from `base`: BASE, BASE_2, BASE_3… */
export function freeCode(base: string, taken: readonly string[]): string {
  const used = new Set(taken.map((c) => c.toUpperCase()));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}_${n}`)) return `${base}_${n}`;
}

/**
 * The name and code a chosen model suggests: "Neutral Man.glb" or a link ending in
 * ".../neutral-man.glb?v=2" give "Neutral Man" / "neutral-man" and NEUTRAL_MAN (the next free
 * code if that one is taken); a hash file name gives "Avatar 64BFA1". Null when nothing usable
 * can be read (no file name in the link).
 */
export function identityFromModel(nameOrUrl: string, taken: readonly string[]): { name: string; code: string } | null {
  let last = nameOrUrl.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(last)) {
    try {
      last = new URL(last).pathname.split("/").filter(Boolean).at(-1) ?? "";
      last = decodeURIComponent(last);
    } catch {
      return null;
    }
  }
  let name = last.replace(/\.(glb|gltf|vrm)$/i, "").trim();
  // An opaque id (Ready Player Me names files by a hash) makes a poor name: keep its start only.
  if (/^[0-9a-f-]{16,}$/i.test(name)) name = `Avatar ${name.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  const code = codeFromFileName(name);
  if (!name || !codeSchema.safeParse(code).success) return null;
  return { name: name.slice(0, 120), code: freeCode(code, taken) };
}

const mib = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

export function validateAvatarForm(input: AvatarFormInput): AvatarFormErrors {
  const errors: AvatarFormErrors = {};
  if (input.fileRequired && input.fileBytes == null) errors.file = "Required: choose a rigged .glb or .gltf file.";
  if (input.url !== undefined) {
    const url = input.url.trim();
    if (!url) errors.url = "Required: paste an https link to a .glb or .gltf.";
    else if (!modelUrlSchema.safeParse(url).success) errors.url = "Use a full link that starts with https:// (https://example.com/model.glb).";
  }
  if (input.imageRequired && input.imageBytes == null) errors.image = "Required: choose a full-body image, or use the style's image instead.";
  const code = input.code.trim();
  if (!code) errors.code = "Required: a short ID such as NEUTRAL_MAN.";
  else if (!codeSchema.safeParse(code).success) errors.code = "Use capital letters, digits and _ only, starting with a letter (NEUTRAL_MAN).";
  else if (input.takenCodes.some((c) => c.toUpperCase() === code)) errors.code = `Another avatar uses ${code}. Try ${freeCode(code, input.takenCodes)}.`;

  if (!input.name.trim()) errors.name = "Required: the name shown in the avatar menu.";
  else if (!avatarNameSchema.safeParse(input.name).success) errors.name = "Keep the name under 120 characters.";

  const height = parseHeight(input.height);
  const range = `${AVATAR_HEIGHT_M.min} and ${AVATAR_HEIGHT_M.max} m`;
  if (height === null) {
    if (!input.heightOptional) errors.height = `Required: a height between ${range}.`;
  } else if (Number.isNaN(height)) errors.height = `Enter a number in metres, between ${range}.`;
  else if (!avatarHeightSchema.safeParse(height).success) {
    errors.height = height >= 50 && height <= 250 ? `That reads as centimetres. Enter metres: ${(height / 100).toFixed(2)}.` : `Enter a height between ${range}.`;
  }

  if (input.fileBytes != null && input.fileBytes > MAX_MODEL_BYTES) errors.file = `This file is ${mib(input.fileBytes)}; the limit is ${mib(MAX_MODEL_BYTES)}.`;
  if (input.imageBytes != null && input.imageBytes > MAX_IMAGE_BYTES) errors.image = `This image is ${mib(input.imageBytes)}; the limit is ${mib(MAX_IMAGE_BYTES)}.`;
  return errors;
}

const FIELD_WORDS: Record<AvatarFormField, string> = { file: "the model file", url: "the model link", image: "the reference image", name: "the name", code: "the code", height: "the height" };

/** Why the main action is disabled, naming the first field to fix (in form order), or null. */
export function avatarFormBlocker(errors: AvatarFormErrors): string | null {
  const first = (Object.keys(FIELD_WORDS) as AvatarFormField[]).find((f) => errors[f]);
  if (!first) return null;
  const missing = errors[first]!.startsWith("Required");
  return `${missing ? "Add" : "Fix"} ${FIELD_WORDS[first]} to continue${Object.keys(errors).length > 1 ? ` (${Object.keys(errors).length} fields need attention)` : ""}.`;
}

/** A server refusal in words the form can show: a duplicate code says so instead of the database rule. */
export function explainAvatarError(message: string): string {
  if (/duplicate key|unique/i.test(message) && /code/i.test(message)) return "Another avatar already uses this code. Choose another code and try again.";
  if (/SCREAMING_SNAKE/.test(message)) return "The code may only use capital letters, digits and _, starting with a letter.";
  if (/less than or equal to 2\.5|greater than or equal to 0\.5/.test(message)) return `The height must be between ${AVATAR_HEIGHT_M.min} and ${AVATAR_HEIGHT_M.max} metres.`;
  return message;
}
