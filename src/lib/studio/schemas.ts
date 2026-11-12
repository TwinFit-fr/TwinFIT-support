/**
 * Zod schemas and limits shared by the /api/studio routes, so a rule (what a code looks like,
 * how big a model may be) is written once.
 */

import { z } from "zod";

/** Rigged avatars and generated models: the bucket's max_upload_file_size (100 MiB). */
export const MAX_MODEL_BYTES = 100 * 1024 * 1024;
export const MAX_CLIP_BYTES = 100 * 1024 * 1024;
/** Reference images sent to the provider: 20 MB of pixels, 28 MB once base64 encoded. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_DATA_URL = 28 * 1024 * 1024;

export const codeSchema = z.string().trim().regex(/^[A-Z][A-Z0-9_]*$/, "code must be SCREAMING_SNAKE");

/** A base avatar's display name and height in metres (the avatar routes and the add-avatar form). */
export const avatarNameSchema = z.string().trim().min(1).max(120);
export const AVATAR_HEIGHT_M = { min: 0.5, max: 2.5 } as const;
export const avatarHeightSchema = z.number().min(AVATAR_HEIGHT_M.min).max(AVATAR_HEIGHT_M.max);
/** A model to import from the web: a full https link (the import route and the add-avatar form). */
export const modelUrlSchema = z.string().url().refine((u) => u.startsWith("https://"), "only https URLs");

export const equipmentKindSchema = z.enum(["load", "support"]);

export const imageDataUrlSchema = z
  .string()
  .regex(/^data:image\/(png|jpe?g|webp);base64,/, "image_data_url must be a PNG, JPEG or WebP data URI")
  .max(MAX_IMAGE_DATA_URL);

export const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

export const socketSchema = z.object({
  id: z.string().trim().min(1).max(64),
  bone: z.string().trim().min(1).max(128),
  offset: vec3Schema.optional(),
  rotation: z.union([vec3Schema, z.tuple([z.number(), z.number(), z.number(), z.number()])]).optional(),
});

export const socketsSchema = z
  .array(socketSchema)
  .max(32)
  .refine((sockets) => new Set(sockets.map((s) => s.id)).size === sockets.length, "socket ids must be unique");

export const uuidSchema = z.string().uuid();
