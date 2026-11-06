import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import {
  generateEquipmentModel,
  meshyCreditsOrNull,
  storeUploadedEquipmentModel,
  syncProcessingEquipment,
} from "@/lib/studio/equipment-service";
import { MeshyError, isMeshyConfigured } from "@/lib/studio/meshy";
import { listEquipment } from "@/lib/studio/queries";

const MAX_MODEL_BYTES = 100 * 1024 * 1024;

const kindSchema = z.enum(["load", "support"]);
const codeSchema = z.string().trim().regex(/^[A-Z][A-Z0-9_]*$/, "code must be SCREAMING_SNAKE");

const generateSchema = z.object({
  kind: kindSchema,
  code: codeSchema,
  prompt: z.string().trim().max(800).nullable().optional(),
  image_data_url: z
    .string()
    .regex(/^data:image\/(png|jpe?g|webp);base64,/, "image_data_url must be a PNG, JPEG or WebP data URI")
    .max(28 * 1024 * 1024)
    .nullable()
    .optional(),
});

function fail(error: unknown, fallback: string) {
  if (error instanceof Response) return error;
  if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  if (error instanceof MeshyError) return NextResponse.json({ error: error.message }, { status: error.status >= 400 && error.status < 600 ? error.status : 502 });
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status: 500 });
}

/**
 * The equipment catalog with reference images, models and the Meshy balance. Running tasks are
 * brought up to date first, so polling this route is how a generation completes.
 */
export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
    await syncProcessingEquipment(token);
    const [equipment, credits] = await Promise.all([listEquipment(token), meshyCreditsOrNull()]);
    return NextResponse.json({ equipment, credits, configured: isMeshyConfigured() });
  } catch (error) {
    return fail(error, "Failed to list the equipment");
  }
}

/**
 * Start a model. JSON `{kind, code, prompt?, image_data_url?}` starts a Meshy image-to-3D task
 * from the style reference image (or the image given); multipart `file` + `kind` + `code`
 * registers a .glb / .gltf staff already have.
 */
export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = generateSchema.parse(await request.json());
      const model = await generateEquipmentModel(token, {
        kind: body.kind,
        code: body.code,
        prompt: body.prompt ?? null,
        imageDataUrl: body.image_data_url ?? null,
      });
      return NextResponse.json({ model }, { status: model.status === "error" ? 502 : 201 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "file is required" }, { status: 400 });
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "glb" && ext !== "gltf") return NextResponse.json({ error: "file must be a .glb or .gltf model" }, { status: 400 });
    if (file.size > MAX_MODEL_BYTES) return NextResponse.json({ error: "model larger than 100 MiB" }, { status: 400 });
    const kind = kindSchema.parse(form.get("kind"));
    const code = codeSchema.parse(form.get("code"));
    const model = await storeUploadedEquipmentModel(token, { kind, code, bytes: Buffer.from(await file.arrayBuffer()), ext });
    return NextResponse.json({ model }, { status: 201 });
  } catch (error) {
    return fail(error, "Failed to start the model");
  }
}
