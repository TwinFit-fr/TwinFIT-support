import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { JSON_BODY_MAX_BYTES, base64BodyLimit, readBodyText, readJsonBody } from "./api-body.ts";

const schema = z.object({ name: z.string().min(1), count: z.int() });

function post(body: BodyInit | null, headers: Record<string, string> = {}): Request {
  return new Request("http://support.test/api/x", { method: "POST", body, headers, duplex: "half" } as RequestInit);
}

/** A body that fails the test if anything reads it. */
function unreadableBody(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    pull() {
      throw new Error("the body was read");
    },
  });
}

async function rejection(promise: Promise<unknown>): Promise<{ status: number; error: string }> {
  try {
    await promise;
  } catch (thrown) {
    assert.ok(thrown instanceof Response, "throws a Response");
    return { status: thrown.status, error: ((await thrown.json()) as { error: string }).error };
  }
  assert.fail("expected a rejection");
}

describe("readJsonBody", () => {
  it("returns the parsed body and drops unknown keys", async () => {
    const body = await readJsonBody(post(JSON.stringify({ name: "a", count: 2, admin: true })), schema);
    assert.deepEqual(body, { name: "a", count: 2 });
  });

  it("refuses a declared Content-Length above the cap before reading the body", async () => {
    const request = post(unreadableBody(), { "content-length": String(JSON_BODY_MAX_BYTES + 1) });
    const { status, error } = await rejection(readJsonBody(request, schema));
    assert.equal(status, 413);
    assert.match(error, /larger than 1 MB/);
  });

  it("counts a body without Content-Length while it streams", async () => {
    const chunk = new TextEncoder().encode("x".repeat(1024));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1;
        if (sent > 64) controller.close();
        else controller.enqueue(chunk);
      },
    });
    const { status } = await rejection(readBodyText(post(stream), 10 * 1024));
    assert.equal(status, 413);
    assert.ok(sent < 64, "stops reading once over the cap");
  });

  it("refuses a body that is not JSON", async () => {
    const { status, error } = await rejection(readJsonBody(post("{not json"), schema));
    assert.equal(status, 400);
    assert.match(error, /must be JSON/);
    assert.equal((await rejection(readJsonBody(post(null), schema))).status, 400);
  });

  it("names the fields that do not match", async () => {
    const { status, error } = await rejection(readJsonBody(post(JSON.stringify({ name: "", count: 1.5 })), schema));
    assert.equal(status, 400);
    assert.match(error, /^name: .*; count: /);
  });

  it("takes a larger cap for uploads", async () => {
    const data = "A".repeat(2 * 1024 * 1024);
    const request = post(JSON.stringify({ name: data, count: 1 }));
    assert.equal((await rejection(readJsonBody(request, schema))).status, 413);
    const big = post(JSON.stringify({ name: data, count: 1 }));
    assert.equal((await readJsonBody(big, schema, { maxBytes: base64BodyLimit(2 * 1024 * 1024) })).count, 1);
  });
});

describe("base64BodyLimit", () => {
  it("fits the base64 text of a file at the limit, plus the JSON around it", () => {
    const file = 20 * 1024 * 1024;
    const encoded = Buffer.alloc(file).toString("base64").length;
    assert.ok(base64BodyLimit(file) > encoded);
    assert.ok(base64BodyLimit(file) < encoded + 128 * 1024);
  });
});
