const { GraphQLClient, ClientError } = require("graphql-request");

const HASURA_CLAIMS = "https://hasura.io/jwt/claims";

function graphqlUrl() {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
  const region = process.env.NEXT_PUBLIC_NHOST_REGION;
  if (!subdomain || !region) {
    throw new Error("NEXT_PUBLIC_NHOST_SUBDOMAIN and NEXT_PUBLIC_NHOST_REGION are required");
  }
  return `https://${subdomain}.graphql.${region}.nhost.run/v1`;
}

function parseJwtRoles(accessToken) {
  try {
    const part = accessToken.split(".")[1];
    if (!part) return [];
    const json = Buffer.from(part, "base64url").toString("utf8");
    const payload = JSON.parse(json);
    const claims = payload[HASURA_CLAIMS];
    const raw = claims?.["x-hasura-allowed-roles"];
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === "string") {
      if (raw.startsWith("[")) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed.map(String);
        } catch {
          return raw.split(",").map((role) => role.trim()).filter(Boolean);
        }
      }
      return raw.split(",").map((role) => role.trim()).filter(Boolean);
    }
    return [];
  } catch {
    return [];
  }
}

function resolveSupportHasuraRole(accessToken) {
  const roles = parseJwtRoles(accessToken);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("staff")) return "staff";
  throw new Error("JWT has no staff or admin Hasura role");
}

/**
 * Hasura wraps Postgres RAISE as "database query error".
 * The useful text is at errors[0].extensions.internal.error.message.
 */
function unwrapHasuraError(error) {
  const gqlErrors =
    (error instanceof ClientError && error.response?.errors) ||
    error?.response?.errors ||
    error?.errors ||
    null;
  if (Array.isArray(gqlErrors) && gqlErrors.length) {
    const messages = gqlErrors.map((e) => {
      const internal =
        e?.extensions?.internal?.error?.message ||
        e?.extensions?.internal?.message;
      if (typeof internal === "string" && internal.trim()) return internal.trim();
      if (typeof e?.message === "string" && e.message.trim()) return e.message.trim();
      return null;
    }).filter(Boolean);
    if (messages.length) return messages.join("; ");
  }
  if (error instanceof Error && error.message) return error.message;
  return String(error || "GraphQL request failed");
}

let boundToken = null;
let client = null;

function getClient() {
  if (!boundToken) {
    throw new Error("Staff access token not bound for catalog GraphQL");
  }
  if (!client) {
    client = new GraphQLClient(graphqlUrl(), {
      headers: {
        Authorization: `Bearer ${boundToken}`,
        "x-hasura-role": resolveSupportHasuraRole(boundToken),
      },
    });
  }
  return client;
}

function bindStaffToken(token) {
  boundToken = token;
  client = null;
}

async function staffGql(query, variables) {
  try {
    return await getClient().request(query, variables);
  } catch (error) {
    throw new Error(unwrapHasuraError(error));
  }
}

module.exports = { staffGql, bindStaffToken, unwrapHasuraError };
