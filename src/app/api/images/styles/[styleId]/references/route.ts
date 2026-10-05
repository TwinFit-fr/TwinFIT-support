import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { assetErrorResponse, referenceSchema } from "@/lib/images/asset-request";
import { createStyleReference, listStyleReferences } from "@/lib/images/references";

type Ctx = { params: Promise<{ styleId: string }> };

export async function GET(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { styleId } = await context.params;
    return NextResponse.json({ references: await listStyleReferences(token, styleId) });
  } catch (error) {
    return assetErrorResponse(error, "Failed to list references", 500);
  }
}

export async function POST(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { styleId } = await context.params;
    const input = referenceSchema.parse(await request.json());
    return NextResponse.json({ reference: await createStyleReference(token, styleId, input) });
  } catch (error) {
    return assetErrorResponse(error, "Could not create reference", 500);
  }
}
