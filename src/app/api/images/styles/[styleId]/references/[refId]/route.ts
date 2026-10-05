import { NextResponse } from "next/server";
import { requireStaffToken } from "@/lib/api-auth";
import { assetErrorResponse, referenceSchema } from "@/lib/images/asset-request";
import {
  deleteStyleReference,
  getStyleReference,
  updateStyleReference,
} from "@/lib/images/references";
import { deleteImageFile } from "@/lib/images/storage";

type Ctx = { params: Promise<{ styleId: string; refId: string }> };

async function ownedReference(token: string, styleId: string, refId: string) {
  const reference = await getStyleReference(token, refId);
  return reference?.style_id === styleId ? reference : null;
}

export async function PATCH(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { styleId, refId } = await context.params;
    if (!(await ownedReference(token, styleId, refId))) {
      return NextResponse.json({ error: "Reference not found" }, { status: 404 });
    }
    const input = referenceSchema.partial().parse(await request.json());
    return NextResponse.json({ reference: await updateStyleReference(token, refId, input) });
  } catch (error) {
    return assetErrorResponse(error, "Could not update reference", 500);
  }
}

export async function DELETE(request: Request, context: Ctx) {
  try {
    const token = requireStaffToken(request);
    const { styleId, refId } = await context.params;
    if (!(await ownedReference(token, styleId, refId))) {
      return NextResponse.json({ error: "Reference not found" }, { status: 404 });
    }
    const fileId = await deleteStyleReference(token, refId);
    if (fileId) {
      try {
        await deleteImageFile(token, fileId);
      } catch {
        /* row already gone; storage cleanup best-effort */
      }
    }
    return NextResponse.json({ status: "deleted", id: refId });
  } catch (error) {
    return assetErrorResponse(error, "Could not delete reference", 500);
  }
}
