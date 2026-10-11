import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { POSE_MODEL, generateExercisePoses } from "@/lib/images/poses";
import {
  getExerciseSummary,
  listExercisePoses,
  upsertExercisePoses,
} from "@/lib/images/queries";

function parseExoId(raw: string): number | null {
  const exoId = Number(raw);
  return Number.isInteger(exoId) && exoId > 0 ? exoId : null;
}

export async function GET(request: Request, context: { params: Promise<{ exoId: string }> }) {
  try {
    const token = requireStaffToken(request);
    const exoId = parseExoId((await context.params).exoId);
    if (exoId == null) {
      return NextResponse.json({ error: "Invalid exo id" }, { status: 400 });
    }
    return NextResponse.json({ poses: await listExercisePoses(token, exoId) });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load poses" },
      { status: 500 },
    );
  }
}

const putSchema = z.object({
  position: z.number().int().min(0).max(2),
  pose: z.string().trim().min(1),
  status: z.enum(["generated", "approved"]),
});

/** Saves one pose edited by hand (the model column is cleared) or approves it as it is. */
export async function PUT(request: Request, context: { params: Promise<{ exoId: string }> }) {
  try {
    const token = requireStaffToken(request);
    const exoId = parseExoId((await context.params).exoId);
    if (exoId == null) {
      return NextResponse.json({ error: "Invalid exo id" }, { status: 400 });
    }
    const body = putSchema.parse(await request.json());
    const poses = await upsertExercisePoses(token, exoId, [body]);
    return NextResponse.json({ poses });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save pose" },
      { status: 500 },
    );
  }
}

/** Regenerates the three poses with the model; they come back as `generated`. */
export async function POST(request: Request, context: { params: Promise<{ exoId: string }> }) {
  try {
    const token = requireStaffToken(request);
    const exoId = parseExoId((await context.params).exoId);
    if (exoId == null) {
      return NextResponse.json({ error: "Invalid exo id" }, { status: 400 });
    }
    const exercise = await getExerciseSummary(token, exoId);
    if (!exercise) {
      return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
    }
    const description =
      exercise.localizations.find((l) => l.locale === "en")?.description ??
      exercise.localizations.find((l) => l.description)?.description ??
      "";
    const generated = await generateExercisePoses(exercise, description);
    const poses = await upsertExercisePoses(
      token,
      exoId,
      generated.map((item) => ({ ...item, status: "generated" as const, model: POSE_MODEL })),
    );
    return NextResponse.json({ poses });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to regenerate poses" },
      { status: 500 },
    );
  }
}
