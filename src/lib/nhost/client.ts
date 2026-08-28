import { NhostClient } from "@nhost/react";

export const nhost = new NhostClient({
  subdomain: process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN ?? "build-placeholder",
  region: process.env.NEXT_PUBLIC_NHOST_REGION ?? "eu-central-1",
});

export { hasAdminRole } from "./jwt";
