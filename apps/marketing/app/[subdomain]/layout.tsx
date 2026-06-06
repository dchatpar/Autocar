/**
 * Per-subdomain layout — applies dealer branding to every public
 * page, then delegates to nested routes (homepage, inventory, ...).
 *
 * Resolves the dealer by subdomain (or by custom host) on every
 * request. The lookup is cached for 60s at the edge via ISR tags
 * so a config change propagates within a minute.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveDealerSiteBySubdomain, resolveDealerSiteByHost, type PublicDealerSite } from "@/lib/api";
import { siteOrigin, ROOT_DOMAIN } from "@/lib/api";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

interface SubdomainLayoutProps {
  children: React.ReactNode;
  params: Promise<{ subdomain: string }>;
}

/**
 * CSS custom properties derived from the dealer's themeConfig.
 * We inline a `<style>` tag (scoped via `data-dealer-theme`) so the
 * override is local to the rendered subtree and never leaks into
 * sibling dealer sites served from the same deployment.
 */
function themeStyleTag(site: PublicDealerSite): string {
  const t = site.website.themeConfig ?? {};
  const lines: string[] = [];
  if (t.primaryColor) lines.push(`--brand-primary: ${t.primaryColor};`);
  if (t.accentColor) lines.push(`--brand-accent: ${t.accentColor};`);
  if (t.fontFamily) {
    lines.push(`--font-sans: ${t.fontFamily}, ui-sans-serif, system-ui, sans-serif;`);
  }
  if (t.logo) lines.push(`--dealer-logo: url('${t.logo}');`);
  if (t.address?.line1) lines.push(`--dealer-address-line1: '${t.address.line1}';`);
  if (t.address?.city) lines.push(`--dealer-address-city: '${t.address.city}';`);
  if (t.phone) lines.push(`--dealer-phone: '${t.phone}';`);
  return `[data-dealer-theme="${site.website.subdomain}"] { ${lines.join(" ")} }`;
}

/**
 * derivePageMetadata — generate Next.js Metadata for a subdomain
 * page from the dealer's site config + per-page overrides.
 */
export function deriveSiteMetadata(
  site: PublicDealerSite,
  overrides: {
    title?: string;
    description?: string;
    ogImage?: string;
    path?: string;
  } = {},
): Metadata {
  const seo = site.website.seoConfig ?? {};
  const dealerName = site.dealer.name;
  const title = overrides.title ?? seo.title ?? `${dealerName} — New & Used Cars`;
  const description =
    overrides.description ??
    seo.description ??
    `Browse new and used cars for sale at ${dealerName}. View inventory, request a quote, or apply for financing online.`;
  const ogImage = overrides.ogImage ?? seo.ogImage ?? null;
  const origin = siteOrigin(site.website.subdomain);
  const url = overrides.path ? `${origin}${overrides.path}` : origin;
  return {
    title,
    description,
    keywords: seo.keywords ?? [],
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: "website",
      url,
      siteName: dealerName,
      title,
      description,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

/* --------------------------------------------------------------- */
/* Layout                                                           */
/* --------------------------------------------------------------- */

export default async function SubdomainLayout({
  children,
  params,
}: SubdomainLayoutProps): Promise<React.ReactElement> {
  const { subdomain } = await params;

  // Sanity check — the middleware should already have stripped
  // reserved subdomains, but a direct nav to /www/inventory should
  // 404, not 500.
  if (!/^[a-z0-9-]{2,40}$/.test(subdomain)) {
    notFound();
  }

  const site = await resolveDealerSiteBySubdomain(subdomain);
  if (!site) {
    notFound();
  }

  return (
    <div data-dealer-theme={site.website.subdomain} className="min-h-screen flex flex-col">
      {/* Per-dealer brand variables. Scoped via data attribute so
          the same Next process can host multiple dealer sites. */}
      <style
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: themeStyleTag(site) }}
      />

      {/* Analytics — only injected if the dealer configured an ID. */}
      {site.website.seoConfig?.googleAnalyticsId ? (
        <>
          <script
            async
            src={`https://www.googletagmanager.com/gtag/js?id=${site.website.seoConfig.googleAnalyticsId}`}
          />
          <script
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{
              __html:
                `window.dataLayer = window.dataLayer || [];\n` +
                `function gtag(){dataLayer.push(arguments);}\n` +
                `gtag('js', new Date());\n` +
                `gtag('config', '${site.website.seoConfig.googleAnalyticsId}');`,
            }}
          />
        </>
      ) : null}

      <Header site={site} />
      <main className="flex-1">{children}</main>
      <Footer site={site} />
    </div>
  );
}

/* --------------------------------------------------------------- */
/* Metadata generator for the [subdomain] tree                     */
/* --------------------------------------------------------------- */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ subdomain: string }>;
}): Promise<Metadata> {
  const { subdomain } = await params;
  const site = await resolveDealerSiteBySubdomain(subdomain);
  if (!site) return { title: "Site not found" };
  return deriveSiteMetadata(site, {
    path: "/",
  });
}

/* --------------------------------------------------------------- */
/* Static + dynamic generation                                     */
/* --------------------------------------------------------------- */

// ISR — revalidate the dealer site config every 60s.
export const revalidate = 60;
// We don't generate a static param set for every dealer (could
// be 10k+ dealers); we render on demand and cache.
export const dynamicParams = true;

/* --------------------------------------------------------------- */
/* Hosts / notFound                                                 */
/* --------------------------------------------------------------- */

export { ROOT_DOMAIN };
