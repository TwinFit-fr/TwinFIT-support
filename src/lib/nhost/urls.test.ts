import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { nhostUrl, optionalNhostUrl } from "./urls.ts";

const saved = {
  subdomain: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN,
  region: process.env.NEXT_PUBLIC_NHOST_REGION,
};

function setEnv(subdomain: string | undefined, region: string | undefined) {
  if (subdomain === undefined) delete process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
  else process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN = subdomain;
  if (region === undefined) delete process.env.NEXT_PUBLIC_NHOST_REGION;
  else process.env.NEXT_PUBLIC_NHOST_REGION = region;
}

describe("nhostUrl", () => {
  afterEach(() => setEnv(saved.subdomain, saved.region));

  it("builds the service URL from the project", () => {
    setEnv("abcd", "eu-central-1");
    assert.equal(nhostUrl("functions"), "https://abcd.functions.eu-central-1.nhost.run/v1");
    assert.equal(nhostUrl("storage"), "https://abcd.storage.eu-central-1.nhost.run/v1");
    assert.equal(optionalNhostUrl("graphql"), "https://abcd.graphql.eu-central-1.nhost.run/v1");
  });

  it("throws instead of calling https://undefined… when the project is missing", () => {
    for (const [subdomain, region] of [
      [undefined, "eu-central-1"],
      ["abcd", undefined],
      ["", ""],
      ["  ", "eu-central-1"],
    ] as const) {
      setEnv(subdomain, region);
      assert.throws(() => nhostUrl("functions"), /NEXT_PUBLIC_NHOST_SUBDOMAIN and NEXT_PUBLIC_NHOST_REGION/);
      assert.equal(optionalNhostUrl("storage"), null);
    }
  });
});
