const { GraphQLClient } = require("graphql-request");

function graphqlUrl() {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
  const region = process.env.NEXT_PUBLIC_NHOST_REGION;
  if (!subdomain || !region) {
    throw new Error("NEXT_PUBLIC_NHOST_SUBDOMAIN and NEXT_PUBLIC_NHOST_REGION are required");
  }
  return `https://${subdomain}.graphql.${region}.nhost.run/v1`;
}

function readAdminSecret() {
  const secret = process.env.HASURA_GRAPHQL_ADMIN_SECRET;
  if (!secret) {
    throw new Error("HASURA_GRAPHQL_ADMIN_SECRET is not configured");
  }
  return secret;
}

let client = null;

function getClient() {
  if (!client) {
    client = new GraphQLClient(graphqlUrl(), {
      headers: {
        "x-hasura-admin-secret": readAdminSecret(),
      },
    });
  }
  return client;
}

async function adminGql(query, variables) {
  return getClient().request(query, variables);
}

module.exports = { adminGql };
