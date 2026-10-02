import { ClientError, GraphQLClient } from "graphql-request";
import { resolveSupportHasuraRole } from "@/lib/nhost/jwt";

function graphqlUrl(): string {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
  const region = process.env.NEXT_PUBLIC_NHOST_REGION;
  if (!subdomain || !region) {
    throw new Error("NEXT_PUBLIC_NHOST_SUBDOMAIN and NEXT_PUBLIC_NHOST_REGION are required");
  }
  return `https://${subdomain}.graphql.${region}.nhost.run/v1`;
}

type HasuraError = {
  message?: string;
  extensions?: { internal?: { error?: { message?: string }; message?: string } };
};

/**
 * Hasura wraps Postgres RAISE as "database query error"; the useful text (trigger and
 * constraint messages) is at errors[].extensions.internal.error.message.
 */
export function unwrapHasuraError(error: unknown): string {
  const errors: HasuraError[] | undefined =
    error instanceof ClientError ? error.response.errors : undefined;
  const messages = (errors ?? [])
    .map((e) => {
      const internal = e.extensions?.internal?.error?.message ?? e.extensions?.internal?.message;
      return internal?.trim() || e.message?.trim() || null;
    })
    .filter(Boolean);
  if (messages.length) return messages.join("; ");
  if (error instanceof Error && error.message) return error.message;
  return String(error || "GraphQL request failed");
}

/** One request with the caller's JWT; never shared across requests. */
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
  try {
    return await client.request<T>(query, variables);
  } catch (error) {
    throw new Error(unwrapHasuraError(error));
  }
}
