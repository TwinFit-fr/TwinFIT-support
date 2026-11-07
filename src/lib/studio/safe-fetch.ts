import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/**
 * Fetch an https URL a staff member typed, without reaching anything private: the host must
 * resolve to public addresses, redirects are followed by hand (each hop checked again, 3 at
 * most) and only https is allowed. Returns the final response with `redirect: "manual"` resolved.
 */
export async function fetchPublicUrl(url: string, init: RequestInit = {}, maxRedirects = 3): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const target = new URL(current);
    if (target.protocol !== "https:") throw new Error("Only https URLs are allowed");
    await assertPublicHost(target.hostname);
    const res = await fetch(target, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error(`Redirect without a location (${res.status})`);
      current = new URL(location, target).toString();
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Private hosts are not allowed");
  }
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (!addresses.length) throw new Error(`Could not resolve ${host}`);
  for (const address of addresses) {
    if (isPrivateAddress(address)) throw new Error("Private hosts are not allowed");
  }
}

/** Loopback, link-local, private, carrier-grade NAT, unique-local and unspecified ranges. */
export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = address.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb");
}
