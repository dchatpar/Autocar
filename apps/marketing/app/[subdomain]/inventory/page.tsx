/**
 * Inventory list — filterable, paginated, grid + list toggle.
 *
 * Reads `searchParams` from the URL for filters (no client state),
 * so every filter is shareable as a link. ISR revalidates every
 * 60s so newly added vehicles show up without a redeploy.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  resolveDealerSiteBySubdomain,
  fetchDealerInventory,
  type PublicVehicle,
} from "@/lib/api";
import { FilterBar } from "@/components/FilterBar";
import { VehicleCard, VehicleListRow } from "@/components/VehicleCard";
import { BreadcrumbSchema } from "@/components/SEO";
import { siteOrigin } from "@/lib/api";
import { formatPrice } from "@/lib/utils";

interface PageProps {
  params: Promise<{ subdomain: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const REVALIDATE_SECONDS = Number(
  process.env.INVENTORY_REVALIDATE_SECONDS ?? 60,
);

const PAGE_SIZE = 24;

function pickString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function pickNumber(v: string | string[] | undefined): number | undefined {
  const s = pickString(v);
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export default async function InventoryPage({
  params,
  searchParams,
}: PageProps): Promise<React.ReactElement> {
  const { subdomain } = await params;
  const sp = await searchParams;
  const site = await resolveDealerSiteBySubdomain(subdomain);
  if (!site) notFound();

  const base = `/${subdomain}/inventory`;
  const origin = siteOrigin(site.website.subdomain);

  // Parse filters from URL.
  const view = pickString(sp.view) === "list" ? "list" : "grid";
  const make = pickString(sp.make);
  const condition = pickString(sp.condition);
  const bodyStyle = pickString(sp.bodyStyle);
  const minPrice = pickNumber(sp.minPrice);
  const maxPrice = pickNumber(sp.maxPrice);
  const maxMileage = pickNumber(sp.maxMileage);
  const searchText = pickString(sp.search);
  const sort = pickString(sp.sort) as
    | "newest"
    | "price-asc"
    | "price-desc"
    | "mileage-asc"
    | "year-desc"
    | undefined;
  const cursor = pickString(sp.cursor);
  const page = Math.max(1, pickNumber(sp.page) ?? 1);

  // Fetch a page of vehicles. Use cursor pagination if the API
  // supports it; for the first render we just take PAGE_SIZE * page.
  let vehicles: PublicVehicle[] = [];
  let totalApprox = 0;
  let hasMore = false;
  try {
    const res = await fetchDealerInventory(
      site.website.dealerId,
      {
        make,
        bodyStyle,
        condition: condition as "NEW" | "USED" | "CERTIFIED" | undefined,
        minPrice,
        maxPrice,
        maxMileage,
        search: searchText,
        sort: sort ?? "newest",
        cursor,
        limit: PAGE_SIZE,
      },
      REVALIDATE_SECONDS,
    );
    vehicles = res.data;
    totalApprox = res.pagination?.total ?? vehicles.length;
    hasMore = res.pagination?.hasMore ?? false;
  } catch {
    vehicles = [];
  }

  // Distinct make / bodyStyle lists for the filter dropdowns.
  const makes = Array.from(new Set(vehicles.map((v) => v.make))).sort();
  const bodyStyles = Array.from(
    new Set(vehicles.map((v) => v.bodyStyle).filter((x): x is string => Boolean(x))),
  ).sort();

  const origin2 = origin;
  void formatPrice; // utility re-exported for header consumption

  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Home", url: `${origin2}/` },
          { name: "Inventory", url: `${origin2}/inventory` },
        ]}
      />

      <section className="container-marketing py-10 md:py-12">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold md:text-4xl">Inventory</h1>
            <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
              {totalApprox > 0
                ? `${totalApprox} vehicle${totalApprox === 1 ? "" : "s"} available`
                : "No vehicles match your filters yet."}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link
              href={makeViewHref(sp, base, "grid")}
              className={`rounded-md px-3 py-1.5 ${view === "grid" ? "font-semibold underline" : "text-[color:var(--ink-muted)]"}`}
              aria-current={view === "grid" ? "page" : undefined}
            >
              Grid
            </Link>
            <Link
              href={makeViewHref(sp, base, "list")}
              className={`rounded-md px-3 py-1.5 ${view === "list" ? "font-semibold underline" : "text-[color:var(--ink-muted)]"}`}
              aria-current={view === "list" ? "page" : undefined}
            >
              List
            </Link>
          </div>
        </header>

        <div className="mb-6">
          <FilterBar basePath={base} makes={makes} bodyStyles={bodyStyles} />
        </div>

        {vehicles.length === 0 ? (
          <div className="card text-center">
            <p className="text-base font-semibold">No vehicles match those filters.</p>
            <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
              Try widening your search, or{" "}
              <Link href={base} className="underline">
                reset all filters
              </Link>
              .
            </p>
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {vehicles.map((v) => (
              <VehicleCard
                key={v.id}
                vehicle={v}
                subdomain={site.website.subdomain}
              />
            ))}
          </div>
        ) : (
          <div
            className="card divide-y p-0"
            style={{ borderColor: "var(--border-default)" }}
          >
            {vehicles.map((v) => (
              <VehicleListRow
                key={v.id}
                vehicle={v}
                subdomain={site.website.subdomain}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        <nav
          className="mt-8 flex items-center justify-between text-sm"
          aria-label="Pagination"
        >
          <Link
            href={makePageHref(sp, base, Math.max(1, page - 1))}
            className={`btn-secondary ${page <= 1 ? "pointer-events-none opacity-50" : ""}`}
            aria-disabled={page <= 1}
          >
            ← Previous
          </Link>
          <span className="text-[color:var(--ink-muted)]">Page {page}</span>
          <Link
            href={makePageHref(sp, base, page + 1)}
            className={`btn-secondary ${!hasMore ? "pointer-events-none opacity-50" : ""}`}
            aria-disabled={!hasMore}
          >
            Next →
          </Link>
        </nav>
      </section>
    </>
  );
}

function makeViewHref(
  sp: Record<string, string | string[] | undefined>,
  base: string,
  view: "grid" | "list",
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "view") continue;
    if (v === undefined) continue;
    if (Array.isArray(v)) params.set(k, v.join(","));
    else params.set(k, v);
  }
  if (view === "list") params.set("view", "list");
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

function makePageHref(
  sp: Record<string, string | string[] | undefined>,
  base: string,
  nextPage: number,
): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "page") continue;
    if (v === undefined) continue;
    if (Array.isArray(v)) params.set(k, v.join(","));
    else params.set(k, v);
  }
  if (nextPage > 1) params.set("page", String(nextPage));
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

// We render this server-side; the FilterBar is a client component
// used inside. Suspense boundaries are unnecessary here, but the
// import is kept consistent with the rest of the app.
void Suspense;
