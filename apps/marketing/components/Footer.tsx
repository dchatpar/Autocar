/**
 * Public-site footer. Renders dealer contact info, custom
 * footerLinks from themeConfig, and standard SEO links (Privacy,
 * Terms, Sitemap).
 */

import Link from "next/link";
import type { PublicDealerSite } from "@/lib/api";

interface FooterProps {
  site: PublicDealerSite;
}

export function Footer({ site }: FooterProps): React.ReactElement {
  const base = `/${site.website.subdomain}`;
  const theme = site.website.themeConfig ?? {};
  const addressLine = [
    theme.address?.line1,
    theme.address?.line2,
    [theme.address?.city, theme.address?.region].filter(Boolean).join(", "),
    theme.address?.postal,
  ]
    .filter(Boolean)
    .join(" • ");
  const year = new Date().getFullYear();

  return (
    <footer
      className="mt-12 border-t"
      style={{
        backgroundColor: "var(--surface-card)",
        borderColor: "var(--border-default)",
      }}
    >
      <div className="container-marketing grid gap-8 py-10 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="mb-2 text-lg font-bold">{site.dealer.name}</div>
          {addressLine ? (
            <p className="text-sm text-[color:var(--ink-muted)]">{addressLine}</p>
          ) : null}
          {theme.phone ? (
            <p className="mt-1 text-sm">
              <a href={`tel:${theme.phone.replace(/[^0-9+]/g, "")}`}>{theme.phone}</a>
            </p>
          ) : null}
          {theme.email ? (
            <p className="text-sm">
              <a href={`mailto:${theme.email}`}>{theme.email}</a>
            </p>
          ) : null}
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[color:var(--ink-muted)]">
            Browse
          </h3>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href={`${base}/inventory`}>All inventory</Link>
            </li>
            <li>
              <Link href={`${base}/inventory?condition=NEW`}>New vehicles</Link>
            </li>
            <li>
              <Link href={`${base}/inventory?condition=USED`}>Pre-owned</Link>
            </li>
            <li>
              <Link href={`${base}/financing`}>Apply for financing</Link>
            </li>
            <li>
              <Link href={`${base}/contact`}>Contact us</Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[color:var(--ink-muted)]">
            More
          </h3>
          <ul className="space-y-2 text-sm">
            {(theme.footerLinks ?? []).map((link, idx) => (
              <li key={`${link.href}-${idx}`}>
                <a href={link.href} rel="noopener noreferrer">
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <Link href={`${base}/sitemap.xml`}>Sitemap</Link>
            </li>
            <li>
              <Link href={`${base}/robots.txt`}>Robots</Link>
            </li>
            <li>
              <Link href={`${base}/feed.xml`}>Vehicle feed</Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t" style={{ borderColor: "var(--border-default)" }}>
        <div className="container-marketing flex flex-col items-start gap-2 py-4 text-xs text-[color:var(--ink-muted)] md:flex-row md:items-center md:justify-between">
          <p>© {year} {site.dealer.name}. All rights reserved.</p>
          <p>
            Powered by{" "}
            <a
              href="https://dealeros.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              DealerOS
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
