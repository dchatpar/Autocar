/**
 * Root layout — wraps every dealer site in the public marketing app.
 *
 * The marketing app uses a [subdomain] catch-all inside this layout,
 * which means the actual branded UI is rendered by `app/[subdomain]/
 * layout.tsx`. This root layer only:
 *   - sets the <html>/<body> shell with the global stylesheet
 *   - serves the unbranded fallback for requests that don't match a
 *     known dealer (e.g. the apex domain)
 */

import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "DealerOS — Car dealer websites",
    template: "%s · DealerOS",
  },
  description:
    "DealerOS powers public car-dealer websites: SEO-optimised inventory, lead capture, and finance applications for every dealership on the platform.",
  robots: {
    index: true,
    follow: true,
  },
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_API_BASE_URL
      ? `https://${process.env.NEXT_PUBLIC_MARKETING_ROOT_DOMAIN ?? "dealeros.com"}`
      : "http://localhost:3000",
  ),
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0c0f" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
