"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Root error boundary — required by Next.js 15 App Router.
 * Catches any uncaught error in the route tree at or below this file.
 * Server vs client: must be a client component.
 */
export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log to console + any monitoring endpoint.
    // eslint-disable-next-line no-console
    console.error("[GlobalErrorBoundary]", error);
  }, [error]);

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
        role="alert"
        className="flex-1 flex flex-col items-center justify-center text-center px-6"
      >
        <div
          className="h-16 w-16 rounded-2xl bg-danger/15 text-danger flex items-center justify-center mb-6"
          aria-hidden="true"
        >
          <AlertTriangle className="h-8 w-8" />
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
          Something went wrong
        </h1>
        <p className="text-sm text-text-muted mt-2 max-w-md leading-relaxed">
          An unexpected error prevented this page from loading. Our team has been
          notified. You can try again, or head back to the dashboard.
        </p>

        {error.message && (
          <details className="mt-5 max-w-lg w-full text-left">
            <summary className="text-xs text-text-muted cursor-pointer hover:text-text-primary transition-colors select-none">
              Technical details
            </summary>
            <pre className="mt-2 rounded-lg border border-border bg-bg-card p-3 text-xs text-text-muted overflow-auto max-h-48 whitespace-pre-wrap break-words font-mono">
              {error.message}
              {error.digest ? `\n\nDigest: ${error.digest}` : ""}
            </pre>
          </details>
        )}

        <div className="mt-7 flex flex-col sm:flex-row items-center gap-3">
          <Button variant="primary" size="md" onClick={reset}>
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
          <Link href="/">
            <Button variant="secondary" size="md">
              <Home className="h-4 w-4" />
              Go to dashboard
            </Button>
          </Link>
        </div>

        <div className="mt-10 text-xs text-text-muted">
          If this keeps happening,{" "}
          <Link
            href="/support"
            className="text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            contact support
          </Link>
          .
        </div>
      </main>

      <footer className="px-6 sm:px-10 py-5 text-center text-xs text-text-muted">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") window.history.back();
          }}
          className="inline-flex items-center gap-1.5 hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Go back
        </button>
      </footer>
    </div>
  );
}
