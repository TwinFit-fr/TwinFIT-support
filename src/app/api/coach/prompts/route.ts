import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { readJsonBody } from "@/lib/api-body";
import { insertPromptVersion, listPromptVersions, setPromptVersionActive } from "@/lib/coach";
import { promptActionSchema } from "@/lib/coach/request-schemas";

export async function GET(request: Request) {
  try {
    const token = await requireStaffToken(request);
    const versions = await listPromptVersions(token);
    return NextResponse.json({ versions });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Failed to load prompt versions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const token = await requireStaffToken(request);
    const body = await readJsonBody(request, promptActionSchema);

    if ("id" in body) {
      const version = await setPromptVersionActive(token, body.id, body.action === "activate");
      return NextResponse.json({ version });
    }

    const version = await insertPromptVersion(token, {
      prompt_key: body.prompt_key,
      locale: body.locale,
      body_md: body.body_md,
    });
    return NextResponse.json({ version });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Prompt action failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
