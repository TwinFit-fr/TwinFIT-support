import { GraphQLClient } from "graphql-request";

function graphqlUrl(): string {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
  const region = process.env.NEXT_PUBLIC_NHOST_REGION;
  if (!subdomain || !region) {
    throw new Error("NEXT_PUBLIC_NHOST_SUBDOMAIN and NEXT_PUBLIC_NHOST_REGION are required");
  }
  return `https://${subdomain}.graphql.${region}.nhost.run/v1`;
}

function readAdminSecret(): string {
  const secret = process.env.HASURA_GRAPHQL_ADMIN_SECRET;
  if (!secret) {
    throw new Error("HASURA_GRAPHQL_ADMIN_SECRET is not configured");
  }
  return secret;
}

let client: GraphQLClient | null = null;

function getClient(): GraphQLClient {
  if (!client) {
    client = new GraphQLClient(graphqlUrl(), {
      headers: {
        "x-hasura-admin-secret": readAdminSecret(),
      },
    });
  }
  return client;
}

export async function adminGql<T = Record<string, unknown>>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  return getClient().request<T>(query, variables);
}
