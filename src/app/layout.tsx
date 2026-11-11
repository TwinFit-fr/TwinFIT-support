"use client";

import { nhost } from "@/lib/nhost/client";
import { NhostSessionProvider } from "@/lib/nhost/provider";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NhostSessionProvider nhost={nhost}>{children}</NhostSessionProvider>
      </body>
    </html>
  );
}
