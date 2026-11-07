import { NextResponse } from "next/server";
import { z } from "zod";
import { MeshyError } from "./meshy";

/**
 * The one error handler of the /api/studio routes. `requireStaffToken` throws a Response (401 /
 * 403), zod a 400, a provider failure a 502 carrying the provider's message (never its status:
 * a bad Meshy key must not read as a Support sign-in failure), anything else a 500.
 */
export function routeError(error: unknown, fallback: string, extra: Record<string, unknown> = {}): Response {
  if (error instanceof Response) return error;
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid input", ...extra }, { status: 400 });
  }
  if (error instanceof MeshyError) return NextResponse.json({ error: error.message, ...extra }, { status: error.status });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Malformed JSON", ...extra }, { status: 400 });
  const message = error instanceof Error ? error.message : fallback;
  // A database rule said no (a missing exercise or avatar, a duplicate code, a CHECK): the request is wrong, not the server.
  if (/foreign key|unique|duplicate key|check constraint|violates/i.test(message)) return NextResponse.json({ error: message, ...extra }, { status: 409 });
  return NextResponse.json({ error: message, ...extra }, { status: 500 });
}
