import { Providers } from "./providers";
import "./globals.css";

/**
 * Every page is rendered per request: the middleware's CSP nonce only reaches Next.js scripts on
 * dynamic renders (a prerendered page would carry no nonce and its scripts would be blocked).
 */
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
