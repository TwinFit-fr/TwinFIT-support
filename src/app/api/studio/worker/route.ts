import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaffToken } from "@/lib/api-auth";
import { runWorkerTick, type TickResult } from "@/lib/studio/worker";

export const maxDuration = 300;

const bodySchema = z.object({ max: z.number().int().min(1).max(5).optional() }).optional();

/**
 * Run the movement pipeline: claim and process up to `max` pending vectors (default 1), one after
 * the other. The Studio calls it while its queue has pending rows; several tabs may call it at
 * once, claim_movement_vector keeps the concurrency cap. Returns what happened to each row.
 */
export async function POST(request: Request) {
  try {
    const token = requireStaffToken(request);
    const text = await request.text();
    const body = bodySchema.parse(text ? JSON.parse(text) : undefined);
    const max = body?.max ?? 1;
    const results: TickResult[] = [];
    for (let i = 0; i < max; i += 1) {
      const result = await runWorkerTick(token);
      results.push(result);
      if (!result.claimed) break;
    }
    return NextResponse.json({
      results: results.map((r) => (r.claimed ? { id: r.vector.id, seq: r.vector.seq, status: r.vector.status, outcome: r.outcome, message: r.message ?? null } : { claimed: false })),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "The worker failed" }, { status: 500 });
  }
}
