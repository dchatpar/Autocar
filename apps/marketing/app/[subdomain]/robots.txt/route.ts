/**
 * robots.txt for a single dealer site.
 *
 * Allows all well-behaved crawlers and points them at the
 * sitemap, the inventory feed, and the dealer-specific
 * /widget endpoints (if any).
 */

import { resolveDealerSiteBySubdomain } from "@/lib/api";
import { siteOrigin } from "@/lib/api";

export const revalidate = 86400; // 1 day
export const dynamic = "force-static";

interface RouteContext {
  params: Promise<{ subdomain: string }>;
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { subdomain } = await context.params;
  const site = await resolveDealerSiteBySubdomain(subdomain);
  // Even if the site is unpublished we serve a robots.txt that
  // disallows crawling — never silently 404 (which would block
  // search engines from learning the URL space).
  const origin = site ? siteOrigin(site.website.subdomain) : `https://${subdomain}.dealeros.com`;

  const lines: string[] = [
    "# robots.txt for " + (site ? site.dealer.name : subdomain),
    "User-agent: *",
    site && site.website.isPublished ? "Allow: /" : "Disallow: /",
    "",
    "# Sitemap",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
    "# Inventory feed (Google Vehicle Listings compatible)",
    `Sitemap: ${origin}/feed.xml`,
    "",
  ];

  return new Response(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400",
    },
  });
}
