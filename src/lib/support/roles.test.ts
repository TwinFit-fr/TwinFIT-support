import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accountRoleNames,
  isManagedRole,
  parseSetRoleRequest,
  setRoleErrorMessage,
  setRoleSuccessMessage,
  sortRoleNames,
} from "./roles.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("parseSetRoleRequest", () => {
  it("builds the admin-set-role body", () => {
    assert.deepEqual(
      parseSetRoleRequest({ action: "set-role", userId: ` ${USER_ID} `, role: "lab", granted: true }),
      { ok: true, value: { userId: USER_ID, role: "lab", granted: true } },
    );
    assert.deepEqual(parseSetRoleRequest({ userId: USER_ID, role: "staff", granted: false }), {
      ok: true,
      value: { userId: USER_ID, role: "staff", granted: false },
    });
  });
  it("refuses roles Support does not manage", () => {
    for (const role of ["admin", "user", "me", "LAB", "", null]) {
      const result = parseSetRoleRequest({ userId: USER_ID, role, granted: true });
      assert.equal(result.ok, false, String(role));
    }
  });
  it("refuses a missing or malformed userId and a non-boolean granted", () => {
    assert.equal(parseSetRoleRequest({ userId: "abc", role: "lab", granted: true }).ok, false);
    assert.equal(parseSetRoleRequest({ role: "lab", granted: true }).ok, false);
    assert.equal(parseSetRoleRequest({ userId: USER_ID, role: "lab", granted: "true" }).ok, false);
    assert.equal(parseSetRoleRequest(null).ok, false);
  });
});

describe("setRoleErrorMessage", () => {
  it("maps the Function's statuses to staff words", () => {
    assert.match(
      setRoleErrorMessage(400, { success: false, error: "role must be lab or staff" }),
      /refused.*role must be lab or staff/,
    );
    assert.match(setRoleErrorMessage(403, { success: false, error: "Admin role required" }), /Only an admin/);
    assert.match(setRoleErrorMessage(404, { success: false, error: "Account not found." }), /No account/);
    assert.match(setRoleErrorMessage(401, null), /Sign in again/);
    assert.match(setRoleErrorMessage(500, { success: false, error: "boom" }), /\(500\): boom/);
  });
  it("tells a missing Function from a missing account", () => {
    assert.match(setRoleErrorMessage(404, { raw: "Not Found" }), /not available on this backend/);
    assert.match(setRoleErrorMessage(404, null), /not available on this backend/);
  });
});

describe("roles helpers", () => {
  it("says when the change applies", () => {
    assert.match(setRoleSuccessMessage("lab", true, "a@b.c"), /^Lab granted to a@b\.c\..*next sign-in or token refresh/);
    assert.match(setRoleSuccessMessage("staff", false, "a@b.c"), /^Staff revoked from a@b\.c\./);
  });
  it("lists an account's roles once, admin first", () => {
    const roles = accountRoleNames("user", [{ role: "user" }, { role: "lab" }, { role: "staff" }, { role: "admin" }]);
    assert.deepEqual(sortRoleNames(roles), ["admin", "staff", "lab", "user"]);
  });
  it("knows the managed roles", () => {
    assert.equal(isManagedRole("lab"), true);
    assert.equal(isManagedRole("staff"), true);
    assert.equal(isManagedRole("admin"), false);
  });
});
