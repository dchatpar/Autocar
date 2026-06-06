/**
 * Apex domain landing — served when the marketing app receives a
 * request at the bare host (e.g. dealeros.com) without a
 * subdomain. The middleware already short-circuits reserved
 * subdomains (`www`, `app`, ...) to this same path.
 *
 * Renders a marketing splash for the platform itself: "DealerOS
 * powers your public website — claim your subdomain".
 */

import Link from "next/link";

export const metadata = {
  title: "DealerOS — Public websites for car dealers",
  description:
    "DealerOS provides every dealer with a public website, SEO-optimised inventory pages, and lead-capture forms. Get your subdomain and start selling.",
};

export default function ApexLanding(): React.ReactElement {
  return (
    <main className="min-h-screen bg-[color:var(--surface-bg)]">
      <header className="border-b" style={{ borderColor: "var(--border-default)" }}>
        <div className="container-marketing flex h-16 items-center justify-between">
          <div className="text-lg font-bold">DealerOS</div>
          <a
            href="https://app.dealeros.com/signup"
            className="btn-primary text-sm"
          >
            Get started
          </a>
        </div>
      </header>

      <section className="container-marketing py-20 text-center md:py-28">
        <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[color:var(--brand-accent)]">
          Public dealer websites, done right
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-extrabold md:text-5xl">
          Your inventory, your brand, your domain.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-[color:var(--ink-muted)]">
          DealerOS auto-generates a SEO-friendly public website for every
          dealership on the platform — with full inventory pages, schema.org
          markup, sitemap, and a Google Vehicle Listings feed.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a href="https://app.dealeros.com/signup" className="btn-primary">
            Claim your subdomain
          </a>
          <Link href="/acme/inventory" className="btn-secondary">
            See a demo dealer
          </Link>
        </div>
      </section>

      <section className="container-marketing grid gap-6 py-12 md:grid-cols-3">
        <div className="card">
          <h2 className="text-lg font-semibold">SEO built-in</h2>
          <p className="mt-2 text-sm text-[color:var(--ink-muted)]">
            Per-vehicle schema.org/Vehicle, OpenGraph, canonical URLs,
            sitemap, and an inventory RSS feed for Google Vehicle Listings.
          </p>
        </div>
        <div className="card">
          <h2 className="text-lg font-semibold">Lead capture</h2>
          <p className="mt-2 text-sm text-[color:var(--ink-muted)]">
            Built-in contact + finance application forms. Submissions land
            directly in the CRM with source=&lsquo;website_form&rsquo;.
          </p>
        </div>
        <div className="card">
          <h2 className="text-lg font-semibold">Custom theme</h2>
          <p className="mt-2 text-sm text-[color:var(--ink-muted)]">
            Per-dealer logo, brand color, hero image, footer links, and a
            custom CNAME domain.
          </p>
        </div>
      </section>
    </main>
  );
}
