import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import type { JWTPayload, JWTVerifyGetKey } from "jose";
import { HASURA_CLAIMS, rolesFromHasuraClaims } from "./jwt.ts";

/**
 * Server-side verification of Nhost access tokens, as the backend Functions do it
 * (TwinFIT-backend `functions/_lib/infra/jwt.ts`): RS256 only, signature checked against the
 * project's public key, `exp` required and enforced. Support runs outside Nhost, so it reads the
 * public keys from the Auth service's JWKS instead of `NHOST_JWT_SECRET`. Like the backend, `iss`
 * is not checked by default: the JWKS is the project's own, so the signature already binds the
 * token to this project. `NHOST_JWT_ISSUER` turns on an exact `iss` match.
 */
export const NHOST_JWT_ALGORITHMS = ["RS256"];

export type VerifiedAccessToken = {
  userId: string;
  roles: string[];
  payload: JWTPayload;
};

/** The token is forged, expired, malformed or not an Nhost access token (401). */
export class InvalidAccessTokenError extends Error {
  constructor(message = "Invalid or expired token") {
    super(message);
    this.name = "InvalidAccessTokenError";
  }
}

/** The keys could not be read (JWKS unreachable, Nhost env vars missing): fail closed (503). */
export class AccessTokenVerificationUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AccessTokenVerificationUnavailableError";
  }
}

/** The project's Auth service URL, e.g. `https://abc.auth.eu-central-1.nhost.run/v1`. */
export function nhostAuthUrl(): string {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
  const region = process.env.NEXT_PUBLIC_NHOST_REGION;
  if (!subdomain || !region) {
    throw new AccessTokenVerificationUnavailableError(
      "NEXT_PUBLIC_NHOST_SUBDOMAIN and NEXT_PUBLIC_NHOST_REGION are required to verify tokens",
    );
  }
  return `https://${subdomain}.auth.${region}.nhost.run/v1`;
}

export function nhostJwksUrl(): URL {
  return new URL(`${nhostAuthUrl()}/.well-known/jwks.json`);
}

/**
 * The `iss` access tokens must carry, when `NHOST_JWT_ISSUER` sets one (exact match); undefined
 * (no issuer check, as in the backend Functions) otherwise. Nhost Auth 0.49 signs its server URL,
 * e.g. `https://<subdomain>.auth.<region>.nhost.run/v1`.
 */
export function nhostJwtIssuer(): string | undefined {
  return process.env.NHOST_JWT_ISSUER || undefined;
}

// One key set per server instance: jose caches the keys and refetches on an unknown `kid`
// (key rotation), with a cooldown so forged `kid`s cannot hammer the Auth service.
let keys: JWTVerifyGetKey | null = null;

function accessTokenKeys(): JWTVerifyGetKey {
  keys ??= createRemoteJWKSet(nhostJwksUrl(), { timeoutDuration: 5_000 });
  return keys;
}

/** Replaces the key set (tests sign with a local key pair); null restores the Nhost JWKS. */
export function setAccessTokenKeysForTesting(next: JWTVerifyGetKey | null): void {
  keys = next;
}

/** Errors that mean the token itself is bad; anything else is a key or network problem. */
function isTokenError(error: unknown): boolean {
  return (
    error instanceof errors.JWTExpired ||
    error instanceof errors.JWTClaimValidationFailed ||
    error instanceof errors.JWTInvalid ||
    error instanceof errors.JWSInvalid ||
    error instanceof errors.JWSSignatureVerificationFailed ||
    error instanceof errors.JOSEAlgNotAllowed ||
    error instanceof errors.JOSENotSupported ||
    error instanceof errors.JWKSNoMatchingKey ||
    error instanceof errors.JWKSMultipleMatchingKeys
  );
}

/**
 * Verifies an access token and returns its user and allowed roles, read from the verified
 * payload. Throws {@link InvalidAccessTokenError} for a bad token and
 * {@link AccessTokenVerificationUnavailableError} when the keys cannot be read.
 */
export async function verifyAccessToken(token: string): Promise<VerifiedAccessToken> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, accessTokenKeys(), {
      algorithms: NHOST_JWT_ALGORITHMS,
      issuer: nhostJwtIssuer(),
      requiredClaims: ["exp"],
    }));
  } catch (error) {
    if (isTokenError(error)) throw new InvalidAccessTokenError();
    if (error instanceof AccessTokenVerificationUnavailableError) throw error;
    console.error("jwt: token verification unavailable", error);
    throw new AccessTokenVerificationUnavailableError("Token verification unavailable", {
      cause: error,
    });
  }

  const claims = payload[HASURA_CLAIMS] as Record<string, unknown> | undefined;
  const userId = claims?.["x-hasura-user-id"] ?? payload.sub;
  if (typeof userId !== "string" || !userId) throw new InvalidAccessTokenError();
  return { userId, roles: rolesFromHasuraClaims(claims), payload };
}
