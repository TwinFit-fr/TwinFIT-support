import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminActionSchema } from "./actions.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const parse = (body: unknown) => adminActionSchema.safeParse(body);
const grantEndsAt = (body: unknown) => {
  const data = parse(body).data;
  return data?.action === "grant-premium" ? data.endsAt : "not a grant";
};
const messages = (body: unknown) => {
  const result = parse(body);
  assert.equal(result.success, false);
  return result.error!.issues.map((issue) => issue.message).join("; ");
};

describe("adminActionSchema", () => {
  it("accepts what the user page sends", () => {
    const endsAt = new Date(Date.now() + 86_400_000).toISOString();
    assert.deepEqual(parse({ action: "verify-email", userId: USER_ID }).data, {
      action: "verify-email",
      userId: USER_ID,
    });
    assert.deepEqual(parse({ action: "grant-premium", userId: USER_ID, reason: " Refund ", endsAt }).data, {
      action: "grant-premium",
      userId: USER_ID,
      reason: "Refund",
      endsAt,
    });
    assert.equal(grantEndsAt({ action: "grant-premium", userId: USER_ID, reason: "x", endsAt: null }), null);
    assert.equal(grantEndsAt({ action: "grant-premium", userId: USER_ID, reason: "x", endsAt: "" }), null);
    assert.equal(grantEndsAt({ action: "grant-premium", userId: USER_ID, reason: "x" }), null);
    assert.equal(parse({ action: "revoke-premium", userId: USER_ID }).success, true);
    assert.equal(parse({ action: "set-disabled", userId: USER_ID, disabled: true }).success, true);
    assert.deepEqual(parse({ action: "set-role", userId: USER_ID, role: "lab", granted: false }).data, {
      action: "set-role",
      userId: USER_ID,
      role: "lab",
      granted: false,
    });
  });

  it("refuses unknown actions and malformed account ids", () => {
    assert.match(messages({ action: "delete-account", userId: USER_ID }), /Unknown action/);
    assert.match(messages({ userId: USER_ID }), /Unknown action/);
    assert.match(messages({ action: "verify-email", userId: "../admin" }), /account UUID/);
    assert.match(messages({ action: "verify-email", userId: 42 }), /account UUID/);
    assert.match(messages({ action: "revoke-premium" }), /account UUID/);
  });

  it("checks the fields each Function relies on", () => {
    assert.match(messages({ action: "grant-premium", userId: USER_ID, reason: "  " }), /reason is required/);
    assert.match(messages({ action: "grant-premium", userId: USER_ID, reason: "x".repeat(1001) }), /at most 1000/);
    assert.match(messages({ action: "grant-premium", userId: USER_ID, reason: "x", endsAt: "tomorrow" }), /ISO/);
    assert.match(messages({ action: "set-disabled", userId: USER_ID, disabled: "yes" }), /true or false/);
    assert.match(messages({ action: "set-role", userId: USER_ID, role: "admin", granted: true }), /role must be/);
  });

  it("drops fields an action does not take", () => {
    const parsed = parse({ action: "grant-premium", userId: USER_ID, reason: "x", revoke: true, tierCode: "max" });
    assert.deepEqual(Object.keys(parsed.data ?? {}).sort(), ["action", "endsAt", "reason", "userId"]);
  });
});
