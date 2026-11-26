/** Nhost services Support talks to. */
export type NhostService = "auth" | "functions" | "graphql" | "storage";

/** Time budget of a server-side call to Functions or Storage, unless the caller gives its own. */
export const UPSTREAM_TIMEOUT_MS = 30_000;

/**
 * Base URL of an Nhost service (`https://<subdomain>.<service>.<region>.nhost.run/v1`), or null
 * when the project is not configured. For callers that degrade (probes, previews).
 */
export function optionalNhostUrl(service: NhostService): string | null {
  // Read as literals so Next.js inlines them in client bundles too.
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN?.trim();
  const region = process.env.NEXT_PUBLIC_NHOST_REGION?.trim();
  if (!subdomain || !region) return null;
  return `https://${subdomain}.${service}.${region}.nhost.run/v1`;
}

/** Base URL of an Nhost service; throws when the project is not configured (never `https://undefined…`). */
export function nhostUrl(service: NhostService): string {
  const url = optionalNhostUrl(service);
  if (!url) {
    throw new Error("NEXT_PUBLIC_NHOST_SUBDOMAIN and NEXT_PUBLIC_NHOST_REGION are required");
  }
  return url;
}
