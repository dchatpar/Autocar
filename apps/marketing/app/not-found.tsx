/**
 * 404 — dealer site not found.
 */

import Link from "next/link";

export default function NotFound(): React.ReactElement {
  return (
    <main className="container-marketing flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-[color:var(--brand-accent)]">
        404
      </p>
      <h1 className="text-3xl font-extrabold md:text-4xl">Dealer site not found</h1>
      <p className="mt-3 max-w-md text-[color:var(--ink-muted)]">
        We couldn&rsquo;t find a public website at this address. The dealer may
        not have published their site yet, or the URL might be misspelled.
      </p>
      <div className="mt-6 flex gap-2">
        <Link href="/" className="btn-primary">
          Go to DealerOS home
        </Link>
        <a href="https://app.dealeros.com" className="btn-secondary">
          Sign in
        </a>
      </div>
    </main>
  );
}
