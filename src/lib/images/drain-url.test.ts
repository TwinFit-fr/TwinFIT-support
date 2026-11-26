import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { drainUrl, supportBaseUrl } from "./drain-url.ts";

const prod = (SUPPORT_BASE_URL?: string) => ({ NODE_ENV: "production", SUPPORT_BASE_URL });

describe("drainUrl", () => {
  it("calls the configured deploy, whatever the request said", () => {
    assert.equal(drainUrl(prod("https://support.twinfit.fr"))?.href, "https://support.twinfit.fr/api/images/jobs/drain");
  });

  it("keeps only the origin of the configured URL", () => {
    assert.equal(
      drainUrl(prod("https://support.twinfit.fr/some/path?x=1#y"))?.href,
      "https://support.twinfit.fr/api/images/jobs/drain",
    );
  });

  it("refuses plain http except on localhost, and URLs with credentials", () => {
    assert.equal(supportBaseUrl(prod("http://support.twinfit.fr")), null);
    assert.equal(supportBaseUrl(prod("https://user:pass@support.twinfit.fr")), null);
    assert.equal(supportBaseUrl(prod("ftp://support.twinfit.fr")), null);
    assert.equal(supportBaseUrl(prod("not a url")), null);
    assert.equal(supportBaseUrl(prod("http://localhost:3000"))?.href, "http://localhost:3000/");
    assert.equal(supportBaseUrl(prod("http://127.0.0.1:8080"))?.href, "http://127.0.0.1:8080/");
  });

  it("does not chain in production without a base URL", () => {
    assert.equal(drainUrl(prod()), null);
    assert.equal(drainUrl(prod("  ")), null);
  });

  it("falls back to this machine outside production", () => {
    assert.equal(drainUrl({ NODE_ENV: "development" })?.href, "http://localhost:3000/api/images/jobs/drain");
    assert.equal(drainUrl({ NODE_ENV: "development", PORT: "4000" })?.href, "http://localhost:4000/api/images/jobs/drain");
  });
});
