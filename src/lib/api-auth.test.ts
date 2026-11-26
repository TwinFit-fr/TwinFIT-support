import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import type { CryptoKey, JWK } from "jose";
import {
  requireAdminAuth,
  requireAdminToken,
  requireStaffAuth,
  requireStaffToken,
} from "./api-auth.ts";
import {
  InvalidAccessTokenError,
  nhostJwksUrl,
  nhostJwtIssuer,
  setAccessTokenKeysForTesting,
  verifyAccessToken,
} from "./nhost/verify-jwt.ts";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const KID = "test-kid";
// What Nhost Auth signs into `iss`: its server URL.
const ISSUER = "https://test.auth.local.nhost.run/v1";
const savedEnv = { ...process.env };

let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;
let keySet: ReturnType<typeof createLocalJWKSet>;

type TokenOptions = {
  roles?: unknown;
  key?: CryptoKey;
  kid?: string;
  issuer?: string | null;
  expiresIn?: string | number | null;
  claims?: Record<string, unknown>;
};

/** An access token shaped like Nhost Auth's, signed with the test key unless told otherwise. */
async function token({
  roles = ["user", "me", "staff"],
  key = privateKey,
  kid = KID,
  issuer = ISSUER,
  expiresIn = "15m",
  claims,
}: TokenOptions = {}): Promise<string> {
  const jwt = new SignJWT({
    "https://hasura.io/jwt/claims": claims ?? {
      "x-hasura-allowed-roles": roles,
      "x-hasura-default-role": "user",
      "x-hasura-user-id": USER_ID,
    },
  })
    .setProtectedHeader({ alg: "RS256", kid, typ: "JWT" })
    .setSubject(USER_ID)
    .setIssuedAt();
  if (issuer !== null) jwt.setIssuer(issuer);
  if (expiresIn !== null) jwt.setExpirationTime(expiresIn);
  return jwt.sign(key);
}

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const payloadOf = (jwt: string) =>
  JSON.parse(Buffer.from(jwt.split(".")[1]!, "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;

function request(jwt?: string): Request {
  return new Request("http://localhost/api/test", {
    headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
  });
}

/** The status of the Response a require* call throws, or "ok" when it resolves. */
async function statusOf(promise: Promise<unknown>): Promise<number | "ok"> {
  try {
    await promise;
    return "ok";
  } catch (error) {
    if (error instanceof Response) return error.status;
    throw error;
  }
}

before(async () => {
  process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN = "test";
  process.env.NEXT_PUBLIC_NHOST_REGION = "local";
  delete process.env.NHOST_JWT_ISSUER;
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  otherPrivateKey = (await generateKeyPair("RS256")).privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: "RS256", use: "sig" };
  keySet = createLocalJWKSet({ keys: [jwk] });
  setAccessTokenKeysForTesting(keySet);
});

after(() => {
  setAccessTokenKeysForTesting(null);
  process.env = savedEnv;
});

describe("verifyAccessToken", () => {
  it("returns the user and the roles of a valid token", async () => {
    const verified = await verifyAccessToken(await token({ roles: ["user", "staff", "admin"] }));
    assert.equal(verified.userId, USER_ID);
    assert.deepEqual(verified.roles, ["user", "staff", "admin"]);
  });

  it("rejects a token signed with another key under the same kid", async () => {
    await assert.rejects(
      verifyAccessToken(await token({ key: otherPrivateKey })),
      InvalidAccessTokenError,
    );
  });

  it("rejects a token whose payload was edited after signing", async () => {
    const [header, , signature] = (await token({ roles: ["user"] })).split(".");
    const payload = payloadOf(await token({ roles: ["user"] }));
    payload["https://hasura.io/jwt/claims"] = {
      "x-hasura-allowed-roles": ["user", "admin"],
      "x-hasura-default-role": "user",
      "x-hasura-user-id": USER_ID,
    };
    await assert.rejects(
      verifyAccessToken(`${header}.${b64(payload)}.${signature}`),
      InvalidAccessTokenError,
    );
  });

  it("rejects an unsigned (alg none) token", async () => {
    const payload = payloadOf(await token({ roles: ["admin"] }));
    await assert.rejects(
      verifyAccessToken(`${b64({ alg: "none", typ: "JWT" })}.${b64(payload)}.`),
      InvalidAccessTokenError,
    );
  });

  it("rejects an HS256 token", async () => {
    const hs = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256", kid: KID })
      .setSubject(USER_ID)
      .setIssuer(ISSUER)
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode("a-shared-secret-of-at-least-32-bytes!!"));
    await assert.rejects(verifyAccessToken(hs), InvalidAccessTokenError);
  });

  it("rejects an expired token", async () => {
    const expired = await token({ expiresIn: Math.floor(Date.now() / 1000) - 60 });
    await assert.rejects(verifyAccessToken(expired), InvalidAccessTokenError);
  });

  it("rejects a token without exp", async () => {
    await assert.rejects(verifyAccessToken(await token({ expiresIn: null })), InvalidAccessTokenError);
  });

  it("ignores iss when NHOST_JWT_ISSUER is unset (as the backend Functions do)", async () => {
    for (const issuer of [ISSUER, "hasura-auth", "anything", null]) {
      assert.equal((await verifyAccessToken(await token({ issuer }))).userId, USER_ID);
    }
  });

  it("with NHOST_JWT_ISSUER, accepts that issuer only", async (t) => {
    process.env.NHOST_JWT_ISSUER = ISSUER;
    t.after(() => {
      delete process.env.NHOST_JWT_ISSUER;
    });
    assert.equal((await verifyAccessToken(await token({ issuer: ISSUER }))).userId, USER_ID);
    await assert.rejects(verifyAccessToken(await token({ issuer: "evil" })), InvalidAccessTokenError);
    // Another Nhost project's Auth (its keys would not match either).
    await assert.rejects(
      verifyAccessToken(await token({ issuer: "https://other.auth.local.nhost.run/v1" })),
      InvalidAccessTokenError,
    );
    await assert.rejects(verifyAccessToken(await token({ issuer: "hasura-auth" })), InvalidAccessTokenError);
    await assert.rejects(verifyAccessToken(await token({ issuer: null })), InvalidAccessTokenError);
  });

  it("rejects a token signed with an unknown kid", async () => {
    await assert.rejects(verifyAccessToken(await token({ kid: "other" })), InvalidAccessTokenError);
  });

  it("rejects garbage", async () => {
    await assert.rejects(verifyAccessToken("not-a-jwt"), InvalidAccessTokenError);
  });
});

