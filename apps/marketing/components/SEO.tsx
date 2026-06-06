/**
 * SEO — per-page <head> overrides, including the schema.org
 * VehicleOffer JSON-LD for vehicle detail pages.
 *
 * Used inside page components to inject vehicle-specific structured
 * data. The base metadata (title, OG, canonical) is already in
 * place via the layout's `generateMetadata`; this component layers
 * on additional JSON-LD scripts.
 */

import type { PublicVehicle } from "@/lib/api";
import { siteOrigin } from "@/lib/api";
import { formatPrice } from "@/lib/utils";

interface BaseSEOProps {
  title?: string;
  description?: string;
  canonical?: string;
  noindex?: boolean;
}

/**
 * Wrap arbitrary JSON as a JSON-LD <script>. Escape the closing
 * `</script>` to keep the page valid.
 */
function jsonLdScript(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return json;
}

export function PageMeta(props: BaseSEOProps): React.ReactElement {
  // For now we rely on Next.js Metadata API. This component is a
  // placeholder for future client-side meta manipulation.
  return <></>;
}

interface VehicleOfferSchemaProps {
  vehicle: PublicVehicle;
  dealerName: string;
  dealerSubdomain: string;
  dealerPhone?: string;
  dealerAddress?: {
    line1?: string;
    city?: string;
    region?: string;
    postal?: string;
  };
}

/**
 * VehicleOffer — schema.org structured data for a single vehicle.
 * Emitted into the page's <head> so Google can render rich results
 * (price badge, mileage, availability) directly in SERPs.
 *
 * Reference: https://schema.org/Vehicle
 *            https://developers.google.com/search/docs/appearance/structured-data/vehicle-listing
 */
export function VehicleOfferSchema({
  vehicle,
  dealerName,
  dealerSubdomain,
  dealerPhone,
  dealerAddress,
}: VehicleOfferSchemaProps): React.ReactElement {
  const origin = siteOrigin(dealerSubdomain);
  const url = `${origin}/inventory/${vehicle.stockNumber ?? vehicle.id}`;
  const price = vehicle.pricing?.internetPrice ?? vehicle.pricing?.askingPrice ?? null;
  const offer: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Vehicle",
    name: `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ""}`,
    brand: { "@type": "Brand", name: vehicle.make },
    model: vehicle.model,
    vehicleModelDate: vehicle.year,
    vehicleConfiguration: vehicle.trim ?? undefined,
    vehicleInteriorColor: vehicle.interiorColor ?? undefined,
    vehicleExteriorColor: vehicle.exteriorColor ?? undefined,
    fuelType: vehicle.fuelType ?? undefined,
    vehicleTransmission: vehicle.transmission ?? undefined,
    driveWheelConfiguration: vehicle.drivetrain ?? undefined,
    vehicleEngine: vehicle.engine ?? undefined,
    bodyType: vehicle.bodyStyle ?? undefined,
    mileageFromOdometer: vehicle.mileage
      ? {
          "@type": "QuantitativeValue",
          value: vehicle.mileage,
          unitCode: "SMI",
          unitText: "miles",
        }
      : undefined,
    vehicleIdentificationNumber: vehicle.vin,
    url,
    image: vehicle.primaryPhotoUrl ?? undefined,
  };
  if (price && price > 0) {
    offer.offers = {
      "@type": "Offer",
      price,
      priceCurrency: "USD",
      availability:
        vehicle.status === "AVAILABLE"
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      url,
      seller: {
        "@type": "AutoDealer",
        name: dealerName,
        url: origin,
        ...(dealerPhone ? { telephone: dealerPhone } : {}),
        ...(dealerAddress
          ? {
              address: {
                "@type": "PostalAddress",
                streetAddress: dealerAddress.line1,
                addressLocality: dealerAddress.city,
                addressRegion: dealerAddress.region,
                postalCode: dealerAddress.postal,
              },
            }
          : {}),
      },
    };
  }
  // Drop undefined keys (they'd be emitted as `undefined` in JSON).
  const clean = JSON.parse(JSON.stringify(offer)) as Record<string, unknown>;

  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: jsonLdScript(clean) }}
    />
  );
}

interface OrganizationSchemaProps {
  dealerName: string;
  dealerSubdomain: string;
  phone?: string;
  email?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    region?: string;
    postal?: string;
    country?: string;
  };
}

/**
 * AutoDealer — schema.org organization data, used in the root
 * layout of every dealer site so Google can render a Knowledge
 * Graph card with hours, phone, and address.
 */
export function AutoDealerSchema({
  dealerName,
  dealerSubdomain,
  phone,
  email,
  address,
}: OrganizationSchemaProps): React.ReactElement {
  const origin = siteOrigin(dealerSubdomain);
  const payload = {
    "@context": "https://schema.org",
    "@type": "AutoDealer",
    name: dealerName,
    url: origin,
    ...(phone ? { telephone: phone } : {}),
    ...(email ? { email } : {}),
    ...(address
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: [address.line1, address.line2].filter(Boolean).join(", "),
            addressLocality: address.city,
            addressRegion: address.region,
            postalCode: address.postal,
            addressCountry: address.country ?? "US",
          },
        }
      : {}),
  };
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: jsonLdScript(payload) }}
    />
  );
}

interface BreadcrumbSchemaProps {
  items: Array<{ name: string; url: string }>;
}

export function BreadcrumbSchema({ items }: BreadcrumbSchemaProps): React.ReactElement {
  const payload = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: it.name,
      item: it.url,
    })),
  };
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: jsonLdScript(payload) }}
    />
  );
}
