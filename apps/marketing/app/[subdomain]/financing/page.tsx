/**
 * Financing page — credit app form. Includes an explainer of the
 * financing process and (optionally) a vehicle context for the
 * `?stockNumber=…&vehicleId=…` deep link from a VDP.
 */

import { notFound } from "next/navigation";
import { resolveDealerSiteBySubdomain, fetchDealerVehicleByStock } from "@/lib/api";
import { FinanceApplicationForm } from "@/components/FinanceApplicationForm";
import { formatPrice } from "@/lib/utils";

interface PageProps {
  params: Promise<{ subdomain: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pickString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export default async function FinancingPage({
  params,
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const { subdomain } = await params;
  const sp = await searchParams;
  const site = await resolveDealerSiteBySubdomain(subdomain);
  if (!site) notFound();

  const stockNumber = pickString(sp.stockNumber);
  const vehicleId = pickString(sp.vehicleId);

  // If we came from a VDP, pre-fetch the vehicle so the page can
  // show "Applying for: 2024 Ford F-150 ($35,900)" at the top.
  let vehicle = null;
  if (stockNumber) {
    try {
      vehicle = await fetchDealerVehicleByStock(site.website.dealerId, stockNumber);
    } catch {
      vehicle = null;
    }
  }

  return (
    <section className="container-marketing py-10 md:py-14">
      <h1 className="text-3xl font-bold md:text-4xl">Get pre-approved for financing</h1>
      <p className="mt-2 text-sm text-[color:var(--ink-muted)]">
        Apply online and a finance specialist will reach out with personalised
        terms — usually within one business day.
      </p>

      {vehicle ? (
        <div className="mt-6 card flex flex-wrap items-center gap-4">
          {vehicle.primaryPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={vehicle.primaryPhotoUrl}
              alt=""
              className="h-20 w-28 rounded-md object-cover"
            />
          ) : null}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[color:var(--ink-muted)]">You&rsquo;re applying for</p>
            <p className="text-base font-semibold">
              {vehicle.year} {vehicle.make} {vehicle.model}
              {vehicle.trim ? <span className="text-[color:var(--ink-muted)]"> {vehicle.trim}</span> : null}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[color:var(--ink-muted)]">Price</p>
            <p className="text-lg font-bold">
              {formatPrice(
                vehicle.pricing?.internetPrice ?? vehicle.pricing?.askingPrice ?? null,
              )}
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-8 grid gap-8 md:grid-cols-[1fr_1.4fr]">
        <aside className="space-y-4 text-sm">
          <h2 className="text-base font-semibold">How it works</h2>
          <ol className="list-decimal space-y-2 pl-5 text-[color:var(--ink-muted)]">
            <li>Fill out the application — it takes about 2 minutes.</li>
            <li>A finance specialist reviews your application and pulls a soft credit report.</li>
            <li>We email you personalised terms from one of our lending partners.</li>
            <li>Pick the offer that works for you and schedule a time to sign.</li>
          </ol>
          <p className="rounded-md border p-3 text-xs" style={{ borderColor: "var(--border-default)" }}>
            <strong>Privacy:</strong> Your information is encrypted in transit and
            shared only with the lenders we work with. We never sell your data.
          </p>
        </aside>

        <FinanceApplicationForm
          subdomain={subdomain}
          vehicleStockNumber={stockNumber ?? vehicle?.stockNumber ?? undefined}
          vehicleId={vehicleId ?? vehicle?.id ?? undefined}
          pageName="Financing"
        />
      </div>
    </section>
  );
}

export const revalidate = 60;
