import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { samePath, toLf, toPosix } from "./graphql-manifest-paths.mjs";

describe("graphql-manifest paths", () => {
  it("turns backslashes into forward slashes", () => {
    assert.equal(toPosix("C:\\repo\\src\\lib\\gql.ts"), "C:/repo/src/lib/gql.ts");
    assert.equal(toPosix("/repo/src/lib/gql.ts"), "/repo/src/lib/gql.ts");
  });

  it("compares a Windows path with a TypeScript path", () => {
    assert.ok(samePath("C:\\repo\\src\\lib\\gql.ts", "C:/repo/src/lib/gql.ts"));
    assert.ok(!samePath("C:\\repo\\src\\lib\\gql.ts", "C:/repo/src/lib/other.ts"));
  });

  it("normalises CRLF to LF", () => {
    assert.equal(toLf("a\r\nb\n"), "a\nb\n");
  });
});
