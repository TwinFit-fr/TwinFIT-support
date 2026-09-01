/** Map common Nhost auth errors to English product strings. */
export function mapAuthErrorMessage(raw: string | undefined | null): string {
  if (!raw) return "Sign in failed";
  const lower = raw.toLowerCase();
  if (lower.includes("invalid") && lower.includes("credential")) {
    return "Invalid email or password.";
  }
  if (lower.includes("wrong") && lower.includes("password")) {
    return "Invalid email or password.";
  }
  if (lower.includes("email") && lower.includes("not verified")) {
    return "Email not verified.";
  }
  if (lower.includes("rate limit") || lower.includes("too many")) {
    return "Too many attempts. Try again later.";
  }
  // Already ASCII-heavy technical message — use as-is
  if (/^[\x00-\x7F]*$/.test(raw)) return raw;
  return "Sign in failed";
}
