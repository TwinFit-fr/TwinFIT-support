import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { generateImage } from "@/lib/images/openai";
import { fillPromptTemplate } from "@/lib/images/prompt";
import { listImagePrompts, loadSettings, updateImageSettings } from "@/lib/images/queries";
import { referenceFileName, referenceSheetDirective } from "@/lib/images/reference";
import { deleteImageFile, uploadImageFile } from "@/lib/images/storage";
import { REFERENCE_KEYS } from "@/lib/images/types";
import type { Subject } from "@/lib/images/types";

export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/webp": "webp",
  "image/jpeg": "jpg",
};

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate"), subject: z.enum(["man", "woman"]) }),
  z.object({
    action: z.literal("upload"),
    subject: z.enum(["man", "woman"]),
    mimeType: z.enum(["image/png", "image/webp", "image/jpeg"]),
    data: z.string().min(1),
  }),
]);

async function replaceReference(
  token: string,
  subject: Subject,
  file: { bytes: Buffer; mimeType: string },
) {
  const settings = await loadSettings(token);
  const previous = settings[REFERENCE_KEYS[subject]];
  const uploaded = await uploadImageFile({
    token,
    bytes: file.bytes,
    mimeType: file.mimeType,
    name: referenceFileName(subject, EXTENSION_BY_MIME[file.mimeType] ?? "png"),
  });
  const updated = await updateImageSettings(token, { [REFERENCE_KEYS[subject]]: uploaded.id });
  if (previous) await deleteImageFile(token, previous);
  return updated;
}

export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const body = bodySchema.parse(await request.json());

    if (body.action === "upload") {
      const bytes = Buffer.from(body.data, "base64");
      if (bytes.length > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ error: "Reference image must be under 20 MB" }, { status: 400 });
      }
      return NextResponse.json(
        await replaceReference(token, body.subject, { bytes, mimeType: body.mimeType }),
      );
    }

    const [settings, prompts] = await Promise.all([
      loadSettings(token),
      listImagePrompts(token),
    ]);
    const system =
      prompts.find((p) => p.id === settings.system_prompt_id) ??
      prompts.find((p) => p.kind === "system");
    if (!system) {
      return NextResponse.json({ error: "No system prompt available" }, { status: 400 });
    }
    const prompt = [
      fillPromptTemplate(system.content, {
        name: "Character reference",
        description: "",
        exo_id: 0,
        subject: body.subject,
        background_color: settings.params.background_color,
      }).trim(),
      referenceSheetDirective(body.subject),
    ].join("\n\n");
    const result = await generateImage(prompt, settings.params);
    return NextResponse.json(
      await replaceReference(token, body.subject, {
        bytes: result.bytes,
        mimeType: result.mimeType,
      }),
    );
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reference update failed" },
      { status: 502 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const token = requireStaffToken(request);
    const subject = z.enum(["man", "woman"]).parse(new URL(request.url).searchParams.get("subject"));
    const settings = await loadSettings(token);
    const previous = settings[REFERENCE_KEYS[subject]];
    const updated = await updateImageSettings(token, { [REFERENCE_KEYS[subject]]: null });
    if (previous) await deleteImageFile(token, previous);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "subject must be man or woman" }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reference removal failed" },
      { status: 500 },
    );
  }
}
