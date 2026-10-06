import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { assetBodySchema, assetErrorResponse, decodeAssetUpload } from "@/lib/images/asset-request";
import { generateImage } from "@/lib/images/openai";
import { getStyle } from "@/lib/images/queries";
import { libraryReferenceFileName } from "@/lib/images/reference";
import { getStyleReference, updateStyleReference } from "@/lib/images/references";
import { extensionForMime, replaceUploadedFile } from "@/lib/images/style-assets";

export const maxDuration = 300;

type Ctx = { params: Promise<{ styleId: string; refId: string }> };

/** Generate the reference image from its own prompt, or upload one. */
export async function POST(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { styleId, refId } = await context.params;
    const [style, reference] = await Promise.all([
      getStyle(token, styleId),
      getStyleReference(token, refId),
    ]);
    if (!style || reference?.style_id !== styleId) {
      return NextResponse.json({ error: "Reference not found" }, { status: 404 });
    }

    const body = assetBodySchema.parse(await request.json());
    let image: { bytes: Buffer; mimeType: string };
    if (body.action === "upload") {
      const decoded = decodeAssetUpload(body);
      if (decoded instanceof NextResponse) return decoded;
      image = decoded;
    } else {
      if (!reference.prompt) {
        return NextResponse.json(
          { error: "This reference has no prompt: edit it to add one, or upload an image" },
          { status: 400 },
        );
      }
      const prompt = reference.prompt.replaceAll(
        "{background_color}",
        style.params.background_color,
      );
      image = await generateImage(prompt, style.params);
    }

    const uploaded = await replaceUploadedFile({
      token,
      bytes: image.bytes,
      mimeType: image.mimeType,
      name: libraryReferenceFileName(style.code, refId, extensionForMime(image.mimeType)),
      previousFileId: reference.file_id,
    });
    return NextResponse.json({
      reference: await updateStyleReference(token, refId, { file_id: uploaded.id }),
    });
  } catch (error) {
    return assetErrorResponse(error, "Reference image update failed");
  }
}
