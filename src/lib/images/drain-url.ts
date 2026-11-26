/**
 * Where a drain that ran out of time asks Support to continue. The base URL is fixed by the deploy
 * (`SUPPORT_BASE_URL`), never taken from a request: the Host header is the caller's to choose, and
 * the call carries the staff token (SSRF).
 */

export const DRAIN_PATH = "/api/images/jobs/drain";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

type Env = Record<string, string | undefined>;

/**
 * Origin of this Support deploy: `SUPPORT_BASE_URL` (https, or http on localhost; no credentials),
 * or `http://localhost:$PORT` outside production. Null when it is missing or invalid in production.
 */
export function supportBaseUrl(env: Env = process.env): URL | null {
  const raw = env.SUPPORT_BASE_URL?.trim();
  if (!raw) {
    return env.NODE_ENV === "production" ? null : new URL(`http://localhost:${env.PORT || 3000}`);
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const secure = url.protocol === "https:";
  const local = url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname);
  if (!secure && !local) return null;
  return new URL(url.origin);
}

/** URL of the drain endpoint on this deploy, or null when the base URL is not configured. */
export function drainUrl(env: Env = process.env): URL | null {
  const base = supportBaseUrl(env);
  return base ? new URL(DRAIN_PATH, base) : null;
}
