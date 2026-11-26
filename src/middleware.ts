import { NextResponse, type NextRequest } from "next/server";
import {
  API_CONTENT_SECURITY_POLICY,
  createNonce,
  pageContentSecurityPolicy,
} from "@/lib/security-headers";

/**
 * Content-Security-Policy of every response. API responses are never documents: they get the
 * strict sandbox policy. Pages get a nonce-based policy; the nonce also goes on the request so
 * Next.js adds it to its own scripts (every page is dynamically rendered, see the root layout).
 */
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const response = NextResponse.next();
    response.headers.set("Content-Security-Policy", API_CONTENT_SECURITY_POLICY);
    return response;
  }

  const csp = pageContentSecurityPolicy({
    nonce: createNonce(),
    dev: process.env.NODE_ENV === "development",
    nhostSubdomain: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN,
    nhostRegion: process.env.NEXT_PUBLIC_NHOST_REGION,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
