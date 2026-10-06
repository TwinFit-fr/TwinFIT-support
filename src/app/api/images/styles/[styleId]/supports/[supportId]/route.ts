import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { assetBodySchema, assetErrorResponse, decodeAssetUpload } from "@/lib/images/asset-request";
import { generateImage } from "@/lib/images/openai";
import { fillPromptTemplate } from "@/lib/images/prompt";
import {
  getStyle,
  listActiveSupportEquipment,
  listImagePromptsForStyle,
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

type Ctx = { params: Promise<{ styleId: string; supportId: string }> };

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

    const body = assetBodySchema.parse(await request.json());
    const previous =
      style.supports.find((s) => s.support_equipment_id === supportId)?.file_id ?? null;

    let bytes: Buffer;
    let mimeType: string;

    if (body.action === "upload") {
      const decoded = decodeAssetUpload(body);
      if (decoded instanceof NextResponse) return decoded;
      ({ bytes, mimeType } = decoded);
    } else {
      let template;
      try {
        template = (await listImagePromptsForStyle(token, styleId)).support;
      } catch {
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
    return assetErrorResponse(error, "Support reference update failed");
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
    return assetErrorResponse(error, "Support reference removal failed", 500);
  }
}
