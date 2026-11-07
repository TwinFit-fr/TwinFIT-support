import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { generateStyledAvatar, syncProcessingAvatars } from "@/lib/studio/avatar-service";
import { MeshyError } from "@/lib/studio/meshy";
import { createAvatar, listAvatars } from "@/lib/studio/queries";
import { deleteStudioFile, uploadStudioFile } from "@/lib/studio/storage";
import { AVATAR_RIGS, AVATAR_SUBJECTS } from "@/lib/studio/types";

const MAX_MODEL_BYTES = 100 * 1024 * 1024;

export const socketSchema = z.object({
  id: z.string().trim().min(1).max(64),
  bone: z.string().trim().min(1).max(128),
  offset: z.tuple([z.number(), z.number(), z.number()]).optional(),
  rotation: z
    .union([
      z.tuple([z.number(), z.number(), z.number()]),
      z.tuple([z.number(), z.number(), z.number(), z.number()]),
    ])
    .optional(),
});

const fieldsSchema = z.object({
  code: z.string().trim().regex(/^[A-Z][A-Z0-9_]*$/, "code must be SCREAMING_SNAKE"),
  name: z.string().trim().min(1).max(120),
  subject: z.enum(AVATAR_SUBJECTS as [string, ...string[]]),
  rig: z.enum(AVATAR_RIGS as [string, ...string[]]),
  height_m: z.number().min(0.5).max(2.5).nullable(),
  sockets: z.array(socketSchema).max(32),
  is_default: z.boolean(),
  params: z.record(z.unknown()).optional(),
});

type Fields = z.infer<typeof fieldsSchema>;

const urlBodySchema = z.object({
  url: z.string().url().refine((u) => u.startsWith("https://"), "only https URLs"),
  fields: fieldsSchema,
});

/** A styled avatar from the catalog's character image (Meshy image-to-3D + rigging). */
const styleBodySchema = z.object({
  mode: z.literal("style"),
  code: z.string().trim().regex(/^[A-Z][A-Z0-9_]*$/, "code must be SCREAMING_SNAKE"),
  name: z.string().trim().min(1).max(120),
  subject: z.enum(["man", "woman"]),
  height_m: z.number().min(0.5).max(2.5),
  is_default: z.boolean(),
  image_data_url: z
    .string()
    .regex(/^data:image\/(png|jpe?g|webp);base64,/, "image_data_url must be a PNG, JPEG or WebP data URI")
    .max(28 * 1024 * 1024)
    .nullable()
    .optional(),
});

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    // Avatars being generated advance here: polling the list is how a generation completes.
    await syncProcessingAvatars(token);
    return NextResponse.json({ avatars: await listAvatars(token) });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list avatars" },
      { status: 500 },
    );
  }
}

function modelKind(name: string, contentType: string | null): { ext: "glb" | "gltf"; mime: string } | null {
  if (/\.glb(\?|$)/i.test(name) || contentType?.includes("model/gltf-binary")) {
    return { ext: "glb", mime: "model/gltf-binary" };
  }
  if (/\.gltf(\?|$)/i.test(name) || contentType?.includes("model/gltf+json")) {
    return { ext: "gltf", mime: "model/gltf+json" };
  }
  return null;
}

/** Downloads a model the staff member pointed at (an https URL of a .glb / .gltf). */
async function fetchModel(url: string): Promise<{ bytes: Buffer; kind: { ext: "glb" | "gltf"; mime: string } }> {
  const res = await fetch(url, { redirect: "follow", headers: { Accept: "model/gltf-binary, model/gltf+json, */*" } });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > MAX_MODEL_BYTES) throw new Error("model larger than 100 MiB");
  const kind = modelKind(new URL(res.url || url).pathname, res.headers.get("content-type"));
  if (!kind) throw new Error("The URL does not point at a .glb or .gltf model");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength > MAX_MODEL_BYTES) throw new Error("model larger than 100 MiB");
  if (kind.ext === "glb" && bytes.subarray(0, 4).toString("ascii") !== "glTF") {
    throw new Error("The file is not a binary glTF");
  }
  return { bytes, kind };
}

async function storeAvatar(token: string, fields: Fields, bytes: Buffer, kind: { ext: "glb" | "gltf"; mime: string }) {
  const uploaded = await uploadStudioFile({
    token,
    bytes,
    mimeType: kind.mime,
    name: `avatars/${fields.code.toLowerCase()}.${kind.ext}`,
  });
  try {
    return await createAvatar(token, {
      code: fields.code,
      name: fields.name,
      subject: fields.subject as (typeof AVATAR_SUBJECTS)[number],
      rig: fields.rig as (typeof AVATAR_RIGS)[number],
      height_m: fields.height_m,
      sockets: fields.sockets,
      params: fields.params ?? {},
      is_default: fields.is_default,
      file_id: uploaded.id,
      model_url: uploaded.url,
    });
  } catch (error) {
    await deleteStudioFile(token, uploaded.id);
    throw error;
  }
}

/**
 * Register a base avatar. Three bodies:
 * - multipart/form-data: `file` (.glb / .gltf, also the mannequin the browser generates) + `fields` (JSON);
 * - application/json: `{ url, fields }` to import a model from an https URL (Ready Player Me, a CDN, ...);
 * - application/json: `{ mode: "style", code, name, subject, height_m, is_default, image_data_url? }` to
 *   build one with Meshy from the style's character image (the row starts processing; GET finishes it).
 * `fields` = code, name, subject, rig, height_m, sockets, is_default, params?.
 */
export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const json = (await request.json()) as { mode?: string };
      if (json?.mode === "style") {
        const body = styleBodySchema.parse(json);
        const avatar = await generateStyledAvatar(token, {
          code: body.code,
          name: body.name,
          subject: body.subject,
          height_m: body.height_m,
          is_default: body.is_default,
          imageDataUrl: body.image_data_url ?? null,
        });
        return NextResponse.json({ avatar }, { status: avatar.status === "error" ? 502 : 201 });
      }
      const body = urlBodySchema.parse(json);
      const { bytes, kind } = await fetchModel(body.url);
      const avatar = await storeAvatar(token, body.fields, bytes, kind);
      return NextResponse.json({ avatar }, { status: 201 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    const kind = modelKind(file.name, file.type || null);
    if (!kind) {
      return NextResponse.json({ error: "file must be a .glb or .gltf model" }, { status: 400 });
    }
    if (file.size > MAX_MODEL_BYTES) {
      return NextResponse.json({ error: "model larger than 100 MiB" }, { status: 400 });
    }
    const fields = fieldsSchema.parse(JSON.parse(String(form.get("fields") ?? "{}")));
    const avatar = await storeAvatar(token, fields, Buffer.from(await file.arrayBuffer()), kind);
    return NextResponse.json({ avatar }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    if (error instanceof MeshyError) return NextResponse.json({ error: error.message }, { status: error.status >= 400 && error.status < 600 ? error.status : 502 });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create the avatar" },
      { status: 500 },
    );
  }
}
