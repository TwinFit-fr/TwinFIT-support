/**
 * Where the sign-in page sends the user back to: the page that asked for the sign-in, when it is
 * a path of this app. Anything else (another origin, a protocol-relative "//host", a backslash
 * trick, the login page itself) falls back to the dashboard, so the parameter cannot redirect
 * away from Support.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if ([...value].some((ch) => ch.charCodeAt(0) < 0x20)) return fallback;
  const path = value.split(/[?#]/, 1)[0];
  if (path === "/login" || path.startsWith("/login/")) return fallback;
  return value;
}

/** The login URL for a page that needs a session (`next` brings the user back there). */
export function loginUrl(current: string): string {
  const next = safeNextPath(current, "");
  return next && next !== "/" ? `/login?next=${encodeURIComponent(next)}` : "/login";
}

/** The Studio's pages get the dark sign-in screen, so the way in is not a bright white page. */
export function isStudioPath(path: string): boolean {
  return path === "/studio" || path.startsWith("/studio/") || path.startsWith("/studio?");
}
