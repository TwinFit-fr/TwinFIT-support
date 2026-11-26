"use client";

import { NhostProvider } from "@nhost/react";
import { nhost } from "@/lib/nhost/client";

export function Providers({ children }: { children: React.ReactNode }) {
  return <NhostProvider nhost={nhost}>{children}</NhostProvider>;
}
