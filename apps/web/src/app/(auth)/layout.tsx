import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Sign in — DealerOS",
};

/**
 * Auth layout — used by /login, /signup, /forgot-password, /reset-password.
 * No sidebar, no top bar; just a centered, branded shell.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col">
      <header className="px-6 sm:px-10 py-5">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary rounded-md"
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

      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-8">
        {children}
      </main>

      <footer className="px-6 sm:px-10 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-text-muted">
        <span>© {new Date().getFullYear()} DealerOS. All rights reserved.</span>
        <div className="flex items-center gap-4">
          <Link
            href="/privacy"
            className="hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            Terms
          </Link>
          <Link
            href="/support"
            className="hover:text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          >
            Support
          </Link>
        </div>
      </footer>
    </div>
  );
}
