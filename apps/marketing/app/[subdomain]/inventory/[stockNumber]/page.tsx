/**
 * Vehicle detail page.
 *
 * URL: /{subdomain}/inventory/{stockNumber}
 *
 * SEO:
 *   - Title: "{year} {make} {model} {trim} for sale at {dealer}"
 *   - Description: auto-generated from specs + price
 *   - JSON-LD: schema.org/Vehicle with full VehicleOffer
 *   - Canonical URL
 *
 * ISR: revalidate every 60s so price changes, status flips, and
 * new photos propagate quickly.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { resolveDealerSiteBySubdomain, fetchDealerVehicleByStock, type PublicVehicle } from "@/lib/api";
import { ContactForm } from "@/components/ContactForm";
import { VehicleOfferSchema, BreadcrumbSchema } from "@/components/SEO";
import { siteOrigin } from "@/lib/api";
import {
  formatPrice,
  formatMileage,
  formatCondition,
} from "@/lib/utils";

interface PageProps {
  params: Promise<{ subdomain: string; stockNumber: string }>;
}

const REVALIDATE_SECONDS = Number(
  process.env.INVENTORY_REVALIDATE_SECONDS ?? 60,
);

function buildDescription(vehicle: PublicVehicle, dealerName: string): string {
  const price = vehicle.pricing?.internetPrice ?? vehicle.pricing?.askingPrice ?? null;
  const parts: string[] = [];
  parts.push(`${vehicle.year} ${vehicle.make} ${vehicle.model}`);
  if (vehicle.trim) parts.push(vehicle.trim);
  if (vehicle.condition) parts.push(formatCondition(vehicle.condition));
  if (vehicle.mileage !== null && vehicle.mileage !== undefined) {
    parts.push(`with ${vehicle.mileage.toLocaleString("en-US")} miles`);
  }
  parts.push(`for sale at ${dealerName}.`);
  if (price && price > 0) {
    parts.push(`Priced at $${price.toLocaleString("en-US")}.`);
  }
  if (vehicle.exteriorColor) parts.push(`Exterior: ${vehicle.exteriorColor}.`);
  return parts.join(" ");
}

export async function generateMetadata({
  params,
}: PageProps): Promise<import("next").Metadata> {
  const { subdomain, stockNumber } = await params;
  const site = await resolveDealerSiteBySubdomain(subdomain);
  if (!site) return { title: "Vehicle not found" };

  const vehicle = await fetchDealerVehicleByStock(site.website.dealerId, stockNumber);
  if (!vehicle) {
    return {
      title: "Vehicle not found",
      description: `That vehicle is no longer in stock at ${site.dealer.name}.`,
      robots: { index: false, follow: true },
    };
  }

  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ""} for sale at ${site.dealer.name}`;
  const description = buildDescription(vehicle, site.dealer.name);
  const origin = siteOrigin(site.website.subdomain);
  const url = `${origin}/inventory/${stockNumber}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      siteName: site.dealer.name,
      title,
      description,
      ...(vehicle.primaryPhotoUrl
        ? { images: [{ url: vehicle.primaryPhotoUrl, width: 1200, height: 900, alt: title }] }
        : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(vehicle.primaryPhotoUrl ? { images: [vehicle.primaryPhotoUrl] } : {}),
    },
  };
}

export default async function VehicleDetailPage({
  params,
}: PageProps): Promise<React.ReactElement> {
  const { subdomain, stockNumber } = await params;
  const site = await resolveDealerSiteBySubdomain(subdomain);
  if (!site) notFound();

  const vehicle = await fetchDealerVehicleByStock(site.website.dealerId, stockNumber);
  if (!vehicle) notFound();

  const theme = site.website.themeConfig ?? {};
  const price = vehicle.pricing?.internetPrice ?? vehicle.pricing?.askingPrice ?? null;
  const isSold = vehicle.status !== "AVAILABLE";
  const origin = siteOrigin(site.website.subdomain);

  const specs: Array<{ label: string; value: string | null | undefined }> = [
    { label: "Stock #", value: vehicle.stockNumber },
    { label: "VIN", value: vehicle.vin },
    { label: "Year", value: String(vehicle.year) },
    { label: "Make", value: vehicle.make },
    { label: "Model", value: vehicle.model },
    { label: "Trim", value: vehicle.trim },
    { label: "Body style", value: vehicle.bodyStyle },
    { label: "Mileage", value: formatMileage(vehicle.mileage) },
    { label: "Exterior", value: vehicle.exteriorColor },
    { label: "Interior", value: vehicle.interiorColor },
    { label: "Engine", value: vehicle.engine },
    { label: "Transmission", value: vehicle.transmission },
    { label: "Drivetrain", value: vehicle.drivetrain },
    { label: "Fuel type", value: vehicle.fuelType },
    { label: "Condition", value: formatCondition(vehicle.condition) },
  ];

  return (
    <>
      <VehicleOfferSchema
        vehicle={vehicle}
        dealerName={site.dealer.name}
        dealerSubdomain={site.website.subdomain}
        dealerPhone={theme.phone}
        dealerAddress={theme.address}
      />
      <BreadcrumbSchema
        items={[
          { name: "Home", url: `${origin}/` },
          { name: "Inventory", url: `${origin}/inventory` },
          {
            name: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
            url: `${origin}/inventory/${stockNumber}`,
          },
        ]}
      />

      <section className="container-marketing py-8 md:py-10">
        <nav className="mb-4 text-sm text-[color:var(--ink-muted)]" aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href={`/${subdomain}`} className="hover:underline">
                Home
              </Link>
            </li>
            <li aria-hidden>›</li>
            <li>
              <Link href={`/${subdomain}/inventory`} className="hover:underline">
                Inventory
              </Link>
            </li>
            <li aria-hidden>›</li>
            <li aria-current="page" className="font-semibold">
              {vehicle.year} {vehicle.make} {vehicle.model}
            </li>
          </ol>
        </nav>

        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr]">
          {/* Gallery */}
          <div>
            <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border bg-[color:var(--surface-elevated)]" style={{ borderColor: "var(--border-default)" }}>
              {vehicle.primaryPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={vehicle.primaryPhotoUrl}
                  alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                  className="h-full w-full object-cover"
                  loading="eager"
                  decoding="async"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-[color:var(--ink-muted)]">
                  No photo
                </div>
              )}
            </div>

            {vehicle.media && vehicle.media.length > 1 ? (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {vehicle.media.slice(0, 8).map((m) => (
                  <div
                    key={m.id}
                    className="aspect-square overflow-hidden rounded-md border"
                    style={{ borderColor: "var(--border-default)" }}
                  >
                    {m.cdnUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.cdnUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Sidebar */}
          <aside className="space-y-4">
            <div className="card">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="badge"
                  style={
                    isSold
                      ? { backgroundColor: "var(--ink-muted)", color: "white", border: "none" }
                      : { backgroundColor: "var(--brand-accent)", color: "var(--brand-primary)", border: "none" }
                  }
                >
                  {isSold ? vehicle.status : formatCondition(vehicle.condition)}
                </span>
                {vehicle.stockNumber ? (
                  <span className="text-xs text-[color:var(--ink-muted)]">Stock #{vehicle.stockNumber}</span>
                ) : null}
              </div>
              <h1 className="mt-3 text-2xl font-bold md:text-3xl">
                {vehicle.year} {vehicle.make} {vehicle.model}
                {vehicle.trim ? <span className="text-[color:var(--ink-muted)]"> {vehicle.trim}</span> : null}
              </h1>
              <div className="mt-2 text-3xl font-extrabold" style={{ color: "var(--brand-primary)" }}>
                {formatPrice(price)}
              </div>
              {vehicle.pricing?.marketValue && price && vehicle.pricing.marketValue > price ? (
                <p className="mt-1 text-xs text-[color:var(--ink-muted)]">
                  Market value ${vehicle.pricing.marketValue.toLocaleString("en-US")} —{" "}
                  <span style={{ color: "#22d3a0" }}>
                    save ${(vehicle.pricing.marketValue - price).toLocaleString("en-US")}
                  </span>
                </p>
              ) : null}

              <div className="mt-5 flex flex-col gap-2">
                <Link
                  href={`/${subdomain}/financing?stockNumber=${encodeURIComponent(vehicle.stockNumber ?? vehicle.id)}&vehicleId=${encodeURIComponent(vehicle.id)}`}
                  className="btn-primary w-full"
                >
                  Apply for financing
                </Link>
                <Link
                  href={`/${subdomain}/contact?stockNumber=${encodeURIComponent(vehicle.stockNumber ?? vehicle.id)}&vehicleId=${encodeURIComponent(vehicle.id)}`}
                  className="btn-secondary w-full"
                >
                  Request more info
                </Link>
                {theme.phone ? (
                  <a
                    href={`tel:${theme.phone.replace(/[^0-9+]/g, "")}`}
                    className="btn-secondary w-full"
                  >
                    Call {theme.phone}
                  </a>
                ) : null}
              </div>
            </div>

            {vehicle.notes ? (
              <div className="card">
                <h3 className="text-sm font-semibold">Seller&rsquo;s notes</h3>
                <p className="mt-2 whitespace-pre-line text-sm text-[color:var(--ink-muted)]">
                  {vehicle.notes}
                </p>
              </div>
            ) : null}
          </aside>
        </div>

        {/* Specs */}
        <section className="mt-10">
          <h2 className="text-xl font-bold">Specifications</h2>
          <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {specs.map((spec) => (
              <div
                key={spec.label}
                className="flex items-center justify-between border-b py-2 text-sm"
                style={{ borderColor: "var(--border-default)" }}
              >
                <dt className="text-[color:var(--ink-muted)]">{spec.label}</dt>
                <dd className="font-medium">{spec.value ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Lead form */}
        <section className="mt-10 grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="text-xl font-bold">Have a question about this vehicle?</h2>
            <p className="mt-2 text-sm text-[color:var(--ink-muted)]">
              Send us a note and a sales rep will get back to you with availability,
              additional photos, and a personalised quote.
            </p>
          </div>
          <ContactForm
            subdomain={subdomain}
            vehicleStockNumber={vehicle.stockNumber ?? undefined}
            vehicleId={vehicle.id}
            pageName={`Vehicle ${vehicle.stockNumber ?? vehicle.id}`}
          />
        </section>
      </section>
    </>
  );
}

// ISR: revalidate every 60s
export const revalidate = 60;
