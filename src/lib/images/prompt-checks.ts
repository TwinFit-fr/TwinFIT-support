import { NextResponse } from "next/server";
import type { ImagePrompt } from "./types";

/** 400 response when a requested system prompt id does not exist; null when fine or absent. */
export function invalidSystemPrompt(
  prompts: ImagePrompt[],
  systemPromptId: string | undefined,
): NextResponse | null {
  if (!systemPromptId) return null;
  const found = prompts.some((p) => p.id === systemPromptId && p.kind === "system");
  return found
    ? null
    : NextResponse.json({ error: "Selected system prompt does not exist" }, { status: 400 });
}
