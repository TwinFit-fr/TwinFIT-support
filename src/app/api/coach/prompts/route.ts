import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { insertPromptVersion, listPromptVersions, setPromptVersionActive } from "@/lib/coach";

export async function GET(request: Request) {
  try {
    const token = requireStaffToken(request);
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
    const token = requireStaffToken(request);
    const body = (await request.json()) as {
      action?: string;
      prompt_key?: string;
      locale?: string;
      body_md?: string;
      id?: string;
      is_active?: boolean;
    };

    if (body.action === "activate" || body.action === "deactivate") {
      if (!body.id) throw new Error("id is required");
      const version = await setPromptVersionActive(token, body.id, body.action === "activate");
      return NextResponse.json({ version });
    }

    if (!body.prompt_key || !body.locale || !body.body_md?.trim()) {
      throw new Error("prompt_key, locale and body_md are required");
    }
    const version = await insertPromptVersion(token, {
      prompt_key: body.prompt_key,
      locale: body.locale,
      body_md: body.body_md.trim(),
    });
    return NextResponse.json({ version });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Prompt action failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
