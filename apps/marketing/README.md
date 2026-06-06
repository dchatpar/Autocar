# DealerOS Marketing App

Public-facing white-label dealer websites served at
`{subdomain}.dealeros.com` (or a CNAME'd custom domain).

This is a **separate Next.js 15 app** from `apps/web` — it
ships zero auth UI, zero CRM UI, and is optimised for SEO and
edge caching.

## Stack

- Next.js 15 (App Router)
- React 19
- TypeScript strict mode
- Zod for input validation
- Plain CSS (no Tailwind) — single design token file in
  `app/globals.css` overridable per-dealer
- No client-side state (searchParams + server components)

## Running

```bash
# From the monorepo root, with pnpm:
pnpm install
pnpm --filter @dealeros/marketing dev

# Or directly:
cd apps/marketing
npm install
npm run dev
```

Required env (see `.env.example`):

- `API_BASE_URL` — internal URL of the main DealerOS API
  (default `http://localhost:3001`).
- `NEXT_PUBLIC_MARKETING_ROOT_DOMAIN` — root domain for
  subdomain resolution (default `dealeros.com`).
- `NEXT_PUBLIC_DISABLE_SUBDOMAIN_CHECK=1` — for local dev on
  `http://localhost:3000` so you can hit `/{subdomain}/...`
  directly.

## Routes

| Path                                  | Render     | Notes                                       |
|---------------------------------------|------------|---------------------------------------------|
| `/`                                   | Static     | Apex landing                                |
| `/[subdomain]`                        | ISR (60s)  | Dealer homepage                             |
| `/[subdomain]/inventory`              | ISR (60s)  | Filterable list, grid + list view           |
| `/[subdomain]/inventory/[stock]`      | ISR (60s)  | Vehicle detail (SEO + JSON-LD VehicleOffer) |
| `/[subdomain]/about`                  | ISR (60s)  | About-us long form                          |
| `/[subdomain]/contact`                | ISR (60s)  | Contact form (lead capture)                 |
| `/[subdomain]/financing`              | ISR (60s)  | Credit-app form                             |
| `/[subdomain]/sitemap.xml`            | ISR (1h)   | Vehicle URLs                                |
| `/[subdomain]/robots.txt`             | ISR (1d)   | Per-dealer crawl policy                     |
| `/[subdomain]/feed.xml`               | ISR (1h)   | Google Vehicle Listings RSS                  |
| `POST /api/lead`                      | Dynamic    | Proxy to API                                |
| `POST /api/finance-application`       | Dynamic    | Proxy to API                                |

## Subdomain Routing

`middleware.ts` rewrites `{subdomain}.dealeros.com/foo` to
`/{subdomain}/foo` inside the app. In local dev with
`NEXT_PUBLIC_DISABLE_SUBDOMAIN_CHECK=1`, you can navigate to
`http://localhost:3000/acme/inventory` directly.

Custom CNAME domains are resolved server-side via the
`/public/dealer-website/by-host/:host` API endpoint and
return 404 if the host isn't bound to a dealer.

## SEO

- Per-page `<title>`, meta description, OpenGraph, canonical
- VehicleOffer JSON-LD on VDPs (schema.org/Vehicle + Offer)
- AutoDealer JSON-LD on every page (via the layout)
- BreadcrumbList JSON-LD
- Sitemap lists every available vehicle
- feed.xml is a Google Vehicle Listings RSS feed
- robots.txt respects `isPublished` (unpublished sites disallow
  crawling)

## Performance

- ISR with `revalidate = 60` for the inventory + VDP pages
- ISR with `revalidate = 3600` for sitemap + feed
- All dealer theme tokens are CSS variables so theming is
  one extra `<style>` tag, no FOUC, no JS hydration cost
- `<img loading="lazy" decoding="async" />` everywhere
- Per-dealer cache tags (`site:<subdomain>`, `host:<host>`)
  so a config change in the CRM can invalidate the
  marketing-app cache via `revalidateTag()`

## Security

- All forms are Zod-validated server-side
- `/api/lead` and `/api/finance-application` are per-IP rate
  limited (in-memory; swap for Upstash/Redis in prod)
- Security headers in `next.config.js` (X-Frame-Options,
  X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
- The lead/finance routes verify the URL subdomain matches
  the body subdomain, so a form on Site A can't post into
  Site B's lead stream
