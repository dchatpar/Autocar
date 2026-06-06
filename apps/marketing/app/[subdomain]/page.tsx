/**
 * Dealer homepage.
 *
 * Sections:
 *   1. Hero (theme-driven)
 *   2. Featured inventory (latest 6 available vehicles)
 *   3. About snippet (themeConfig.aboutText)
 *   4. Hours + contact (themeConfig.hours + .address/.phone/.email)
 *   5. Lead-capture CTA
 *
 * SSG with ISR (revalidate 60s) so the homepage stays current with
 * new inventory without rebuilding the whole site.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveDealerSiteBySubdomain, fetchDealerInventory } from "@/lib/api";
import { Hero } from "@/components/Hero";
import { VehicleCard } from "@/components/VehicleCard";
import { ContactForm } from "@/components/ContactForm";
import { AutoDealerSchema, BreadcrumbSchema } from "@/components/SEO";
import { siteOrigin } from "@/lib/api";
import { formatPrice } from "@/lib/utils";

interface PageProps {
  params: Promise<{ subdomain: string }>;
}

const REVALIDATE_SECONDS = Number(
  process.env.INVENTORY_REVALIDATE_SECONDS ?? 60,
);

export default async function DealerHomePage({
  params,
}: PageProps): Promise<React.ReactElement> {
  const { subdomain } = await params;
  const site = await resolveDealerSiteBySubdomain(subdomain);
  if (!site) notFound();

  const base = `/${subdomain}`;
  const origin = siteOrigin(site.website.subdomain);

  // Featured inventory — pull the 6 most recent available vehicles.
  let featured: Awaited<ReturnType<typeof fetchDealerInventory>>["data"] = [];
  try {
    const res = await fetchDealerInventory(
      site.website.dealerId,
      { limit: 6, sort: "newest" },
      REVALIDATE_SECONDS,
    );
    featured = res.data;
  } catch {
    // The marketing site must not 500 if the inventory endpoint
    // is briefly unavailable. Show the empty state.
    featured = [];
  }

  const theme = site.website.themeConfig ?? {};
  const address = theme.address;

  return (
    <>
      <AutoDealerSchema
        dealerName={site.dealer.name}
        dealerSubdomain={site.website.subdomain}
        phone={theme.phone}
        email={theme.email}
        address={address}
      />
      <BreadcrumbSchema
        items={[{ name: "Home", url: `${origin}/` }]}
      />

      <Hero
        dealerName={site.dealer.name}
        subdomain={subdomain}
        theme={theme}
      />

      {/* Featured inventory */}
      <section className="container-marketing py-12 md:py-16">
        <div className="mb-6 flex items-end justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold md:text-3xl">Featured inventory</h2>
            <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
              Hand-picked vehicles from our latest arrivals.
            </p>
          </div>
          <Link href={`${base}/inventory`} className="text-sm font-semibold underline">
            See all inventory →
          </Link>
        </div>

        {featured.length === 0 ? (
          <div className="card text-center text-sm text-[color:var(--ink-muted)]">
            No vehicles in stock right now. Check back soon, or{" "}
            <Link href={`${base}/contact`} className="underline">
              get in touch
            </Link>{" "}
            to be notified when new arrivals hit the lot.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((v) => (
              <VehicleCard
                key={v.id}
                vehicle={v}
                subdomain={site.website.subdomain}
              />
            ))}
          </div>
        )}
      </section>

      {/* About snippet */}
      {theme.aboutText ? (
        <section className="container-marketing py-12 md:py-16">
          <div className="card grid gap-8 md:grid-cols-2">
            <div>
              <h2 className="text-2xl font-bold md:text-3xl">About {site.dealer.name}</h2>
              <p className="mt-3 whitespace-pre-line text-base text-[color:var(--ink-muted)]">
                {theme.aboutText}
              </p>
              <Link href={`${base}/about`} className="mt-4 inline-block text-sm font-semibold underline">
                Read more →
              </Link>
            </div>
            {(address?.line1 || theme.phone || theme.hours?.length) ? (
              <div className="space-y-3 text-sm">
                {address?.line1 ? (
                  <div>
                    <h3 className="font-semibold">Address</h3>
                    <p className="text-[color:var(--ink-muted)]">
                      {address.line1}
                      {address.line2 ? <><br />{address.line2}</> : null}
                      {address.city ? <><br />{address.city}{address.region ? `, ${address.region}` : ""} {address.postal ?? ""}</> : null}
                    </p>
                  </div>
                ) : null}
                {theme.phone ? (
                  <div>
                    <h3 className="font-semibold">Phone</h3>
                    <p>
                      <a href={`tel:${theme.phone.replace(/[^0-9+]/g, "")}`}>{theme.phone}</a>
                    </p>
                  </div>
                ) : null}
                {theme.hours && theme.hours.length > 0 ? (
                  <div>
                    <h3 className="font-semibold">Hours</h3>
                    <ul className="text-[color:var(--ink-muted)]">
                      {theme.hours.map((h, idx) => (
                        <li key={`${h.day}-${idx}`} className="flex justify-between gap-4">
                          <span>{h.day}</span>
                          <span>{h.open} – {h.close}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* CTA / Contact form */}
      <section className="container-marketing py-12 md:py-16">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold md:text-3xl">Ready to make a move?</h2>
            <p className="mt-3 text-base text-[color:var(--ink-muted)]">
              Send us a message and we&rsquo;ll get back to you with personalised
              recommendations, financing options, and test-drive availability.
            </p>
            <ul className="mt-6 space-y-2 text-sm">
              <li>✓ No-pressure, no-spam follow-up</li>
              <li>✓ Get pre-approved in minutes</li>
              <li>✓ Schedule a test drive at your convenience</li>
            </ul>
            <p className="mt-4 text-sm">
              Or jump straight to{" "}
              <Link href={`${base}/financing`} className="font-semibold underline">
                our finance application
              </Link>
              .
            </p>
          </div>
          <ContactForm subdomain={subdomain} pageName="Homepage" />
        </div>
      </section>
    </>
  );
}
