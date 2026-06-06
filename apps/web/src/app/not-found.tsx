import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Home, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found — DealerOS",
  description: "The page you are looking for could not be found.",
};

/**
 * Root 404 — Next.js App Router renders this when no route matches.
 * Server component (no client interactivity required).
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col">
      <header className="px-6 sm:px-10 py-5">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary rounded-md"
          aria-label="DealerOS home"
        >
          <span
            aria-hidden="true"
            className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center text-bg-primary font-bold text-lg"
          >
            D
          </span>
          <span className="font-semibold text-text-primary text-lg tracking-tight">
            DealerOS
          </span>
        </Link>
      </header>

      <main
        role="main"
        className="flex-1 flex flex-col items-center justify-center text-center px-6"
      >
        {/* 404 numeral — large, with subtle accent for the "0" */}
        <div
          className="font-mono text-[8rem] sm:text-[10rem] leading-none font-bold tracking-tighter text-text-muted/30 select-none"
          aria-hidden="true"
        >
          4
          <span className="text-accent">0</span>
          4
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary -mt-4">
          Page not found
        </h1>
        <p className="text-sm text-text-muted mt-2 max-w-md leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist, was moved, or the
          link is broken. Check the URL or head back to the dashboard.
        </p>

        <div className="mt-7 flex flex-col sm:flex-row items-center gap-3">
          <Link href="/">
            <Button variant="primary" size="md">
              <Home className="h-4 w-4" />
              Go to dashboard
            </Button>
          </Link>
          <Link href="/leads">
            <Button variant="secondary" size="md">
              <Search className="h-4 w-4" />
              Browse leads
            </Button>
          </Link>
        </div>

        <div className="mt-10 flex flex-col items-center gap-1.5 text-xs text-text-muted">
          <span>Need help?</span>
          <Link
            href="/support"
            className="text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            Contact support
          </Link>
        </div>
      </main>

      <footer className="px-6 sm:px-10 py-5 text-center text-xs text-text-muted">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to home
        </Link>
      </footer>
    </div>
  );
}
