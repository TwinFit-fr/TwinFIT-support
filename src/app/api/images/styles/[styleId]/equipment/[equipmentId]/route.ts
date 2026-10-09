import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { assetBodySchema, assetErrorResponse, decodeAssetUpload } from "@/lib/images/asset-request";
import { generateImage } from "@/lib/images/openai";
import { fillPromptTemplate } from "@/lib/images/prompt";
import { getStyle, listActiveEquipment, listImagePromptsForStyle } from "@/lib/images/queries";
import { equipmentFileName } from "@/lib/images/reference";
import { deleteImageFile } from "@/lib/images/storage";
import {
  deleteStyleEquipment,
  extensionForMime,
  replaceUploadedFile,
  upsertStyleEquipment,
} from "@/lib/images/style-assets";

export const maxDuration = 300;

type Ctx = { params: Promise<{ styleId: string; equipmentId: string }> };

/** Uploads or generates a load equipment image of the style (the app's filter card). */
export async function POST(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { styleId, equipmentId } = await context.params;
    const style = await getStyle(token, styleId);
    if (!style) return NextResponse.json({ error: "Style not found" }, { status: 404 });

    const equipment = (await listActiveEquipment(token)).find((e) => e.id === equipmentId);
    if (!equipment) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

    const body = assetBodySchema.parse(await request.json());
    const previous = style.equipment.find((e) => e.equipment_id === equipmentId)?.file_id ?? null;

    let bytes: Buffer;
    let mimeType: string;

    if (body.action === "upload") {
      const decoded = decodeAssetUpload(body);
      if (decoded instanceof NextResponse) return decoded;
      ({ bytes, mimeType } = decoded);
    } else {
      let template;
      try {
        template = (await listImagePromptsForStyle(token, styleId)).equipment;
      } catch {
        return NextResponse.json({ error: "No equipment prompt available" }, { status: 400 });
      }
      const prompt = fillPromptTemplate(template.content, {
        name: equipment.name,
        description: equipment.description ?? "",
        exo_id: 0,
        background_color: style.params.background_color,
        equipment: equipment.name,
        equipment_description: equipment.description?.trim() || "",
      }).trim();
      const result = await generateImage(prompt, style.params);
      bytes = result.bytes;
      mimeType = result.mimeType;
    }

    const uploaded = await replaceUploadedFile({
      token,
      bytes,
      mimeType,
      name: equipmentFileName(style.code, equipment.code, extensionForMime(mimeType)),
      previousFileId: previous,
    });
    await upsertStyleEquipment(token, styleId, equipmentId, uploaded);
    return NextResponse.json({ style: await getStyle(token, styleId) });
  } catch (error) {
    return assetErrorResponse(error, "Equipment image update failed");
  }
}

export async function DELETE(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { styleId, equipmentId } = await context.params;
    const previous = await deleteStyleEquipment(token, styleId, equipmentId);
    if (previous) await deleteImageFile(token, previous);
    return NextResponse.json({ style: await getStyle(token, styleId) });
  } catch (error) {
    return assetErrorResponse(error, "Equipment image removal failed", 500);
  }
}
