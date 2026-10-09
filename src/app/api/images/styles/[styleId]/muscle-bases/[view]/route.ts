import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { assetBodySchema, assetErrorResponse, decodeAssetUpload } from "@/lib/images/asset-request";
import { generateImage } from "@/lib/images/openai";
import { fillMuscleMapTemplate } from "@/lib/images/prompt";
import { getStyle, listImagePromptsForStyle } from "@/lib/images/queries";
import { muscleBaseCropDirective, muscleBaseFileName } from "@/lib/images/reference";
import { deleteImageFile } from "@/lib/images/storage";
import {
  deleteStyleMuscleBase,
  extensionForMime,
  replaceUploadedFile,
  upsertStyleMuscleBase,
} from "@/lib/images/style-assets";
import { MUSCLE_MAP_CROPS, MUSCLE_MAP_VIEWS, type MuscleMapSlot } from "@/lib/images/types";

export const maxDuration = 300;

type Ctx = { params: Promise<{ styleId: string; view: string }> };

/** The base's view (path) and crop (`?crop=`, default full); null when either is unknown. */
function parseSlot(request: Request, rawView: string): MuscleMapSlot | null {
  const rawCrop = new URL(request.url).searchParams.get("crop") ?? "full";
  const view = MUSCLE_MAP_VIEWS.find((v) => v === rawView);
  const crop = MUSCLE_MAP_CROPS.find((c) => c === rawCrop);
  return view && crop ? { view, crop } : null;
}

const BAD_SLOT = "view must be front or back, crop full, upper or lower";

export async function POST(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { styleId, view: viewRaw } = await context.params;
    const slot = parseSlot(request, viewRaw);
    if (!slot) return NextResponse.json({ error: BAD_SLOT }, { status: 400 });
    const style = await getStyle(token, styleId);
    if (!style) return NextResponse.json({ error: "Style not found" }, { status: 404 });

    const body = assetBodySchema.parse(await request.json());
    let image: { bytes: Buffer; mimeType: string };
    if (body.action === "upload") {
      const decoded = decodeAssetUpload(body);
      if (decoded instanceof NextResponse) return decoded;
      image = decoded;
    } else {
      const template = (await listImagePromptsForStyle(token, styleId)).muscleBase;
      const prompt = [
        fillMuscleMapTemplate(template.content, {
          ...slot,
          background_color: style.params.background_color,
        }),
        muscleBaseCropDirective(slot),
      ]
        .filter(Boolean)
        .join("\n\n");
      image = await generateImage(prompt, style.params);
    }

    const uploaded = await replaceUploadedFile({
      token,
      bytes: image.bytes,
      mimeType: image.mimeType,
      name: muscleBaseFileName(style.code, slot, extensionForMime(image.mimeType)),
      previousFileId:
        style.muscle_bases.find((b) => b.view === slot.view && b.crop === slot.crop)?.file_id ??
        null,
    });
    await upsertStyleMuscleBase(token, styleId, slot, uploaded.id);
    return NextResponse.json({ style: await getStyle(token, styleId) });
  } catch (error) {
    return assetErrorResponse(error, "Muscle map base update failed");
  }
}

export async function DELETE(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { styleId, view: viewRaw } = await context.params;
    const slot = parseSlot(request, viewRaw);
    if (!slot) return NextResponse.json({ error: BAD_SLOT }, { status: 400 });
    const previous = await deleteStyleMuscleBase(token, styleId, slot);
    if (previous) await deleteImageFile(token, previous);
    return NextResponse.json({ style: await getStyle(token, styleId) });
  } catch (error) {
    return assetErrorResponse(error, "Muscle map base removal failed", 500);
  }
}
