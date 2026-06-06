/**
 * Google Vehicle Listings feed (XML) — feed.xml
 *
 * Reference: https://developers.google.com/search/docs/appearance/structured-data/vehicle-listing
 *
 * Required top-level fields:
 *   - <title>, <link>, <description>
 *   - One <item> per vehicle, with the Google Vehicle Listings
 *     required fields (make, model, year, vin, mileage, price,
 *     body_style, fuel_type, transmission, drivetrain, exterior_color,
 *     interior_color, images, url).
 *
 * Notes:
 *   - `condition` is required and must be one of `new`, `used`, or
 *     `certified`.
 *   - `price` is the listed internet price. Falls back to asking
 *     price. "Contact for price" vehicles are skipped — Google
 *     rejects entries with a price of 0 or missing currency.
 *   - `availability` is `in_stock` for available vehicles,
 *     `out_of_stock` otherwise.
 */

import { resolveDealerSiteBySubdomain, fetchDealerInventory, type PublicVehicle } from "@/lib/api";
import { siteOrigin } from "@/lib/api";

export const revalidate = 3600; // 1 hour
export const dynamic = "force-static";

interface RouteContext {
  params: Promise<{ subdomain: string }>;
}

const CONDITION_MAP: Record<string, "new" | "used" | "certified"> = {
  NEW: "new",
  USED: "used",
  CERTIFIED: "certified",
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function mediaUrls(vehicle: PublicVehicle): string[] {
  const urls: string[] = [];
  if (vehicle.primaryPhotoUrl) urls.push(vehicle.primaryPhotoUrl);
  for (const m of vehicle.media ?? []) {
    if (m.cdnUrl && m.cdnUrl !== vehicle.primaryPhotoUrl) urls.push(m.cdnUrl);
  }
  return urls;
}

function vehicleItemXml(vehicle: PublicVehicle, origin: string): string {
  const condition = CONDITION_MAP[vehicle.condition] ?? "used";
  const price = vehicle.pricing?.internetPrice ?? vehicle.pricing?.askingPrice ?? null;
  const availability = vehicle.status === "AVAILABLE" ? "in_stock" : "out_of_stock";
  const url = `${origin}/inventory/${vehicle.stockNumber ?? vehicle.id}`;
  const imageUrl = vehicle.primaryPhotoUrl ?? "";
  const images = mediaUrls(vehicle);

  // Skip vehicles with no usable price.
  if (!price || price <= 0) return "";

  const parts: string[] = [
    "  <item>",
    `    <vehicle_id>${escapeXml(vehicle.id)}</vehicle_id>`,
    `    <vin>${escapeXml(vehicle.vin)}</vin>`,
    `    <year>${vehicle.year}</year>`,
    `    <make>${escapeXml(vehicle.make)}</make>`,
    `    <model>${escapeXml(vehicle.model)}</model>`,
    vehicle.trim ? `    <trim>${escapeXml(vehicle.trim)}</trim>` : "",
    `    <condition>${condition}</condition>`,
    `    <price currency="USD">${price.toFixed(2)}</price>`,
    `    <availability>${availability}</availability>`,
    `    <url>${escapeXml(url)}</url>`,
    imageUrl ? `    <image url="${escapeXml(imageUrl)}" />` : "",
    ...images.slice(1).map((u) => `    <additional_image url="${escapeXml(u)}" />`),
    vehicle.bodyStyle ? `    <body_style>${escapeXml(vehicle.bodyStyle)}</body_style>` : "",
    vehicle.mileage !== null && vehicle.mileage !== undefined
      ? `    <mileage unit="mi">${vehicle.mileage}</mileage>`
      : "",
    vehicle.fuelType ? `    <fuel_type>${escapeXml(vehicle.fuelType)}</fuel_type>` : "",
    vehicle.transmission ? `    <transmission>${escapeXml(vehicle.transmission)}</transmission>` : "",
    vehicle.drivetrain ? `    <drivetrain>${escapeXml(vehicle.drivetrain)}</drivetrain>` : "",
    vehicle.exteriorColor ? `    <exterior_color>${escapeXml(vehicle.exteriorColor)}</exterior_color>` : "",
    vehicle.interiorColor ? `    <interior_color>${escapeXml(vehicle.interiorColor)}</interior_color>` : "",
    vehicle.stockNumber ? `    <stock_number>${escapeXml(vehicle.stockNumber)}</stock_number>` : "",
    "  </item>",
  ];
  return parts.filter(Boolean).join("\n");
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { subdomain } = await context.params;
  const site = await resolveDealerSiteBySubdomain(subdomain);
  if (!site || !site.website.isPublished) {
    return new Response("Not found", { status: 404 });
  }
  const origin = siteOrigin(site.website.subdomain);

  // Pull all available vehicles (with paging).
  const vehicles: PublicVehicle[] = [];
  let cursor: string | undefined = undefined;
  for (let i = 0; i < 50; i += 1) {
    let batch: PublicVehicle[] = [];
    let hasMore = false;
    try {
      const res = await fetchDealerInventory(
        site.website.dealerId,
        { limit: 500, cursor, sort: "newest" },
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

  const items = vehicles
    .map((v) => vehicleItemXml(v, origin))
    .filter((s) => s.length > 0)
    .join("\n");

  const now = new Date().toUTCString();
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "  <channel>",
    `    <title>${escapeXml(site.dealer.name)} — Inventory Feed</title>`,
    `    <link>${escapeXml(origin)}</link>`,
    `    <description>Vehicle inventory for ${escapeXml(site.dealer.name)}, generated by DealerOS.</description>`,
    `    <lastBuildDate>${now}</lastBuildDate>`,
    items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
