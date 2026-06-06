/**
 * Public Pricing — /pricing
 *
 * Marketing page. Four tiers + FAQ. Lives outside the authenticated
 * AppShell (the AppShell wrapper in `components/providers/AuthBoundary`
 * already exempts pricing pages from the sidebar shell).
 *
 * The CTA button uses a client island to call
 * /api/billing/create-checkout-session and redirect to Stripe.
 */

import { PricingClient } from "./PricingClient";

export const metadata = {
  title: "Pricing — DealerOS",
  description:
    "Starter, Growth, Pro, and Enterprise plans for automotive dealerships. 14-day free trial, cancel anytime.",
};

const FAQ = [
  {
    q: "Is there a free trial?",
    a: "Yes — every plan includes a 14-day free trial. No credit card required to start, and you can cancel at any time before the trial ends.",
  },
  {
    q: "Can I switch plans later?",
    a: "Yes. Upgrades are prorated immediately and reflected on your next invoice. Downgrades take effect at the end of the current billing period.",
  },
  {
    q: "What counts toward my lead limit?",
    a: "Any new lead ingested into DealerOS — from Meta Lead Ads, Google, your website, walk-ins, phone-ups, or manual entry. We deduplicate, so the same person twice in a month counts once.",
  },
  {
    q: "Do SMS and email usage reset every month?",
    a: "Yes. Both reset on the first of the month in your local timezone. Unused messages don't roll over.",
  },
  {
    q: "What happens if I exceed my plan limits?",
    a: "We never block your data. You'll see an in-app banner recommending an upgrade. Once you cross 110% of a cap, the action that would push you over shows an upgrade prompt instead of going through.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from the dashboard or the Stripe Customer Portal. Your subscription stays active until the end of the current billing period, then downgrades to read-only.",
  },
  {
    q: "Do you offer custom pricing?",
    a: "Yes — Enterprise plans support custom volume, SLAs, SSO, and on-prem options. Contact sales to scope a plan.",
  },
  {
    q: "How does billing work?",
    a: "All plans are billed monthly in USD via Stripe. You'll get a PDF invoice by email and can download past invoices from the dashboard at any time.",
  },
];

const FEATURE_MATRIX = [
  {
    group: "Team",
    rows: [
      { feature: "Staff users", values: ["3", "10", "Unlimited", "Unlimited"] },
      { feature: "Roles & permissions", values: [true, true, true, true] },
      { feature: "Activity log retention", values: ["30d", "1y", "3y", "Custom"] },
    ],
  },
  {
    group: "CRM & leads",
    rows: [
      { feature: "Leads / month", values: ["200", "1,000", "10,000", "Unlimited"] },
      { feature: "AI lead scoring", values: [false, true, true, true] },
      { feature: "AI lead routing", values: [false, true, true, true] },
      { feature: "Customer duplicate detection", values: [false, true, true, true] },
    ],
  },
  {
    group: "Comms",
    rows: [
      { feature: "SMS / month", values: ["200", "2,000", "10,000", "Unlimited"] },
      { feature: "Emails / month", values: ["500", "5,000", "50,000", "Unlimited"] },
      { feature: "WhatsApp Business", values: [false, true, true, true] },
      { feature: "AI reply drafts", values: [false, true, true, true] },
    ],
  },
  {
    group: "Inventory & deals",
    rows: [
      { feature: "Inventory items", values: ["100", "1,000", "Unlimited", "Unlimited"] },
      { feature: "Multi-rooftop inventory", values: [false, false, true, true] },
      { feature: "BHPH in-house financing", values: [false, true, true, true] },
      { feature: "DocuSign e-sign", values: [false, true, true, true] },
    ],
  },
  {
    group: "Ads & analytics",
    rows: [
      { feature: "Meta CAPI sync", values: [false, true, true, true] },
      { feature: "Google Ads sync", values: [false, true, true, true] },
      { feature: "AI tokens / month", values: ["10K", "100K", "1M", "Custom"] },
      { feature: "Custom automations", values: [false, false, true, true] },
    ],
  },
  {
    group: "Support & security",
    rows: [
      { feature: "Support", values: ["Email", "Priority email", "Dedicated CSM", "White-glove"] },
      { feature: "SSO / SAML", values: [false, false, true, true] },
      { feature: "Uptime SLA", values: ["—", "99.5%", "99.9%", "99.95%"] },
      { feature: "On-prem / private cloud", values: [false, false, false, true] },
    ],
  },
] as const;

function cellRender(v: string | boolean) {
  if (v === true) {
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent/20 text-accent"
        aria-label="Included"
      >
        ✓
      </span>
    );
  }
  if (v === false) {
    return (
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-bg-elevated text-text-muted"
        aria-label="Not included"
      >
        —
      </span>
    );
  }
  return <span className="text-sm text-text-primary tabular-nums">{v}</span>;
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      <PricingClient />
      <FeatureMatrix />
      <FaqSection />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Feature matrix                                                     */
/* ------------------------------------------------------------------ */

function FeatureMatrix() {
  return (
    <section className="border-t border-border bg-bg-primary">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-text-primary mb-2">
          Compare every feature
        </h2>
        <p className="text-text-muted mb-8">
          The full breakdown across Starter, Growth, Pro, and Enterprise.
        </p>
        <div className="overflow-x-auto rounded-xl border border-border bg-bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="py-4 px-4 font-medium">Feature</th>
                <th className="py-4 px-4 font-medium text-center">Starter</th>
                <th className="py-4 px-4 font-medium text-center">Growth</th>
                <th className="py-4 px-4 font-medium text-center">Pro</th>
                <th className="py-4 px-4 font-medium text-center">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {FEATURE_MATRIX.map((g) => (
                <FeatureGroup key={g.group} group={g.group} rows={g.rows} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function FeatureGroup({
  group,
  rows,
}: {
  group: string;
  rows: ReadonlyArray<{ feature: string; values: ReadonlyArray<string | boolean> }>;
}) {
  return (
    <>
      <tr className="bg-bg-elevated/50">
        <td
          colSpan={5}
          className="py-3 px-4 text-xs uppercase tracking-wider text-text-muted font-semibold"
        >
          {group}
        </td>
      </tr>
      {rows.map((r) => (
        <tr key={r.feature} className="border-b border-border/50 last:border-0">
          <td className="py-3 px-4 text-text-primary">{r.feature}</td>
          {r.values.map((v, i) => (
            <td key={i} className="py-3 px-4 text-center">
              {cellRender(v)}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* FAQ                                                                */
/* ------------------------------------------------------------------ */

function FaqSection() {
  return (
    <section className="border-t border-border bg-bg-primary">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-text-primary mb-2">
          Frequently asked
        </h2>
        <p className="text-text-muted mb-8">
          Still deciding? Here are the answers to the questions we get most.
        </p>
        <div className="space-y-4">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group rounded-xl border border-border bg-bg-card p-5"
            >
              <summary className="flex items-center justify-between cursor-pointer text-text-primary font-medium list-none">
                <span>{item.q}</span>
                <span
                  aria-hidden="true"
                  className="text-text-muted group-open:rotate-45 transition-transform"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-text-muted text-sm leading-relaxed">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
