import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { loadLogoInput } from "@/lib/images/logo";
import { editImage, generateImage } from "@/lib/images/openai";
import { fillPromptTemplate } from "@/lib/images/prompt";
import { getStyle, listImagePrompts } from "@/lib/images/queries";
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

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

type Ctx = { params: Promise<{ styleId: string; subject: string }> };

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate") }),
  z.object({
    action: z.literal("upload"),
    mimeType: z.enum(["image/png", "image/webp", "image/jpeg"]),
    data: z.string().min(1),
  }),
]);

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

    const body = bodySchema.parse(await request.json());
    const previous = style.characters.find((c) => c.subject === subject)?.file_id ?? null;

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
      const system =
        prompts.find((p) => p.id === style.system_prompt_id) ??
        prompts.find((p) => p.kind === "system");
      if (!system) {
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
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Character update failed" },
      { status: 502 },
    );
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
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Character removal failed" },
      { status: 500 },
    );
  }
}
