import { NextResponse } from "next/server";
import { callStaffFunction, requireStaffToken } from "@/lib/api-auth";
import {
  CANDIDATE_STATUSES,
  acceptErrorMessage,
  listKnowledgeCandidates,
  parseAcceptResult,
  setKnowledgeCandidateStatus,
  type CandidateStatus,
} from "@/lib/coach";

// Accepting drafts cards with the model from the paper text: typically 10 to 40 s.
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseStatus(value: string | null): CandidateStatus {
  const status = value ?? "pending";
  if (!(CANDIDATE_STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Unknown status ${status}`);
  }
  return status as CandidateStatus;
}

export async function GET(request: Request) {
  try {
    const token = await requireStaffToken(request);
    const status = parseStatus(new URL(request.url).searchParams.get("status"));
    return NextResponse.json(await listKnowledgeCandidates(token, status));
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Failed to load candidates";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * `dismiss` / `restore`: GraphQL with the staff JWT (the staff role may only move a candidate
 * between pending and dismissed). `accept`: the backend Function `admin-accept-knowledge-candidate`
 * with the same JWT; it checks the staff role and holds the admin secret itself, so none reaches
 * Support.
 */
export async function POST(request: Request) {
  try {
    const token = await requireStaffToken(request);
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const id = String(body.id ?? "");
    if (!UUID.test(id)) throw new Error("id must be a candidate uuid");

    if (action === "dismiss" || action === "restore") {
      const candidate = await setKnowledgeCandidateStatus(
        token,
        id,
        action === "dismiss" ? "dismissed" : "pending",
      );
      return NextResponse.json({ candidate });
    }

    if (action === "accept") {
      const result = await callStaffFunction(token, "admin-accept-knowledge-candidate", {
        candidateId: id,
      });
      if (result.status < 200 || result.status >= 300) {
        return NextResponse.json(
          { error: acceptErrorMessage(result.status, result.body) },
          { status: result.status === 401 || result.status === 403 ? result.status : 400 },
        );
      }
      return NextResponse.json({ accepted: parseAcceptResult(result.body) });
    }

    throw new Error(`Unknown action ${action}`);
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Candidate action failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
