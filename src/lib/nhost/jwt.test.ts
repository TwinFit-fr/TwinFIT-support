import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasAdminRole,
  hasStaffRole,
  parseJwtRoles,
  resolveSupportHasuraRole,
  supportRoleOf,
} from "./jwt.ts";

/** An unsigned token with these allowed roles (only the payload is read). */
function token(allowedRoles: unknown): string {
  const payload = {
    sub: "11111111-1111-4111-8111-111111111111",
    "https://hasura.io/jwt/claims": {
      "x-hasura-default-role": "user",
      "x-hasura-allowed-roles": allowedRoles,
      "x-hasura-user-id": "11111111-1111-4111-8111-111111111111",
    },
  };
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "none" })}.${part(payload)}.sig`;
}

describe("supportRoleOf", () => {
  it("admin wins over staff", () => {
    assert.equal(supportRoleOf(["user", "me", "staff", "admin"]), "admin");
    assert.equal(supportRoleOf(["admin", "staff"]), "admin");
  });
  it("staff alone is staff", () => {
    assert.equal(supportRoleOf(["user", "staff"]), "staff");
  });
  it("lab or user give no Support role", () => {
    assert.equal(supportRoleOf(["user", "me", "lab"]), null);
  });
});

describe("resolveSupportHasuraRole", () => {
  it("an account with both admin and staff requests admin", () => {
    assert.equal(resolveSupportHasuraRole(token(["user", "me", "staff", "admin"])), "admin");
    assert.equal(resolveSupportHasuraRole(token(["staff", "admin"])), "admin");
  });
  it("staff requests staff", () => {
    assert.equal(resolveSupportHasuraRole(token(["user", "me", "staff"])), "staff");
  });
  it("reads the string forms of the claim", () => {
    assert.equal(resolveSupportHasuraRole(token("user, staff, admin")), "admin");
    assert.equal(resolveSupportHasuraRole(token('["user","staff","admin"]')), "admin");
  });
  it("throws without staff or admin", () => {
    assert.throws(() => resolveSupportHasuraRole(token(["user", "me", "lab"])), /no staff or admin/);
    assert.throws(() => resolveSupportHasuraRole("not-a-jwt"), /no staff or admin/);
  });
});

describe("hasAdminRole / hasStaffRole", () => {
  it("an account with both is admin and staff", () => {
    const both = token(["user", "staff", "admin"]);
    assert.equal(hasAdminRole(both), true);
    assert.equal(hasStaffRole(both), true);
  });
  it("staff is not admin", () => {
    const staff = token(["user", "staff"]);
    assert.equal(hasAdminRole(staff), false);
    assert.equal(hasStaffRole(staff), true);
  });
  it("lab is neither", () => {
    const lab = token(["user", "lab"]);
    assert.equal(hasAdminRole(lab), false);
    assert.equal(hasStaffRole(lab), false);
    assert.equal(hasStaffRole(null), false);
  });
  it("parses the allowed roles", () => {
    assert.deepEqual(parseJwtRoles(token(["user", "lab"])), ["user", "lab"]);
  });
});
