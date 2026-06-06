/**
 * Sitemap generator for a single dealer site.
 *
 * Renders an XML sitemap of:
 *   - the dealer's homepage, inventory, about, contact, financing
 *   - every available vehicle on the lot
 *
 * Next.js 15 route handlers: this file is colocated under
 * app/[subdomain]/sitemap.xml/route.ts and is automatically served
 * at /{subdomain}/sitemap.xml.
 *
 * ISR: revalidate every hour so newly listed vehicles show up in
 * Google Search Console without a redeploy.
 */

import { resolveDealerSiteBySubdomain, fetchDealerInventory, type PublicVehicle } from "@/lib/api";
import { siteOrigin } from "@/lib/api";

export const revalidate = 3600; // 1 hour
export const dynamic = "force-static";

interface RouteContext {
  params: Promise<{ subdomain: string }>;
}

const STATIC_PATHS: ReadonlyArray<{ path: string; changefreq: string; priority: number }> = [
  { path: "/", changefreq: "daily", priority: 1.0 },
  { path: "/inventory", changefreq: "hourly", priority: 0.9 },
  { path: "/financing", changefreq: "monthly", priority: 0.7 },
  { path: "/about", changefreq: "monthly", priority: 0.6 },
  { path: "/contact", changefreq: "monthly", priority: 0.5 },
];

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlEntry(loc: string, lastmod: Date, changefreq: string, priority: number): string {
  return [
    "  <url>",
    `    <loc>${escapeXml(loc)}</loc>`,
    `    <lastmod>${lastmod.toISOString()}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority.toFixed(1)}</priority>`,
    "  </url>",
  ].join("\n");
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { subdomain } = await context.params;
  const site = await resolveDealerSiteBySubdomain(subdomain);
  if (!site) {
    return new Response("Not found", { status: 404 });
  }

  const origin = siteOrigin(site.website.subdomain);
  const now = new Date();

  // Pull all available vehicles. We page through until exhausted
  // so the sitemap is complete.
  const vehicles: PublicVehicle[] = [];
  let cursor: string | undefined = undefined;
  const perBatch = Number(process.env.SITEMAP_VEHICLES_PER_BATCH ?? 1000);
  for (let i = 0; i < 50; i += 1) {
    let batch: PublicVehicle[] = [];
    let hasMore = false;
    try {
      const res = await fetchDealerInventory(
        site.website.dealerId,
        { limit: perBatch, cursor, sort: "newest" },
        3600,
      );
      batch = res.data;
      hasMore = res.pagination?.hasMore ?? false;
      cursor = res.pagination?.cursor ?? undefined;
    } catch {
      break;
    }
    vehicles.push(...batch);
    if (!hasMore || batch.length === 0) break;
  }

  const staticEntries = STATIC_PATHS.map((p) =>
    urlEntry(
      `${origin}${p.path}`,
      now,
      p.changefreq,
      p.priority,
    ),
  );
  const vehicleEntries = vehicles
    .filter((v) => v.stockNumber || v.id)
    .map((v) =>
      urlEntry(
        `${origin}/inventory/${v.stockNumber ?? v.id}`,
        new Date(v.updatedAt ?? v.createdAt ?? now.toISOString()),
        "daily",
        0.8,
      ),
    );

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...staticEntries,
    ...vehicleEntries,
    "</urlset>",
    "",
  ].join("\n");

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
