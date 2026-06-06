/**
 * Public-site header. Renders the dealer logo, top nav (Home,
 * Inventory, About, Contact, Financing), and a phone CTA. The
 * component reads the dealer theme via the `data-dealer-theme`
 * attribute the layout sets.
 */

import Link from "next/link";
import type { PublicDealerSite } from "@/lib/api";

interface HeaderProps {
  site: PublicDealerSite;
}

const NAV_LINKS: ReadonlyArray<{ label: string; href: string }> = [
  { label: "Home", href: "" },
  { label: "Inventory", href: "/inventory" },
  { label: "Financing", href: "/financing" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export function Header({ site }: HeaderProps): React.ReactElement {
  const phone = site.website.themeConfig?.phone;
  const base = `/${site.website.subdomain}`;
  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur"
      style={{
        backgroundColor: "color-mix(in oklab, var(--surface-bg) 85%, transparent)",
        borderColor: "var(--border-default)",
      }}
    >
      <div className="container-marketing flex h-16 items-center justify-between gap-4">
        <Link
          href={base}
          className="flex items-center gap-2 font-bold tracking-tight"
          aria-label={`${site.dealer.name} home`}
        >
          {site.website.themeConfig?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={site.website.themeConfig.logo}
              alt={`${site.dealer.name} logo`}
              className="h-8 w-auto max-w-[180px] object-contain"
            />
          ) : (
            <span className="text-lg font-bold">{site.dealer.name}</span>
          )}
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href || "home"}
              href={`${base}${link.href}`}
              className="rounded-md px-3 py-2 text-sm font-medium hover:bg-[color:var(--surface-card)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {phone ? (
            <a
              href={`tel:${phone.replace(/[^0-9+]/g, "")}`}
              className="hidden text-sm font-semibold md:inline-flex"
              aria-label={`Call ${site.dealer.name} at ${phone}`}
            >
              {phone}
            </a>
          ) : null}
          <Link
            href={`${base}/contact`}
            className="btn-primary text-sm"
          >
            Get a quote
          </Link>
        </div>
      </div>

      {/* Mobile nav strip */}
      <div className="md:hidden">
        <div className="container-marketing flex gap-1 overflow-x-auto py-2 text-sm">
          {NAV_LINKS.map((link) => (
            <Link
              key={`m-${link.href || "home"}`}
              href={`${base}${link.href}`}
              className="whitespace-nowrap rounded-md px-3 py-1.5 hover:bg-[color:var(--surface-card)]"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </header>
  );
}
