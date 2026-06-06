/**
 * Subdomain routing middleware.
 *
 * Goal: a request to `acme.dealeros.com/inventory` should behave as
 * if the user navigated to `/acme/inventory` inside this app.
 *
 * Strategy:
 *   1. Read the Host header.
 *   2. Strip the marketing root domain (`dealeros.com` by default,
 *      configurable via `NEXT_PUBLIC_MARKETING_ROOT_DOMAIN`).
 *   3. Whatever remains is the subdomain.
 *   4. If the subdomain is empty or matches a reserved name
 *      (`www`, `app`, `api`, `admin`), do nothing (the apex domain
 *      landing page handles it).
 *   5. Otherwise, rewrite the URL to `/{subdomain}{pathname}`.
 *
 * Custom CNAME domains (`www.acme-cars.com`) are NOT handled here —
 * the host header check would not match the root domain. The apex
 * layout calls the API to look up the custom domain and 404s
 * gracefully. To support custom domains in production, deploy a
 * separate wildcard certificate and a thin edge worker that
 * rewrites the Host to a synthetic subdomain before this
 * middleware runs.
 *
 * In local dev (`NEXT_PUBLIC_DISABLE_SUBDOMAIN_CHECK=1`), the
 * middleware is a pass-through so devs can hit
 * `http://localhost:3000/acme/inventory` directly.
 */

import { NextRequest, NextResponse } from "next/server";

const ROOT_DOMAIN = (
  process.env.NEXT_PUBLIC_MARKETING_ROOT_DOMAIN ?? "dealeros.com"
).toLowerCase();

const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  "www",
  "app",
  "api",
  "admin",
  "cdn",
  "mail",
  "static",
  "assets",
  "status",
  "docs",
  "blog",
]);

const DISABLE_CHECK = process.env.NEXT_PUBLIC_DISABLE_SUBDOMAIN_CHECK === "1";

/**
 * Extract the subdomain from a Host header. Handles the localhost
 * dev case (where the Host is `localhost:3000` and we don't have
 * a subdomain at all).
 */
function extractSubdomain(host: string | null): string | null {
  if (!host) return null;
  if (DISABLE_CHECK) return null;

  // Strip port.
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";

  // Localhost: no subdomain.
  if (hostname === "localhost" || hostname === "127.0.0.1") return null;

  // Must end in ROOT_DOMAIN.
  if (!hostname.endsWith(`.${ROOT_DOMAIN}`)) {
    // Could be a bare CNAME'd custom domain. The [subdomain]
    // route handler will resolve it via the API.
    return null;
  }

  // Strip the root domain suffix.
  const sub = hostname.slice(0, hostname.length - ROOT_DOMAIN.length - 1);
  if (!sub) return null;
  if (RESERVED_SUBDOMAINS.has(sub)) return null;

  // Validate: lowercase alphanumeric + hyphens.
  if (!/^[a-z0-9-]{2,40}$/.test(sub)) return null;

  return sub;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const host = request.headers.get("host");
  const subdomain = extractSubdomain(host);

  // No subdomain → pass through (apex domain landing).
  if (!subdomain) {
    return NextResponse.next();
  }

  // Already prefixed with the subdomain (manual dev URL) — pass
  // through. This lets us hit `/acme/inventory` directly in dev.
  if (pathname.startsWith(`/${subdomain}`)) {
    return NextResponse.next();
  }

  // Special-case Next internals and static assets.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Rewrite `/inventory` → `/acme/inventory`.
  const url = request.nextUrl.clone();
  url.pathname = `/${subdomain}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url, {
    headers: {
      "x-dealer-subdomain": subdomain,
      // Tell downstream caches the response is per-subdomain.
      "vary": "Host",
    },
  });
}

/**
 * Run on every path except Next internals and static files.
 * Subdomain rewriting only makes sense for HTML pages; the
 * matcher keeps the middleware cost down.
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     *   /_next/static, /_next/image, /favicon.ico, /robots.txt,
     *   /sitemap.xml, anything with a file extension.
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)",
  ],
};
