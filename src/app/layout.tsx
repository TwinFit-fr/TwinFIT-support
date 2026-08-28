"use client";

import { NhostProvider } from "@nhost/react";
import { nhost } from "@/lib/nhost/client";
import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NhostProvider nhost={nhost}>{children}</NhostProvider>
      </body>
    </html>
  );
}
