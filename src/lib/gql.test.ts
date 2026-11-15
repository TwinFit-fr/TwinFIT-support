import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { gql } from "./gql.ts";

describe("gql", () => {
  it("returns the template text unchanged", () => {
    assert.equal(gql`query SupportProbe { a }`, "query SupportProbe { a }");
  });

  it("inlines constant fragments of text", () => {
    const FIELDS = `id code`;
    assert.equal(
      gql`query SupportProbe { t { ${FIELDS} } u { ${FIELDS} } }`,
      "query SupportProbe { t { id code } u { id code } }",
    );
  });
});

describe("graphql-manifest/support-current.json", () => {
  it("matches the gql documents in src (run `npm run graphql-manifest` after changing one)", () => {
    const result = spawnSync(process.execPath, ["scripts/graphql-manifest.mjs", "--check"], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  });
});
