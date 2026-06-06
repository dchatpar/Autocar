/**
 * Marketing-app utility helpers.
 */

import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Conditional class name helper. Tailwind-aware: later utilities
 * override earlier ones (e.g. `cn("p-2", "p-4")` → `"p-4"`).
 */
export function cn(...inputs: ReadonlyArray<ClassValue>): string {
  return twMerge(clsx(inputs));
}

/**
 * Format a number as USD currency. No locale-aware symbol logic
 * (the dealer-facing app is the only one that cares); we just
 * prefix with `$` and add thousands separators.
 */
export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) return "Contact for price";
  if (value <= 0) return "Contact for price";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/**
 * Format an integer mileage with thousands separators.
 */
export function formatMileage(miles: number | null | undefined): string {
  if (miles === null || miles === undefined) return "—";
  return `${miles.toLocaleString("en-US")} mi`;
}

/**
 * Title-case a condition enum value. e.g. 'CERTIFIED' → 'Certified'.
 */
export function formatCondition(condition: string | null | undefined): string {
  if (!condition) return "";
  return condition
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Calculate days since a given date string. Returns 0 for invalid
 * or future dates.
 */
export function daysSince(dateIso: string | null | undefined): number {
  if (!dateIso) return 0;
  const then = new Date(dateIso).getTime();
  if (Number.isNaN(then)) return 0;
  const now = Date.now();
  return Math.max(0, Math.floor((now - then) / (1000 * 60 * 60 * 24)));
}

/**
 * Build a search-friendly text blob from a vehicle row.
 */
export function vehicleSearchText(v: {
  make: string;
  model: string;
  year: number;
  trim: string | null;
  vin: string;
  stockNumber: string | null;
}): string {
  return [v.make, v.model, v.year, v.trim, v.vin, v.stockNumber ?? ""]
    .filter(Boolean)
    .join(" ");
}

/**
 * Build a VehicleOffer URL-friendly slug.
 */
export function vehicleSlug(v: {
  year: number;
  make: string;
  model: string;
  trim: string | null;
  stockNumber: string | null;
}): string {
  const parts = [v.year, v.make, v.model, v.trim].filter(Boolean);
  const base = parts.join("-").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  return v.stockNumber ? `${base}-${v.stockNumber.toLowerCase()}` : base;
}

/**
 * Format an ISO date as a human-friendly string for footers and
 * the "listed X days ago" badge.
 */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  const days = daysSince(iso);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}
