import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  API_CONTENT_SECURITY_POLICY,
  createNonce,
  nhostOrigins,
  pageContentSecurityPolicy,
  STATIC_SECURITY_HEADERS,
} from "./security-headers.ts";

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split(";").map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );
}

describe("page CSP", () => {
  const csp = directives(
    pageContentSecurityPolicy({ nonce: "abc123", dev: false, nhostSubdomain: "proj", nhostRegion: "eu-central-1" }),
  );

  it("allows scripts only with the nonce, never inline or eval in production", () => {
    const scripts = csp.get("script-src") ?? [];
    assert.ok(scripts.includes("'nonce-abc123'"));
    assert.ok(scripts.includes("'strict-dynamic'"));
    assert.ok(!scripts.includes("'unsafe-inline'"));
    assert.ok(!scripts.includes("'unsafe-eval'"));
  });

  it("forbids framing, plugins, foreign forms and <base>", () => {
    assert.deepEqual(csp.get("frame-ancestors"), ["'none'"]);
    assert.deepEqual(csp.get("object-src"), ["'none'"]);
    assert.deepEqual(csp.get("form-action"), ["'self'"]);
    assert.deepEqual(csp.get("base-uri"), ["'self'"]);
  });

  it("connects only to this origin and the project's Nhost services", () => {
    assert.deepEqual(csp.get("connect-src"), [
      "'self'",
      "https://proj.auth.eu-central-1.nhost.run",
      "https://proj.graphql.eu-central-1.nhost.run",
      "https://proj.storage.eu-central-1.nhost.run",
      "https://proj.functions.eu-central-1.nhost.run",
    ]);
    assert.deepEqual(csp.get("img-src"), ["'self'", "data:", "blob:", "https://proj.storage.eu-central-1.nhost.run"]);
  });

  it("adds eval only for next dev", () => {
    const dev = directives(pageContentSecurityPolicy({ nonce: "n", dev: true }));
    assert.ok(dev.get("script-src")?.includes("'unsafe-eval'"));
    assert.deepEqual(nhostOrigins(undefined, "eu"), { storage: [], all: [] });
  });
});

describe("other headers", () => {
  it("sandboxes API responses", () => {
    assert.match(API_CONTENT_SECURITY_POLICY, /default-src 'none'/);
    assert.match(API_CONTENT_SECURITY_POLICY, /frame-ancestors 'none'/);
    assert.match(API_CONTENT_SECURITY_POLICY, /\bsandbox\b/);
  });

  it("sends HSTS, nosniff, DENY framing and a referrer policy on every response", () => {
    const byKey = new Map(STATIC_SECURITY_HEADERS.map((h) => [h.key, h.value]));
    assert.match(byKey.get("Strict-Transport-Security") ?? "", /max-age=\d{8,}/);
    assert.equal(byKey.get("X-Content-Type-Options"), "nosniff");
    assert.equal(byKey.get("X-Frame-Options"), "DENY");
    assert.equal(byKey.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  });

  it("creates a fresh 128-bit nonce per call", () => {
    const a = createNonce();
    assert.equal(Buffer.from(a, "base64").length, 16);
    assert.notEqual(a, createNonce());
  });
});
