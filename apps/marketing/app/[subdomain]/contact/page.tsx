/**
 * Contact page — phone, address, hours, and the lead-capture form.
 * Supports a `?stockNumber=…&vehicleId=…` query so the contact
 * form is pre-bound to a vehicle when the user clicks "Request
 * more info" from a VDP.
 */

import { notFound } from "next/navigation";
import { resolveDealerSiteBySubdomain } from "@/lib/api";
import { ContactForm } from "@/components/ContactForm";
import { AutoDealerSchema } from "@/components/SEO";

interface PageProps {
  params: Promise<{ subdomain: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pickString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function ContactPage({
  params,
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const { subdomain } = await params;
  const sp = await searchParams;
  const site = await resolveDealerSiteBySubdomain(subdomain);
  if (!site) notFound();

  const theme = site.website.themeConfig ?? {};
  const address = theme.address;
  const stockNumber = pickString(sp.stockNumber);
  const vehicleId = pickString(sp.vehicleId);

  return (
    <>
      <AutoDealerSchema
        dealerName={site.dealer.name}
        dealerSubdomain={site.website.subdomain}
        phone={theme.phone}
        email={theme.email}
        address={address}
      />

      <section className="container-marketing py-10 md:py-14">
        <h1 className="text-3xl font-bold md:text-4xl">Contact {site.dealer.name}</h1>
        <p className="mt-2 text-sm text-[color:var(--ink-muted)]">
          We&rsquo;re here to help. Send us a message and a real person (not a bot)
          will get back to you within one business day.
        </p>

        <div className="mt-8 grid gap-8 md:grid-cols-[1fr_1.4fr]">
          <aside className="space-y-4">
            {theme.phone ? (
              <div className="card">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--ink-muted)]">Call</h2>
                <p className="mt-2">
                  <a className="text-lg font-bold" href={`tel:${theme.phone.replace(/[^0-9+]/g, "")}`}>
                    {theme.phone}
                  </a>
                </p>
              </div>
            ) : null}

            {theme.email ? (
              <div className="card">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--ink-muted)]">Email</h2>
                <p className="mt-2">
                  <a href={`mailto:${theme.email}`} className="text-lg font-bold">
                    {theme.email}
                  </a>
                </p>
              </div>
            ) : null}

            {address?.line1 ? (
              <div className="card">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--ink-muted)]">Visit</h2>
                <p className="mt-2 text-sm">
                  {address.line1}
                  {address.line2 ? <><br />{address.line2}</> : null}
                  {address.city ? <><br />{address.city}{address.region ? `, ${address.region}` : ""} {address.postal ?? ""}</> : null}
                </p>
              </div>
            ) : null}

            {theme.hours && theme.hours.length > 0 ? (
              <div className="card">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--ink-muted)]">Hours</h2>
                <ul className="mt-2 space-y-1 text-sm">
                  {theme.hours.map((h, idx) => (
                    <li key={`${h.day}-${idx}`} className="flex justify-between gap-4">
                      <span>{h.day}</span>
                      <span>{h.open} – {h.close}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>

          <ContactForm
            subdomain={subdomain}
            vehicleStockNumber={stockNumber}
            vehicleId={vehicleId}
            pageName="Contact"
          />
        </div>
      </section>
    </>
  );
}

export const revalidate = 60;
