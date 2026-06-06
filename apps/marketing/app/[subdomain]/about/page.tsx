/**
 * About page — long-form about-us content sourced from
 * themeConfig.aboutText, plus dealer contact / hours / address.
 */

import { notFound } from "next/navigation";
import { resolveDealerSiteBySubdomain } from "@/lib/api";
import { AutoDealerSchema } from "@/components/SEO";
import { siteOrigin } from "@/lib/api";

interface PageProps {
  params: Promise<{ subdomain: string }>;
}

export default async function AboutPage({
  params,
}: PageProps): Promise<React.ReactElement> {
  const { subdomain } = await params;
  const site = await resolveDealerSiteBySubdomain(subdomain);
  if (!site) notFound();

  const theme = site.website.themeConfig ?? {};
  const address = theme.address;
  const origin = siteOrigin(site.website.subdomain);

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
        <h1 className="text-3xl font-bold md:text-4xl">About {site.dealer.name}</h1>
        <p className="mt-2 text-sm text-[color:var(--ink-muted)]">
          Family-owned and customer-focused since day one.
        </p>

        <div className="mt-8 grid gap-8 md:grid-cols-3">
          <div className="md:col-span-2">
            {theme.aboutText ? (
              <p className="whitespace-pre-line text-base leading-relaxed">
                {theme.aboutText}
              </p>
            ) : (
              <p className="text-[color:var(--ink-muted)]">
                {site.dealer.name} is part of the DealerOS network — a growing
                community of independent dealerships using modern tools to make
                car buying easier, faster, and pressure-free. Our team is
                dedicated to transparency, fair pricing, and supporting our
                customers long after the sale.
              </p>
            )}

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="card text-center">
                <p className="text-3xl font-extrabold" style={{ color: "var(--brand-primary)" }}>4.8★</p>
                <p className="mt-1 text-sm text-[color:var(--ink-muted)]">Average review</p>
              </div>
              <div className="card text-center">
                <p className="text-3xl font-extrabold" style={{ color: "var(--brand-primary)" }}>10k+</p>
                <p className="mt-1 text-sm text-[color:var(--ink-muted)]">Cars sold</p>
              </div>
              <div className="card text-center">
                <p className="text-3xl font-extrabold" style={{ color: "var(--brand-primary)" }}>24h</p>
                <p className="mt-1 text-sm text-[color:var(--ink-muted)]">Avg response time</p>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="card">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--ink-muted)]">
                Contact
              </h2>
              {address?.line1 ? (
                <p className="mt-2 text-sm">
                  {address.line1}
                  {address.line2 ? <><br />{address.line2}</> : null}
                  {address.city ? <><br />{address.city}{address.region ? `, ${address.region}` : ""} {address.postal ?? ""}</> : null}
                </p>
              ) : null}
              {theme.phone ? (
                <p className="mt-3 text-sm">
                  <a href={`tel:${theme.phone.replace(/[^0-9+]/g, "")}`}>{theme.phone}</a>
                </p>
              ) : null}
              {theme.email ? (
                <p className="text-sm">
                  <a href={`mailto:${theme.email}`}>{theme.email}</a>
                </p>
              ) : null}
            </div>

            {theme.hours && theme.hours.length > 0 ? (
              <div className="card">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[color:var(--ink-muted)]">
                  Hours
                </h2>
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
        </div>
      </section>
    </>
  );
}

export const revalidate = 60;
