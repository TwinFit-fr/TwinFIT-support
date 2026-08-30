import { GraphQLClient } from "graphql-request";
import { resolveSupportHasuraRole } from "@/lib/nhost/jwt";

function graphqlUrl(): string {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
  const region = process.env.NEXT_PUBLIC_NHOST_REGION;
  if (!subdomain || !region) {
    throw new Error("NEXT_PUBLIC_NHOST_SUBDOMAIN and NEXT_PUBLIC_NHOST_REGION are required");
  }
  return `https://${subdomain}.graphql.${region}.nhost.run/v1`;
}

export async function staffGql<T = Record<string, unknown>>(
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const client = new GraphQLClient(graphqlUrl(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-hasura-role": resolveSupportHasuraRole(accessToken),
    },
  });
  return client.request<T>(query, variables);
}
