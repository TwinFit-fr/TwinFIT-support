import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROBE_HEADERS,
  SUPPORT_CONTRACT_VERSION,
  evaluateCompatibility,
  parseApiInfo,
} from "./backend-compatibility.ts";

const info = (contractVersion: number, minClientContractVersion: number) => ({
  contractVersion,
  minClientContractVersion,
});

describe("evaluateCompatibility", () => {
  it("same contract is compatible", () => {
    assert.equal(evaluateCompatibility(info(3, 3), 3), "compatible");
  });
  it("client inside the supported range is compatible", () => {
    assert.equal(evaluateCompatibility(info(4, 2), 3), "compatible");
  });
  it("client below the minimum requires an update", () => {
    assert.equal(evaluateCompatibility(info(4, 4), 3), "update-required");
  });
  it("client ahead of the backend is backend-behind", () => {
    assert.equal(evaluateCompatibility(info(2, 2), 3), "backend-behind");
  });
  it("defaults to this build's contract", () => {
    assert.equal(
      evaluateCompatibility(info(SUPPORT_CONTRACT_VERSION, SUPPORT_CONTRACT_VERSION)),
      "compatible",
    );
    assert.equal(
      evaluateCompatibility(info(SUPPORT_CONTRACT_VERSION + 1, SUPPORT_CONTRACT_VERSION + 1)),
      "update-required",
    );
  });
});

describe("parseApiInfo", () => {
  it("parses the backend payload and ignores unknown keys", () => {
    assert.deepEqual(
      parseApiInfo({ success: true, contractVersion: 3, minClientContractVersion: 3, extra: "x" }),
      info(3, 3),
    );
  });
  it("rejects malformed payloads", () => {
    assert.equal(parseApiInfo(null), null);
    assert.equal(parseApiInfo("x"), null);
    assert.equal(parseApiInfo({ success: false, contractVersion: 3, minClientContractVersion: 3 }), null);
    assert.equal(parseApiInfo({ success: true, contractVersion: "3", minClientContractVersion: 3 }), null);
    assert.equal(parseApiInfo({ success: true, contractVersion: 3 }), null);
  });
});

describe("PROBE_HEADERS", () => {
  it("declares support and this build's contract", () => {
    assert.deepEqual(PROBE_HEADERS, {
      "X-TwinFIT-Client": "support",
      "X-TwinFIT-Contract": String(SUPPORT_CONTRACT_VERSION),
    });
  });
});
