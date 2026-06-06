/**
 * Hero — the homepage banner. Reads themeConfig.heroImage, hero
 * title, subtitle, and CTA. Falls back to dealer name + a generic
 * "Browse our inventory" pitch if the dealer hasn't configured it.
 */

import Link from "next/link";
import type { ThemeConfig } from "@/lib/api";

interface HeroProps {
  dealerName: string;
  subdomain: string;
  theme: ThemeConfig;
}

export function Hero({ dealerName, subdomain, theme }: HeroProps): React.ReactElement {
  const title = theme.heroTitle ?? `Find your next car at ${dealerName}`;
  const subtitle =
    theme.heroSubtitle ??
    "Browse our full inventory of new and pre-owned vehicles. Apply for financing online, schedule a test drive, or request a personalized quote — all from your phone.";
  const ctaText = theme.heroCtaText ?? "Browse inventory";
  const ctaHref = theme.heroCtaHref ?? `/${subdomain}/inventory`;
  const heroImage = theme.heroImage;

  return (
    <section
      className="relative isolate overflow-hidden"
      aria-label={`${dealerName} hero`}
    >
      {/* Background image, with a dark overlay for text legibility */}
      {heroImage ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={heroImage}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 -z-10 h-full w-full object-cover"
          />
          <div
            className="absolute inset-0 -z-10"
            style={{
              background:
                "linear-gradient(180deg, rgba(10,12,15,0.55) 0%, rgba(10,12,15,0.85) 100%)",
            }}
          />
        </>
      ) : (
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "linear-gradient(135deg, var(--brand-primary) 0%, color-mix(in oklab, var(--brand-primary) 60%, var(--brand-accent)) 100%)",
          }}
        />
      )}

      <div className="container-marketing py-20 md:py-28">
        <div className="max-w-2xl text-white">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[color:var(--brand-accent)]">
            Welcome to {dealerName}
          </p>
          <h1 className="text-4xl font-extrabold leading-tight md:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-white/80">{subtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={ctaHref} className="btn-primary">
              {ctaText}
            </Link>
            <Link
              href={`/${subdomain}/financing`}
              className="inline-flex items-center justify-center rounded-lg border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/20"
            >
              Get pre-approved
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
