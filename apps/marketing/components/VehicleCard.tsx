/**
 * VehicleCard — used in grid and list views. Shows the primary
 * photo, key specs (year / make / model / trim), price, mileage,
 * condition badge, and a "days on lot" indicator.
 *
 * Server component. Image is rendered via <img> rather than
 * next/image so the marketing app can ship without a per-dealer
 * image loader (the CDN URL is opaque to the platform).
 */

import Link from "next/link";
import type { PublicVehicle } from "@/lib/api";
import { formatPrice, formatMileage, formatCondition, daysSince } from "@/lib/utils";

interface VehicleCardProps {
  vehicle: PublicVehicle;
  subdomain: string;
}

export function VehicleCard({ vehicle, subdomain }: VehicleCardProps): React.ReactElement {
  const stockHref = vehicle.stockNumber
    ? `/inventory/${vehicle.stockNumber}`
    : `/inventory/${vehicle.id}`;
  const href = `/${subdomain}${stockHref}`;
  const price = vehicle.pricing?.internetPrice ?? vehicle.pricing?.askingPrice ?? null;
  const isSold = vehicle.status !== "AVAILABLE";
  const days = daysSince(vehicle.createdAt);
  const agedDays = days >= 30;
  const veryAged = days >= 60;

  return (
    <Link
      href={href}
      className="group card flex flex-col overflow-hidden transition-shadow hover:shadow-lg"
      aria-label={`${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ""}`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-[color:var(--surface-elevated)]">
        {vehicle.primaryPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vehicle.primaryPhotoUrl}
            alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-[color:var(--ink-muted)]">
            No photo
          </div>
        )}

        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          <span
            className={`badge ${isSold ? "opacity-70" : ""}`}
            style={
              isSold
                ? { backgroundColor: "var(--ink-muted)", color: "white", border: "none" }
                : { backgroundColor: "var(--brand-accent)", color: "var(--brand-primary)", border: "none" }
            }
          >
            {isSold ? vehicle.status : formatCondition(vehicle.condition)}
          </span>
          {agedDays ? (
            <span
              className="badge"
              style={
                veryAged
                  ? { backgroundColor: "#ef4444", color: "white", border: "none" }
                  : { backgroundColor: "#f97316", color: "white", border: "none" }
              }
            >
              {veryAged ? `${days}d aged` : `${days}d on lot`}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-1 text-base font-semibold">
          {vehicle.year} {vehicle.make} {vehicle.model}
        </h3>
        {vehicle.trim ? (
          <p className="line-clamp-1 text-sm text-[color:var(--ink-muted)]">{vehicle.trim}</p>
        ) : null}
        <div className="mt-auto flex items-end justify-between pt-3">
          <div className="text-lg font-bold" style={{ color: "var(--brand-primary)" }}>
            {formatPrice(price)}
          </div>
          <div className="text-xs text-[color:var(--ink-muted)]">
            {formatMileage(vehicle.mileage)}
          </div>
        </div>
      </div>
    </Link>
  );
}

/**
 * VehicleListRow — compact table-row variant for the list view.
 */
export function VehicleListRow({
  vehicle,
  subdomain,
}: VehicleCardProps): React.ReactElement {
  const stockHref = vehicle.stockNumber
    ? `/inventory/${vehicle.stockNumber}`
    : `/inventory/${vehicle.id}`;
  const href = `/${subdomain}${stockHref}`;
  const price = vehicle.pricing?.internetPrice ?? vehicle.pricing?.askingPrice ?? null;
  const isSold = vehicle.status !== "AVAILABLE";

  return (
    <Link
      href={href}
      className="grid grid-cols-[120px_1fr_auto] items-center gap-4 border-b p-3 transition-colors hover:bg-[color:var(--surface-card)]"
      style={{ borderColor: "var(--border-default)" }}
    >
      <div className="aspect-[4/3] overflow-hidden rounded-md bg-[color:var(--surface-elevated)]">
        {vehicle.primaryPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vehicle.primaryPhotoUrl}
            alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[color:var(--ink-muted)]">
            —
          </div>
        )}
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">
          {vehicle.year} {vehicle.make} {vehicle.model}
        </div>
        {vehicle.trim ? (
          <div className="truncate text-xs text-[color:var(--ink-muted)]">
            {vehicle.trim} • {formatMileage(vehicle.mileage)}
          </div>
        ) : (
          <div className="truncate text-xs text-[color:var(--ink-muted)]">
            {formatMileage(vehicle.mileage)}
          </div>
        )}
        <div className="mt-1 flex flex-wrap gap-1.5">
          <span className="badge">{formatCondition(vehicle.condition)}</span>
          {isSold ? (
            <span
              className="badge"
              style={{ backgroundColor: "var(--ink-muted)", color: "white", border: "none" }}
            >
              {vehicle.status}
            </span>
          ) : null}
        </div>
      </div>

      <div className="text-right">
        <div className="text-base font-bold" style={{ color: "var(--brand-primary)" }}>
          {formatPrice(price)}
        </div>
        <div className="text-xs text-[color:var(--ink-muted)]">View details →</div>
      </div>
    </Link>
  );
}
