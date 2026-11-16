import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acceptErrorMessage,
  candidateDoiUrl,
  candidateKindLabel,
  candidateVenue,
  parseAcceptResult,
} from "./candidates.ts";

describe("acceptErrorMessage", () => {
  it("explains the Function's error codes", () => {
    assert.match(
      acceptErrorMessage(409, { success: false, error: "candidate_not_pending", code: "candidate_not_pending" }),
      /already accepted or dismissed/,
    );
    assert.match(acceptErrorMessage(422, { code: "candidate_no_text" }), /abstract/);
    assert.match(acceptErrorMessage(502, { code: "summary_failed" }), /try again/i);
  });

  it("falls back to the raw text, then to the status", () => {
    assert.equal(acceptErrorMessage(403, { error: "Staff role required" }), "Staff role required");
    assert.equal(acceptErrorMessage(500, null), "Accept failed (500)");
  });
});

describe("parseAcceptResult", () => {
  it("reads the ids and the text source", () => {
    assert.deepEqual(
      parseAcceptResult({
        success: true,
        candidateId: "c1",
        sourceId: "s1",
        cardIds: ["k1", "k2"],
        textSource: "full_text",
      }),
      { candidateId: "c1", sourceId: "s1", cardIds: ["k1", "k2"], textSource: "full_text" },
    );
  });

  it("refuses an answer without a source", () => {
    assert.throws(() => parseAcceptResult({ success: true }), /source id/);
  });
});

describe("candidate display helpers", () => {
  it("labels kinds and builds links", () => {
    assert.equal(candidateKindLabel("meta_analysis"), "Meta-analysis");
    assert.equal(candidateKindLabel("other"), "other");
    assert.equal(candidateDoiUrl({ doi: "10.1000/x" }), "https://doi.org/10.1000/x");
    assert.equal(candidateDoiUrl({ doi: null }), null);
  });

  it("joins the journal and year that are known", () => {
    assert.equal(candidateVenue({ journal: "Sports Med", year: 2025 }), "Sports Med · 2025");
    assert.equal(candidateVenue({ journal: null, year: 2025 }), "2025");
    assert.equal(candidateVenue({ journal: null, year: null }), "");
  });
});
