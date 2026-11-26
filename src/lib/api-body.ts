import { z } from "zod";

/**
 * Request bodies of the API routes: size-capped before parsing, then checked with a zod schema.
 * Failures are thrown as JSON `Response`s (400 / 413), which every route's catch block returns
 * as they are.
 */

/** Cap of a plain JSON body (forms, actions). */
export const JSON_BODY_MAX_BYTES = 1024 * 1024;

/** Room for the JSON around a base64 file (other fields, quotes, escapes). */
const ENVELOPE_BYTES = 64 * 1024;

/** Cap of a JSON body that carries one base64 file of at most `fileBytes` decoded bytes. */
export function base64BodyLimit(fileBytes: number): number {
  return Math.ceil(fileBytes / 3) * 4 + ENVELOPE_BYTES;
}

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** One line per issue, prefixed with the field path. */
export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join("; ");
}

function tooLarge(maxBytes: number): Response {
  const mib = maxBytes / (1024 * 1024);
  const limit = mib >= 1 ? `${Math.floor(mib)} MB` : `${Math.floor(maxBytes / 1024)} KB`;
  return jsonError(413, `Request body is larger than ${limit}`);
}

/**
 * The body as text, at most `maxBytes`. A declared `Content-Length` above the cap is refused
 * before anything is read; a body without one (chunked) is counted while it streams.
 */
export async function readBodyText(request: Request, maxBytes: number): Promise<string> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes) throw tooLarge(maxBytes);
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw tooLarge(maxBytes);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * The JSON body checked against `schema`: 413 above `maxBytes` (default 1 MB), 400 when it is
 * not JSON or does not match. Unknown keys are dropped by `z.object` schemas.
 */
export async function readJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
  options: { maxBytes?: number } = {},
): Promise<z.output<S>> {
  const text = await readBodyText(request, options.maxBytes ?? JSON_BODY_MAX_BYTES);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw jsonError(400, "Request body must be JSON");
  }
  const result = schema.safeParse(json);
  if (!result.success) throw jsonError(400, formatIssues(result.error));
  return result.data;
}
