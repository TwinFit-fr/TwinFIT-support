import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { generateImage } from "@/lib/images/openai";
import { fillPromptTemplate } from "@/lib/images/prompt";
import {
  getStyle,
  listActiveSupportEquipment,
  listImagePrompts,
} from "@/lib/images/queries";
import { supportFileName } from "@/lib/images/reference";
import { deleteImageFile } from "@/lib/images/storage";
import {
  deleteStyleSupport,
  extensionForMime,
  replaceUploadedFile,
  upsertStyleSupport,
} from "@/lib/images/style-assets";

export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

type Ctx = { params: Promise<{ styleId: string; supportId: string }> };

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate") }),
  z.object({
    action: z.literal("upload"),
    mimeType: z.enum(["image/png", "image/webp", "image/jpeg"]),
    data: z.string().min(1),
  }),
]);

export async function POST(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { styleId, supportId } = await context.params;
    const style = await getStyle(token, styleId);
    if (!style) return NextResponse.json({ error: "Style not found" }, { status: 404 });

    const supports = await listActiveSupportEquipment(token);
    const support = supports.find((s) => s.id === supportId);
    if (!support) {
      return NextResponse.json({ error: "Support equipment not found" }, { status: 404 });
    }

    const body = bodySchema.parse(await request.json());
    const previous =
      style.supports.find((s) => s.support_equipment_id === supportId)?.file_id ?? null;

    let bytes: Buffer;
    let mimeType: string;

    if (body.action === "upload") {
      bytes = Buffer.from(body.data, "base64");
      if (bytes.length > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ error: "Reference image must be under 20 MB" }, { status: 400 });
      }
      mimeType = body.mimeType;
    } else {
      const prompts = await listImagePrompts(token);
      const template =
        prompts.find((p) => p.id === style.support_prompt_id) ??
        prompts.find((p) => p.kind === "support");
      if (!template) {
        return NextResponse.json({ error: "No support prompt available" }, { status: 400 });
      }
      const prompt = fillPromptTemplate(template.content, {
        name: support.name,
        description: support.description ?? "",
        exo_id: 0,
        background_color: style.params.background_color,
        support: support.name,
        support_description: support.description?.trim() || "",
      }).trim();
      const result = await generateImage(prompt, style.params);
      bytes = result.bytes;
      mimeType = result.mimeType;
    }

    const uploaded = await replaceUploadedFile({
      token,
      bytes,
      mimeType,
      name: supportFileName(style.code, support.code, extensionForMime(mimeType)),
      previousFileId: previous,
    });
    await upsertStyleSupport(token, styleId, supportId, uploaded.id);
    return NextResponse.json({ style: await getStyle(token, styleId) });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Support reference update failed" },
      { status: 502 },
    );
  }
}

export async function DELETE(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { styleId, supportId } = await context.params;
    const previous = await deleteStyleSupport(token, styleId, supportId);
    if (previous) await deleteImageFile(token, previous);
    return NextResponse.json({ style: await getStyle(token, styleId) });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Support reference removal failed" },
      { status: 500 },
    );
  }
}
