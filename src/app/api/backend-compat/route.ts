import { NextResponse } from "next/server";
import { PROBE_HEADERS, evaluateCompatibility, parseApiInfo } from "@/lib/backend-compatibility";

export const dynamic = "force-dynamic";

/** Probes the backend's public `api-info` Function (server side: no CORS preflight for the headers). */
export async function GET() {
  const subdomain = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;
  const region = process.env.NEXT_PUBLIC_NHOST_REGION;
  if (!subdomain || !region) return NextResponse.json({ status: "unknown" });
  try {
    const res = await fetch(`https://${subdomain}.functions.${region}.nhost.run/v1/api-info`, {
      headers: PROBE_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    const info = res.ok ? parseApiInfo(await res.json()) : null;
    if (!info) return NextResponse.json({ status: "unknown" });
    return NextResponse.json({ status: evaluateCompatibility(info), ...info });
  } catch {
    // Fail open: a failed probe never blocks Support.
    return NextResponse.json({ status: "unknown" });
  }
}
