/**
 * Security headers of every Support response. The static ones are set in `next.config.ts`; the
 * page CSP carries a per-request nonce and is set by `src/middleware.ts`, which also passes it on
 * the request so Next.js stamps it on its own scripts. Pure functions: unit-tested in Node.
 */

/** Origins of the project's Nhost services (`https://{subdomain}.{service}.{region}.nhost.run`). */
export function nhostOrigins(subdomain: string | undefined, region: string | undefined) {
  if (!subdomain || !region) return { storage: [] as string[], all: [] as string[] };
  const origin = (service: string) => `https://${subdomain}.${service}.${region}.nhost.run`;
  const storage = origin("storage");
  return { storage: [storage], all: [origin("auth"), origin("graphql"), storage, origin("functions")] };
}

export type PageCspOptions = {
  nonce: string;
  /** `next dev` needs `eval` for React's debugging tools. */
  dev: boolean;
  nhostSubdomain?: string;
  nhostRegion?: string;
};

/**
 * CSP of every page: scripts only with the request's nonce (and what they load), network only to
 * this origin and the project's Nhost, images from this origin, blobs and the project's Storage,
 * no plugins, no framing, no foreign forms or `<base>`.
 */
export function pageContentSecurityPolicy(options: PageCspOptions): string {
  const nhost = nhostOrigins(options.nhostSubdomain, options.nhostRegion);
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${options.nonce}'`,
      "'strict-dynamic'",
      ...(options.dev ? ["'unsafe-eval'"] : []),
    ],
    // React style attributes (Recharts, previews) and the phone preview's Google Fonts import.
    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
    "img-src": ["'self'", "data:", "blob:", ...nhost.storage],
    "connect-src": ["'self'", ...nhost.all],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

/** A fresh base64 nonce (128 bits) for one page response. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * CSP of every API response (and the file proxy): nothing loads, nothing frames it, and a
 * response opened as a document runs sandboxed (no script, unique origin).
 */
export const API_CONTENT_SECURITY_POLICY = "default-src 'none'; frame-ancestors 'none'; sandbox";

/** Headers of every response, pages and API alike (`next.config.ts` `headers()`). */
export const STATIC_SECURITY_HEADERS: readonly { key: string; value: string }[] = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];