describe("requireStaffToken / requireAdminToken", () => {
  it("staff passes the staff check and gets 403 on the admin check", async () => {
    const jwt = await token({ roles: ["user", "me", "staff"] });
    assert.equal(await requireStaffToken(request(jwt)), jwt);
    assert.equal(await statusOf(requireAdminToken(request(jwt))), 403);
    assert.deepEqual(await requireStaffAuth(request(jwt)), {
      token: jwt,
      userId: USER_ID,
      role: "staff",
    });
  });

  it("admin (alone or with staff) passes both checks", async () => {
    for (const roles of [["user", "admin"], ["user", "staff", "admin"]]) {
      const jwt = await token({ roles });
      assert.equal(await requireStaffToken(request(jwt)), jwt);
      assert.equal(await requireAdminToken(request(jwt)), jwt);
      assert.equal((await requireAdminAuth(request(jwt))).role, "admin");
    }
  });

  it("a valid token without a Support role gets 403", async () => {
    const jwt = await token({ roles: ["user", "me", "lab"] });
    assert.equal(await statusOf(requireStaffToken(request(jwt))), 403);
  });

  it("no token, a forged token or an expired token gets 401", async () => {
    const forged = await token({ roles: ["user", "admin"], key: otherPrivateKey });
    const expired = await token({
      roles: ["user", "admin"],
      expiresIn: Math.floor(Date.now() / 1000) - 1,
    });
    const unsigned = `${b64({ alg: "none" })}.${b64(payloadOf(forged))}.sig`;
    for (const jwt of [undefined, forged, expired, unsigned]) {
      assert.equal(await statusOf(requireStaffToken(request(jwt))), 401);
      assert.equal(await statusOf(requireAdminToken(request(jwt))), 401);
    }
  });

  it("fails closed with 503 when the keys cannot be read", async (t) => {
    setAccessTokenKeysForTesting(async () => {
      throw new TypeError("fetch failed");
    });
    t.after(() => setAccessTokenKeysForTesting(keySet));
    const errorLog = t.mock.method(console, "error", () => {});
    assert.equal(await statusOf(requireStaffToken(request(await token()))), 503);
    assert.equal(errorLog.mock.callCount(), 1);
  });
});

describe("nhostJwksUrl / nhostJwtIssuer", () => {
  it("are the configured project's JWKS and the optional issuer", (t) => {
    t.after(() => {
      process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN = "test";
      process.env.NEXT_PUBLIC_NHOST_REGION = "local";
      delete process.env.NHOST_JWT_ISSUER;
    });
    process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN = "abc";
    process.env.NEXT_PUBLIC_NHOST_REGION = "eu-central-1";
    assert.equal(
      nhostJwksUrl().href,
      "https://abc.auth.eu-central-1.nhost.run/v1/.well-known/jwks.json",
    );
    assert.equal(nhostJwtIssuer(), undefined);
    process.env.NHOST_JWT_ISSUER = "https://auth.example.com/v1";
    assert.equal(nhostJwtIssuer(), "https://auth.example.com/v1");
    delete process.env.NEXT_PUBLIC_NHOST_REGION;
    assert.throws(() => nhostJwksUrl(), /required to verify tokens/);
  });

  it("fails closed with 503 when the Nhost project is not configured", async (t) => {
    t.after(() => {
      process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN = "test";
      setAccessTokenKeysForTesting(keySet);
    });
    const jwt = await token();
    // The real (remote JWKS) key set, which needs the project's subdomain and region.
    setAccessTokenKeysForTesting(null);
    delete process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
    assert.equal(await statusOf(requireStaffToken(request(jwt))), 503);
  });
});
