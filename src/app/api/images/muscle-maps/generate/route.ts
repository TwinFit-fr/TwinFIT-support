import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { assetErrorResponse } from "@/lib/images/asset-request";
import {
  clearActiveMuscleMap,
  getMuscleMapTarget,
  insertMuscleMapImage,
} from "@/lib/images/muscle-maps";
import { editImage } from "@/lib/images/openai";
import { fillMuscleMapTemplate } from "@/lib/images/prompt";
import { getStyle, getUserIdFromToken, listImagePromptsForStyle } from "@/lib/images/queries";
import {
  libraryReferenceDirective,
  muscleBaseDirective,
  muscleMapFileName,
} from "@/lib/images/reference";
import {
  MAX_RUN_REFERENCES,
  loadReferenceInputs,
  resolveRunReferences,
} from "@/lib/images/references";
import { downloadImageFile, uploadImageFile } from "@/lib/images/storage";
import { extensionForMime } from "@/lib/images/style-assets";

export const maxDuration = 300;

const bodySchema = z.object({
  styleId: z.string().uuid(),
  target: z.object({
    kind: z.enum(["muscle", "muscle_group"]),
    id: z.string().uuid(),
  }),
  view: z.enum(["front", "back"]),
  promptOverride: z.string().trim().min(1).max(32000).optional(),
  /** Library references for this run; omitted = the ones linked to the target. */
  referenceIds: z.array(z.string().uuid()).max(MAX_RUN_REFERENCES).optional(),
});

export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const { styleId, target: ref, view, promptOverride, referenceIds } = bodySchema.parse(
      await request.json(),
    );

    const [style, target] = await Promise.all([
      getStyle(token, styleId),
      getMuscleMapTarget(token, ref),
    ]);
    if (!style) return NextResponse.json({ error: "Style not found" }, { status: 404 });
    if (!target) return NextResponse.json({ error: "Muscle or group not found" }, { status: 404 });
    const baseFileId = style.muscle_bases.find((b) => b.view === view)?.file_id;
    if (!baseFileId) {
      return NextResponse.json(
        { error: `This style has no ${view} base: add it on Styles → References first` },
        { status: 409 },
      );
    }

    const [template, references] = await Promise.all([
      listImagePromptsForStyle(token, styleId).then((slots) => slots.muscleMap),
      resolveRunReferences(token, styleId, ref, referenceIds),
    ]);
    // Input 1 is the base; library references follow from input 2.
    const prompt = [
      fillMuscleMapTemplate(promptOverride ?? template.content, {
        view,
        background_color: style.params.background_color,
        target,
      }),
      muscleBaseDirective(view),
      ...references.map((reference, i) => libraryReferenceDirective(i + 2, reference)),
    ].join("\n\n");

    const base = await downloadImageFile(token, baseFileId);
    const result = await editImage(
      prompt,
      style.params,
      [
        { bytes: base.bytes, mimeType: base.contentType },
        ...(await loadReferenceInputs(token, references)),
      ],
      { useFidelity: true },
    );

    const uploaded = await uploadImageFile({
      token,
      bytes: result.bytes,
      mimeType: result.mimeType,
      name: muscleMapFileName(
        style.code,
        { kind: ref.kind, code: target.code },
        view,
        extensionForMime(result.mimeType),
      ),
    });
    const insert = () =>
      insertMuscleMapImage(token, {
        style_id: styleId,
        target: ref,
        view,
        file_id: uploaded.id,
        image_url: uploaded.url,
        model: style.params.model,
        prompt,
        params: {
          ...style.params,
          base_file_id: baseFileId,
          prompt_id: template.id,
          prompt_edited: promptOverride != null,
          reference_ids: references.map((r) => r.id),
        },
        usage: result.usage,
        created_by: getUserIdFromToken(token),
      });

    await clearActiveMuscleMap(token, styleId, ref, view);
    let image;
    try {
      image = await insert();
    } catch (error) {
      if (!(error instanceof Error && /uniqueness|unique/i.test(error.message))) throw error;
      await clearActiveMuscleMap(token, styleId, ref, view);
      image = await insert();
    }
    return NextResponse.json({ image });
  } catch (error) {
    return assetErrorResponse(error, "Muscle map generation failed");
  }
}
