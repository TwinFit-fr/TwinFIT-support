import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { assetBodySchema, assetErrorResponse, decodeAssetUpload } from "@/lib/images/asset-request";
import { loadLogoInput } from "@/lib/images/logo";
import { editImage, generateImage } from "@/lib/images/openai";
import { fillPromptTemplate } from "@/lib/images/prompt";
import { getStyle, listImagePromptsForStyle } from "@/lib/images/queries";
import {
  LOGO_DIRECTIVE,
  characterFileName,
  referenceSheetDirective,
} from "@/lib/images/reference";
import { deleteImageFile } from "@/lib/images/storage";
import {
  deleteStyleCharacter,
  extensionForMime,
  replaceUploadedFile,
  upsertStyleCharacter,
} from "@/lib/images/style-assets";
import type { Subject } from "@/lib/images/types";

export const maxDuration = 300;

type Ctx = { params: Promise<{ styleId: string; subject: string }> };

function parseSubject(raw: string): Subject {
  if (raw !== "man" && raw !== "woman") throw new Error("subject must be man or woman");
  return raw;
}

export async function POST(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { styleId, subject: subjectRaw } = await context.params;
    const subject = parseSubject(subjectRaw);
    const style = await getStyle(token, styleId);
    if (!style) return NextResponse.json({ error: "Style not found" }, { status: 404 });

    const body = assetBodySchema.parse(await request.json());
    const previous = style.characters.find((c) => c.subject === subject)?.file_id ?? null;

    let bytes: Buffer;
    let mimeType: string;

    if (body.action === "upload") {
      const decoded = decodeAssetUpload(body);
      if (decoded instanceof NextResponse) return decoded;
      ({ bytes, mimeType } = decoded);
    } else {
      let system;
      try {
        system = (await listImagePromptsForStyle(token, styleId)).system;
      } catch {
        return NextResponse.json({ error: "No system prompt available" }, { status: 400 });
      }
      const prompt = [
        fillPromptTemplate(system.content, {
          name: "Character reference",
          description: "",
          exo_id: 0,
          subject,
          background_color: style.params.background_color,
        }).trim(),
        referenceSheetDirective(subject),
      ];
      const logo = await loadLogoInput(token, style);
      if (logo) prompt.push(LOGO_DIRECTIVE);
      const result = logo
        ? await editImage(prompt.join("\n\n"), style.params, [logo])
        : await generateImage(prompt.join("\n\n"), style.params);
      bytes = result.bytes;
      mimeType = result.mimeType;
    }

    const uploaded = await replaceUploadedFile({
      token,
      bytes,
      mimeType,
      name: characterFileName(style.code, subject, extensionForMime(mimeType)),
      previousFileId: previous,
    });
    await upsertStyleCharacter(token, styleId, subject, uploaded.id);
    const updated = await getStyle(token, styleId);
    return NextResponse.json({ style: updated });
  } catch (error) {
    return assetErrorResponse(error, "Character update failed");
  }
}

export async function DELETE(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { styleId, subject: subjectRaw } = await context.params;
    const subject = parseSubject(subjectRaw);
    const previous = await deleteStyleCharacter(token, styleId, subject);
    if (previous) await deleteImageFile(token, previous);
    return NextResponse.json({ style: await getStyle(token, styleId) });
  } catch (error) {
    return assetErrorResponse(error, "Character removal failed", 500);
  }
}
